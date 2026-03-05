import subprocess
import sys
import threading
import uuid
from dataclasses import dataclass
from pathlib import Path

from audioscribe.infrastructure.json_files import read_json
from audioscribe.infrastructure.log_stream import log_bus
from audioscribe.infrastructure.runtime import build_worker_env


@dataclass(slots=True)
class JobRecord:
    proc: subprocess.Popen
    file_name: str
    result_file: Path
    progress_file: Path


class JobManager:
    def __init__(self, base_dir: Path) -> None:
        self.base_dir = base_dir
        self.tmp_dir = base_dir / "tmp"
        self.tmp_dir.mkdir(parents=True, exist_ok=True)
        self._jobs: dict[str, JobRecord] = {}
        self._cleanup_stale_artifacts()

    def start_job(self, file_path: Path, provider: str, model_size: str, regions: dict | None) -> dict:
        job_id = uuid.uuid4().hex
        result_file = self.tmp_dir / f"{job_id}.result.json"
        progress_file = self.tmp_dir / f"{job_id}.progress.json"

        self._safe_unlink(result_file)
        self._safe_unlink(progress_file)

        import json

        cmd = [
            sys.executable,
            "-m",
            "audioscribe.worker",
            "--file-path",
            str(file_path),
            "--provider",
            provider,
            "--model-size",
            model_size,
            "--result-file",
            str(result_file),
            "--progress-file",
            str(progress_file),
        ]

        if regions is not None:
            cmd.extend(["--regions-json", json.dumps(regions, ensure_ascii=False)])

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
        )

        self._jobs[job_id] = JobRecord(proc=proc, file_name=file_path.name, result_file=result_file, progress_file=progress_file)
        self._start_log_forwarding(job_id, proc)
        log_bus.write(f"[API] Job started: {job_id}")
        return {"status": "accepted", "job_id": job_id, "file": file_path.name}

    def get_job_status(self, job_id: str) -> dict:
        job = self._jobs.get(job_id)
        if job is None:
            return {"status": "error", "error": f"Job not found: {job_id}", "job_id": job_id}

        if job.result_file.exists():
            payload = read_json(job.result_file)
            payload.setdefault("progress", 100 if payload.get("status") == "success" else None)
            payload.setdefault("job_id", job_id)
            self._finalize_job(job_id, job)
            return payload

        if job.proc.poll() is None:
            progress = None
            if job.progress_file.exists():
                progress_data = read_json(job.progress_file)
                value = progress_data.get("progress")
                if isinstance(value, (int, float)):
                    progress = max(0, min(100, int(value)))
            return {
                "status": "running",
                "job_id": job_id,
                "file": job.file_name,
                "progress": progress,
            }

        self._finalize_job(job_id, job)
        return {
            "status": "error",
            "job_id": job_id,
            "error": f"Worker exited without result file (exit code: {job.proc.returncode})",
        }

    def _finalize_job(self, job_id: str, job: JobRecord) -> None:
        self._jobs.pop(job_id, None)
        self._safe_unlink(job.result_file)
        self._safe_unlink(job.progress_file)

    @staticmethod
    def _safe_unlink(path: Path) -> None:
        try:
            if path.exists():
                path.unlink()
        except Exception:
            # Artifact cleanup should never break API flow.
            pass

    def _cleanup_stale_artifacts(self) -> None:
        for pattern in ("*.result.json", "*.progress.json"):
            for artifact in self.tmp_dir.glob(pattern):
                self._safe_unlink(artifact)

    def _start_log_forwarding(self, job_id: str, proc: subprocess.Popen) -> None:
        def _forward() -> None:
            if proc.stdout is None:
                return
            for raw_line in proc.stdout:
                line = raw_line.strip()
                if line:
                    log_bus.write(f"[JOB {job_id}] {line}")

        threading.Thread(target=_forward, daemon=True).start()
