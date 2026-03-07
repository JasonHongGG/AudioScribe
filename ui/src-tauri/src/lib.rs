use std::{
    env,
    fs::{self, OpenOptions},
    net::TcpListener,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
};

use tauri::{Manager, RunEvent, State};


#[derive(Clone, serde::Serialize)]
struct BackendRuntimeInfo {
    endpoint: String,
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


fn backend_log_files(backend_dir: &Path) -> Result<(std::fs::File, std::fs::File), String> {
    let log_dir = backend_dir.join("tmp");
    fs::create_dir_all(&log_dir)
        .map_err(|error| format!("Failed to create backend log directory: {error}"))?;
    let stdout_file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_dir.join("desktop-sidecar.log"))
        .map_err(|error| format!("Failed to open backend log file: {error}"))?;
    let stderr_file = stdout_file
        .try_clone()
        .map_err(|error| format!("Failed to clone backend log handle: {error}"))?;
    Ok((stdout_file, stderr_file))
}


fn spawn_backend(port: u16) -> Result<Child, String> {
    let backend_dir = backend_root();
    let python = backend_python(&backend_dir);
    let (stdout_file, stderr_file) = backend_log_files(&backend_dir)?;

    if !python.exists() {
        return Err(format!(
            "Backend Python executable was not found at {}. Set AUDIOSCRIBE_BACKEND_PYTHON or create backend/.venv first.",
            python.display()
        ));
    }

    Command::new(&python)
        .arg("-m")
        .arg("audioscribe.server")
        .current_dir(&backend_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::from(stdout_file))
        .stderr(Stdio::from(stderr_file))
        .env("PYTHONUTF8", "1")
        .env("PYTHONUNBUFFERED", "1")
        .env("AUDIOSCRIBE_BACKEND_PORT", port.to_string())
        .env("AUDIOSCRIBE_PARENT_PID", std::process::id().to_string())
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
fn ensure_backend_started(state: State<'_, BackendState>) -> Result<BackendRuntimeInfo, String> {
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
    let runtime = BackendRuntimeInfo {
        endpoint: format!("http://127.0.0.1:{port}"),
    };
    *child_slot = Some(spawn_backend(port)?);
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
