use std::{
    env,
    fs::{self, OpenOptions},
    net::TcpListener,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
};

use tauri::{AppHandle, Manager, RunEvent, State};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;


#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;


#[derive(Clone, serde::Serialize)]
struct BackendRuntimeInfo {
    endpoint: String,
    log_path: String,
}


struct BackendLaunchConfig {
    current_dir: PathBuf,
    python: PathBuf,
    ffmpeg: PathBuf,
    ffprobe: PathBuf,
    app_data_dir: PathBuf,
    log_path: PathBuf,
    python_home: Option<PathBuf>,
    python_path: Vec<PathBuf>,
    extra_path_entries: Vec<PathBuf>,
}


#[derive(serde::Serialize)]
struct TranscriptDocument {
    path: String,
    content: String,
}


#[derive(Default)]
struct BackendState {
    child: Mutex<Option<Child>>,
    runtime: Mutex<Option<BackendRuntimeInfo>>,
}


fn backend_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("..").join("backend")
}


fn backend_python(backend_dir: &Path) -> PathBuf {
    if let Ok(path) = env::var("AUDIOSCRIBE_BACKEND_PYTHON") {
        return PathBuf::from(path);
    }

    if cfg!(target_os = "windows") {
        return backend_dir.join(".venv").join("Scripts").join("python.exe");
    }

    backend_dir.join(".venv").join("bin").join("python")
}


fn executable_name(base: &str) -> String {
    if cfg!(target_os = "windows") {
        format!("{base}.exe")
    } else {
        base.to_string()
    }
}


fn resolve_command_path(name: &str) -> Option<PathBuf> {
    let candidate = PathBuf::from(name);
    if candidate.components().count() > 1 && candidate.exists() {
        return Some(candidate);
    }

    let path_value = env::var_os("PATH")?;
    let search_names: Vec<String> = if cfg!(target_os = "windows") {
        let lowered = name.to_ascii_lowercase();
        if lowered.ends_with(".exe") {
            vec![name.to_string()]
        } else {
            vec![executable_name(name)]
        }
    } else {
        vec![name.to_string()]
    };

    for dir in env::split_paths(&path_value) {
        for search_name in &search_names {
            let path = dir.join(search_name);
            if path.exists() {
                return Some(path);
            }
        }
    }

    None
}


fn app_backend_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?
        .join("backend");
    fs::create_dir_all(&app_data_dir)
        .map_err(|error| format!("Failed to create app data directory: {error}"))?;
    Ok(app_data_dir)
}


fn bundled_backend_launch_config(app: &AppHandle, app_data_dir: &Path) -> Result<Option<BackendLaunchConfig>, String> {
    let resource_dir = match app.path().resource_dir() {
        Ok(path) => path,
        Err(_) => return Ok(None),
    };

    let backend_dir = resource_dir.join("backend-runtime");
    let python_home = backend_dir.join("python");
    let python = python_home.join(executable_name("python"));
    if !python.exists() {
        return Ok(None);
    }

    let ffmpeg_dir = resource_dir.join("ffmpeg");
    let ffmpeg = ffmpeg_dir.join(executable_name("ffmpeg"));
    let ffprobe = ffmpeg_dir.join(executable_name("ffprobe"));
    if !ffmpeg.exists() || !ffprobe.exists() {
        return Err(format!(
            "Bundled ffmpeg resources are missing at {}",
            ffmpeg_dir.display()
        ));
    }

    let log_path = app_data_dir.join("logs").join("desktop-sidecar.log");
    Ok(Some(BackendLaunchConfig {
        current_dir: backend_dir.clone(),
        python,
        ffmpeg,
        ffprobe,
        app_data_dir: app_data_dir.to_path_buf(),
        log_path,
        python_home: Some(python_home.clone()),
        python_path: vec![backend_dir.join("app"), backend_dir.join("site-packages")],
        extra_path_entries: vec![python_home, ffmpeg_dir],
    }))
}


