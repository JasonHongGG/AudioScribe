import logging
import asyncio
import os
import sys
import subprocess
import threading
import uuid
from dataclasses import dataclass

# --- Windows CUDA DLL Fix ---
# nvidia-cublas-cu12 (and similar) installed via pip place DLLs inside
# site-packages/nvidia/*/bin/ which is NOT on the system PATH.
# We must register those directories before CTranslate2/faster-whisper tries to load them.
if sys.platform == "win32":
    try:
        import importlib.util
        _nvidia_spec = importlib.util.find_spec("nvidia")
        if _nvidia_spec and _nvidia_spec.submodule_search_locations:
            for _nvidia_dir in _nvidia_spec.submodule_search_locations:
                from pathlib import Path as _Path
                for _bin_dir in _Path(_nvidia_dir).rglob("bin"):
                    if _bin_dir.is_dir():
                        os.add_dll_directory(str(_bin_dir))
                        os.environ["PATH"] = str(_bin_dir) + os.pathsep + os.environ.get("PATH", "")
    except Exception:
        pass  # If nvidia packages aren't installed, silently continue
# --- End CUDA DLL Fix ---

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Initialize FastAPI App
app = FastAPI(title="AudioScribe AI Engine", version="0.1.0")

# Allow requests from the Tauri frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to tauri://localhost
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from pathlib import Path

from audioscribe.logger import global_logger, get_log_stream

@app.get("/health")
def health_check():
    """Simple endpoint to verify the Sidecar is running."""
    return {"status": "ok", "message": "AudioScribe AI Engine is running."}

@app.get("/stream-logs")
async def stream_logs():
    """SSE endpoint for streaming backend logs to the React UI."""
    q = global_logger.add_listener()
    return StreamingResponse(get_log_stream(q), media_type="text/event-stream")

import json


BASE_DIR = Path(__file__).resolve().parents[1]
TMP_DIR = BASE_DIR / "tmp"
TMP_DIR.mkdir(parents=True, exist_ok=True)


@dataclass(slots=True)
class JobState:
    proc: subprocess.Popen
    result_file: Path
    progress_file: Path
    file_name: str


jobs: dict[str, JobState] = {}


def _forward_worker_output(job_id: str, proc: subprocess.Popen) -> None:
    if proc.stdout is None:
        return

    for raw_line in proc.stdout:
        line = raw_line.strip()
        if not line:
            continue
        global_logger.write(f"[JOB {job_id}] {line}")

class TranscribeRequest(BaseModel):
    file_path: str
    provider: str
    model_size: str
    regions: dict | None = None


class JobPollResponse(BaseModel):
    status: str
    file: str | None = None
    progress: int | None = None
    message: str | None = None
    error: str | None = None
    job_id: str | None = None


def _cleanup_job(job_id: str) -> None:
    jobs.pop(job_id, None)


def _read_result_file(result_file: Path) -> dict:
    with result_file.open("r", encoding="utf-8") as f:
        return json.load(f)


def _read_progress_file(progress_file: Path) -> int | None:
    if not progress_file.exists():
        return None

    try:
        with progress_file.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return None

    value = data.get("progress")
    if isinstance(value, (int, float)):
        return max(0, min(100, int(value)))
    return None

@app.post("/transcribe")
async def transcribe_endpoint(req: TranscribeRequest):
    """Start a background transcription worker and return a job id."""
    audio_path = Path(req.file_path)
    if not audio_path.exists():
        return {"status": "error", "error": f"File not found: {req.file_path}"}
        
    global_logger.write(f"\n[API] Received transcription request for: {audio_path.name}")
    global_logger.write(f"[API] Provider: {req.provider} | Model: {req.model_size}")

    try:
        job_id = uuid.uuid4().hex
        result_file = TMP_DIR / f"{job_id}.result.json"
        progress_file = TMP_DIR / f"{job_id}.progress.json"
        if result_file.exists():
            result_file.unlink()
        if progress_file.exists():
            progress_file.unlink()

        cmd = [
            sys.executable,
            "-m",
            "audioscribe.worker",
            "--file-path",
            str(audio_path),
            "--provider",
            req.provider,
            "--model-size",
            req.model_size,
            "--result-file",
            str(result_file),
            "--progress-file",
            str(progress_file),
        ]
        if req.regions is not None:
            cmd.extend(["--regions-json", json.dumps(req.regions, ensure_ascii=False)])

        env = os.environ.copy()
        env.setdefault("PYTHONUTF8", "1")
        env.setdefault("PYTHONIOENCODING", "utf-8")
        env.setdefault("PYTHONUNBUFFERED", "1")

        proc = subprocess.Popen(
            cmd,
            cwd=str(BASE_DIR),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
        )

        threading.Thread(
            target=_forward_worker_output,
            args=(job_id, proc),
            daemon=True,
        ).start()

        jobs[job_id] = JobState(
            proc=proc,
            result_file=result_file,
            progress_file=progress_file,
            file_name=audio_path.name,
        )
        global_logger.write(f"[API] Job started: {job_id}")

        return {"status": "accepted", "job_id": job_id, "file": audio_path.name}
    except Exception as e:
        global_logger.write(f"[API] Error during transcription: {e}")
        return {"status": "error", "message": str(e)}


@app.get("/jobs/{job_id}", response_model=JobPollResponse)
async def get_job_status(job_id: str):
    job = jobs.get(job_id)
    if job is None:
        return {"status": "error", "error": f"Job not found: {job_id}"}

    # If result exists, return it immediately even if process teardown lags.
    if job.result_file.exists():
        try:
            payload = _read_result_file(job.result_file)
            payload.setdefault("progress", 100)
            payload.setdefault("job_id", job_id)
            _cleanup_job(job_id)
            return payload
        except Exception as exc:  # noqa: BLE001
            _cleanup_job(job_id)
            return {
                "status": "error",
                "job_id": job_id,
                "error": f"Failed to read job result: {exc}",
            }

    if job.proc.poll() is None:
        progress = _read_progress_file(job.progress_file)
        return {
            "status": "running",
            "job_id": job_id,
            "file": job.file_name,
            "progress": progress,
        }

    code = job.proc.returncode
    _cleanup_job(job_id)
    return {
        "status": "error",
        "job_id": job_id,
        "error": f"Worker exited without result file (exit code: {code})",
    }

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print("Starting AudioScribe Backend Sidecar on port 8000...")
    uvicorn.run(
        "audioscribe.server:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        reload_includes=["*.py"],  # Only reload on Python file changes, not .json
        timeout_keep_alive=600,    # 10 min keep-alive for long transcriptions
    )
