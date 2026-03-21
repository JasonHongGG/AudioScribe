from __future__ import annotations

import subprocess
import sys
import threading
from dataclasses import dataclass
from pathlib import Path

from audioscribe.infrastructure.log_stream import log_bus
from audioscribe.infrastructure.repositories.workflow_repository import WorkflowRepository
from audioscribe.infrastructure.runtime import build_worker_env, windows_subprocess_kwargs


TERMINAL_STATES = {"completed", "failed", "cancelled"}


@dataclass(slots=True)
class ActiveWorkflowProcess:
    run_id: str
    proc: subprocess.Popen


class RuntimeSupervisor:
    def __init__(self, base_dir: Path, workflow_repository: WorkflowRepository) -> None:
        self.base_dir = base_dir
        self.workflow_repository = workflow_repository
        self._active: ActiveWorkflowProcess | None = None

    def start(self, run_id: str, workflow_file: Path) -> None:
        self.reconcile()
        if self._active is not None and self._active.proc.poll() is None:
            raise RuntimeError(f"Workflow run {self._active.run_id} is already active. Wait for it to finish before starting another run.")

        cmd = [
            sys.executable,
            "-m",
            "audioscribe.worker",
            "--workflow-file",
            str(workflow_file),
        ]
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
        self._active = ActiveWorkflowProcess(run_id=run_id, proc=proc)
        self._start_log_forwarding(run_id, proc)
        log_bus.write(f"[Workflow] Run started: {run_id}")

    def reconcile(self) -> None:
        active = self._active
        if active is None:
            return
        if active.proc.poll() is None:
            return

        snapshot = self.workflow_repository.load_snapshot(active.run_id)
        if snapshot.status not in TERMINAL_STATES:
            error_message = f"Worker exited without terminal state (exit code: {active.proc.returncode})"
            self.workflow_repository.update_snapshot(
                active.run_id,
                status="failed",
                progress=snapshot.progress,
                error_message=error_message,
                artifact=snapshot.artifact,
            )
            log_bus.write(f"[Workflow] {error_message}")
        self._active = None

    def shutdown(self) -> None:
        active = self._active
        self._active = None
        if active is None:
            return
        self._terminate_process(active.proc)
        log_bus.write(f"[Workflow] Run terminated during backend shutdown: {active.run_id}")

    def _start_log_forwarding(self, run_id: str, proc: subprocess.Popen) -> None:
        def _forward() -> None:
            if proc.stdout is None:
                return
            for raw_line in proc.stdout:
                line = raw_line.strip()
                if line:
                    log_bus.write(f"[RUN {run_id}] {line}")

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