fn dev_backend_launch_config(app_data_dir: &Path) -> Result<BackendLaunchConfig, String> {
    let backend_dir = backend_root();
    let ffmpeg = env::var("AUDIOSCRIBE_FFMPEG_PATH")
        .ok()
        .map(PathBuf::from)
        .or_else(|| resolve_command_path("ffmpeg"))
        .ok_or_else(|| String::from("ffmpeg executable was not found. Set AUDIOSCRIBE_FFMPEG_PATH before starting the desktop app."))?;
    let ffprobe = env::var("AUDIOSCRIBE_FFPROBE_PATH")
        .ok()
        .map(PathBuf::from)
        .or_else(|| resolve_command_path("ffprobe"))
        .ok_or_else(|| String::from("ffprobe executable was not found. Set AUDIOSCRIBE_FFPROBE_PATH before starting the desktop app."))?;

    Ok(BackendLaunchConfig {
        current_dir: backend_dir.clone(),
        python: backend_python(&backend_dir),
        ffmpeg: ffmpeg.clone(),
        ffprobe: ffprobe.clone(),
        app_data_dir: app_data_dir.to_path_buf(),
        log_path: app_data_dir.join("logs").join("desktop-sidecar.log"),
        python_home: None,
        python_path: Vec::new(),
        extra_path_entries: vec![
            ffmpeg
                .parent()
                .unwrap_or_else(|| Path::new("."))
                .to_path_buf(),
            ffprobe
                .parent()
                .unwrap_or_else(|| Path::new("."))
                .to_path_buf(),
        ],
    })
}


fn resolve_backend_launch_config(app: &AppHandle) -> Result<BackendLaunchConfig, String> {
    let app_data_dir = app_backend_data_dir(app)?;
    if let Some(config) = bundled_backend_launch_config(app, &app_data_dir)? {
        return Ok(config);
    }
    dev_backend_launch_config(&app_data_dir)
}


fn child_is_running(child: &mut Child) -> bool {
    matches!(child.try_wait(), Ok(None))
}


fn reserve_backend_port() -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|error| format!("Failed to reserve backend port: {error}"))?;
    let port = listener
        .local_addr()
        .map_err(|error| format!("Failed to read reserved backend port: {error}"))?
        .port();
    drop(listener);
    Ok(port)
}


fn backend_log_files(log_path: &Path) -> Result<(std::fs::File, std::fs::File), String> {
    let log_dir = log_path.parent().unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(&log_dir)
        .map_err(|error| format!("Failed to create backend log directory: {error}"))?;
    let stdout_file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
        .map_err(|error| format!("Failed to open backend log file: {error}"))?;
    let stderr_file = stdout_file
        .try_clone()
        .map_err(|error| format!("Failed to clone backend log handle: {error}"))?;
    Ok((stdout_file, stderr_file))
}


fn spawn_backend(config: &BackendLaunchConfig, port: u16) -> Result<Child, String> {
    let (stdout_file, stderr_file) = backend_log_files(&config.log_path)?;

    if !config.python.exists() {
        return Err(format!(
            "Backend Python executable was not found at {}. Set AUDIOSCRIBE_BACKEND_PYTHON or create backend/.venv first.",
            config.python.display()
        ));
    }

    let mut command = Command::new(&config.python);
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    command
        .arg("-m")
        .arg("audioscribe.server")
        .current_dir(&config.current_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::from(stdout_file))
        .stderr(Stdio::from(stderr_file))
        .env("PYTHONUTF8", "1")
        .env("PYTHONUNBUFFERED", "1")
        .env("AUDIOSCRIBE_BACKEND_PORT", port.to_string())
        .env("AUDIOSCRIBE_PARENT_PID", std::process::id().to_string())
        .env("AUDIOSCRIBE_APP_DATA_DIR", &config.app_data_dir)
        .env("AUDIOSCRIBE_FFMPEG_PATH", &config.ffmpeg)
        .env("AUDIOSCRIBE_FFPROBE_PATH", &config.ffprobe);

    if let Some(python_home) = &config.python_home {
        command
            .env("PYTHONHOME", python_home)
            .env("PYTHONNOUSERSITE", "1");
    }

    if !config.python_path.is_empty() {
        let python_path = env::join_paths(&config.python_path)
            .map_err(|error| format!("Failed to assemble PYTHONPATH: {error}"))?;
        command.env("PYTHONPATH", python_path);
    }

    if !config.extra_path_entries.is_empty() {
        let mut path_entries = config.extra_path_entries.clone();
        if let Some(existing_path) = env::var_os("PATH") {
            path_entries.extend(env::split_paths(&existing_path));
        }
        let joined_path = env::join_paths(path_entries)
            .map_err(|error| format!("Failed to assemble PATH for backend runtime: {error}"))?;
        command.env("PATH", joined_path);
    }

    command
        .spawn()
        .map_err(|error| format!("Failed to start backend process: {error}"))
}


