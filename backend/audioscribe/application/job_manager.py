import shutil
import subprocess
import sys
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

from audioscribe.contracts import JobAcceptedResponse, JobStatusResponse, StartTranscriptionRequest
from audioscribe.infrastructure.json_files import read_json
from audioscribe.infrastructure.log_stream import log_bus
from audioscribe.infrastructure.runtime import build_worker_env, windows_subprocess_kwargs
from audioscribe.infrastructure.workspace import JobPaths, WorkspacePaths


@dataclass(slots=True)
class JobRecord:
    proc: subprocess.Popen
    task_name: str
    paths: JobPaths


class JobManager:
    def __init__(self, base_dir: Path, workspace: WorkspacePaths) -> None:
        self.base_dir = base_dir
        self.workspace = workspace
        self._jobs: dict[str, JobRecord] = {}
        self._cleanup_stale_artifacts()

    def start_job(self, request: StartTranscriptionRequest) -> dict:
        job_id = uuid.uuid4().hex
        paths = self.workspace.create_job_paths(job_id)

        import json

        cmd = [
            sys.executable,
            "-m",
            "audioscribe.worker",
            "--source-path",
            request.source_path,
            "--provider",
            request.options.provider_id,
            "--model-size",
            request.options.model_id,
            "--result-file",
            str(paths.result_file),
            "--progress-file",
            str(paths.progress_file),
            "--transcript-file",
            str(paths.transcript_file),
            "--work-dir",
            str(paths.work_dir),
        ]

        if request.media_path:
            cmd.extend(["--media-path", request.media_path])

        if request.editor is not None:
            cmd.extend(["--editor-json", json.dumps(request.editor.model_dump(), ensure_ascii=False)])

        proc = subprocess.Popen(
            cmd,
            cwd=str(self.base_dir),
            env=build_worker_env(),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
            **windows_subprocess_kwargs(),
        )

        self._jobs[job_id] = JobRecord(
            proc=proc,
            task_name=Path(request.source_path).name,
            paths=paths,
        )
        self._start_log_forwarding(job_id, proc)
        log_bus.write(f"[API] Job started: {job_id}")
        return JobAcceptedResponse(status="accepted", job_id=job_id, task_name=Path(request.source_path).name).model_dump()

    def get_job_status(self, job_id: str) -> dict:
        job = self._jobs.get(job_id)
        if job is None:
            return {"status": "error", "error": f"Job not found: {job_id}", "job_id": job_id}

        if job.paths.result_file.exists():
            payload = read_json(job.paths.result_file)
            payload.setdefault("progress", 100 if payload.get("status") == "success" else None)
            payload.setdefault("job_id", job_id)
            payload.setdefault("task_name", job.task_name)
            self._finalize_job(job_id, job)
            return JobStatusResponse.model_validate(payload).model_dump()

        if job.proc.poll() is None:
            progress = None
            if job.paths.progress_file.exists():
                progress_data = read_json(job.paths.progress_file)
                value = progress_data.get("progress")
                if isinstance(value, (int, float)):
                    progress = max(0, min(100, int(value)))
            return JobStatusResponse(
                status="running",
                job_id=job_id,
                task_name=job.task_name,
                progress=progress,
            ).model_dump()

        self._finalize_job(job_id, job)
        return JobStatusResponse(
            status="error",
            job_id=job_id,
            task_name=job.task_name,
            error=f"Worker exited without result file (exit code: {job.proc.returncode})",
        ).model_dump()

    def _finalize_job(self, job_id: str, job: JobRecord) -> None:
        self._jobs.pop(job_id, None)

    def shutdown(self) -> None:
        active_jobs = list(self._jobs.items())
        self._jobs.clear()

        for job_id, job in active_jobs:
            self._terminate_process(job.proc)
            log_bus.write(f"[API] Job terminated during backend shutdown: {job_id}")

    @staticmethod
    def _safe_rmtree(path: Path) -> None:
        try:
            if path.exists():
                shutil.rmtree(path)
        except Exception:
            pass

    def _cleanup_stale_artifacts(self) -> None:
        cutoff = datetime.now() - timedelta(days=7)
        for artifact_dir in self.workspace.iter_job_dirs():
            if artifact_dir.is_dir() and datetime.fromtimestamp(artifact_dir.stat().st_mtime) < cutoff:
                self._safe_rmtree(artifact_dir)

    def _start_log_forwarding(self, job_id: str, proc: subprocess.Popen) -> None:
        def _forward() -> None:
            if proc.stdout is None:
                return
            for raw_line in proc.stdout:
                line = raw_line.strip()
                if line:
                    log_bus.write(f"[JOB {job_id}] {line}")

        threading.Thread(target=_forward, daemon=True).start()

    @staticmethod
    def _terminate_process(proc: subprocess.Popen) -> None:
        if proc.poll() is not None:
            return

        if sys.platform == "win32":
            subprocess.run(
                ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                **windows_subprocess_kwargs(),
            )
            return

        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)