fn stop_backend(state: &BackendState) {
    if let Ok(mut slot) = state.child.lock() {
        if let Some(mut child) = slot.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
    if let Ok(mut runtime_slot) = state.runtime.lock() {
        *runtime_slot = None;
    }
}


fn transcript_path(path: &str) -> Result<PathBuf, String> {
    let candidate = PathBuf::from(path);
    if !candidate.exists() {
        return Err(format!("Transcript file does not exist: {path}"));
    }
    if !candidate.is_file() {
        return Err(format!("Transcript path is not a file: {path}"));
    }
    Ok(candidate)
}


fn spawn_external(command: &mut Command) -> Result<(), String> {
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Failed to launch external process: {error}"))
}


fn reveal_path_in_system(path: &Path) -> Result<(), String> {
    if cfg!(target_os = "windows") {
        let selection = format!("/select,{}", path.display());
        let mut command = Command::new("explorer");
        command.arg(selection);
        return spawn_external(&mut command);
    }

    if cfg!(target_os = "macos") {
        let mut command = Command::new("open");
        command.args(["-R", path.to_string_lossy().as_ref()]);
        return spawn_external(&mut command);
    }

    let parent = path.parent().unwrap_or(path);
    let mut command = Command::new("xdg-open");
    command.arg(parent);
    spawn_external(&mut command)
}


fn unique_destination_path(destination: &Path) -> PathBuf {
    if !destination.exists() {
        return destination.to_path_buf();
    }

    let parent = destination.parent().unwrap_or_else(|| Path::new("."));
    let stem = destination
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("transcript");
    let extension = destination.extension().and_then(|value| value.to_str());

    for index in 1..=9_999 {
        let filename = match extension {
            Some(extension) if !extension.is_empty() => format!("{stem}{index}.{extension}"),
            _ => format!("{stem}{index}"),
        };
        let candidate = parent.join(filename);
        if !candidate.exists() {
            return candidate;
        }
    }

    destination.to_path_buf()
}


#[tauri::command]
fn ensure_backend_started(app: AppHandle, state: State<'_, BackendState>) -> Result<BackendRuntimeInfo, String> {
    let mut child_slot = state
        .child
        .lock()
        .map_err(|_| String::from("Backend process lock was poisoned"))?;
    let mut runtime_slot = state
        .runtime
        .lock()
        .map_err(|_| String::from("Backend runtime lock was poisoned"))?;

    if let Some(child) = child_slot.as_mut() {
        if child_is_running(child) {
            if let Some(runtime) = runtime_slot.clone() {
                return Ok(runtime);
            }
        }
        *child_slot = None;
        *runtime_slot = None;
    }

    let port = reserve_backend_port()?;
    let launch_config = resolve_backend_launch_config(&app)?;
    let runtime = BackendRuntimeInfo {
        endpoint: format!("http://127.0.0.1:{port}"),
        log_path: launch_config.log_path.to_string_lossy().into_owned(),
    };
    *child_slot = Some(spawn_backend(&launch_config, port)?);
    *runtime_slot = Some(runtime.clone());
    Ok(runtime)
}


#[tauri::command]
fn load_transcript_document(path: String) -> Result<TranscriptDocument, String> {
    let transcript = transcript_path(&path)?;
    let content = fs::read_to_string(&transcript)
        .map_err(|error| format!("Failed to read transcript file: {error}"))?;

    Ok(TranscriptDocument {
        path: transcript.to_string_lossy().into_owned(),
        content,
    })
}


#[tauri::command]
fn export_transcript_document(source_path: String, destination_path: String) -> Result<String, String> {
    let source = transcript_path(&source_path)?;
    let destination = unique_destination_path(&PathBuf::from(destination_path));

    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create export directory: {error}"))?;
    }

    fs::copy(&source, &destination)
        .map_err(|error| format!("Failed to export transcript file: {error}"))?;

    Ok(destination.to_string_lossy().into_owned())
}


#[tauri::command]
fn reveal_transcript_document(path: String) -> Result<(), String> {
    let transcript = transcript_path(&path)?;
    reveal_path_in_system(&transcript)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(BackendState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            ensure_backend_started,
            load_transcript_document,
            export_transcript_document,
            reveal_transcript_document
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if matches!(event, RunEvent::Exit | RunEvent::ExitRequested { .. }) {
                let state = app_handle.state::<BackendState>();
                stop_backend(&state);
            }
        });
}
