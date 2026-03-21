from __future__ import annotations

from pathlib import Path

from audioscribe.domain.models import WorkflowSnapshot
from audioscribe.infrastructure.repositories.workflow_repository import WorkflowRepository
from audioscribe.infrastructure.runtime_supervisor import RuntimeSupervisor


class WorkbenchQueries:
    def __init__(self, *, workflow_repository: WorkflowRepository, runtime_supervisor: RuntimeSupervisor) -> None:
        self.workflow_repository = workflow_repository
        self.runtime_supervisor = runtime_supervisor

    def get_workflow_run(self, run_id: str) -> WorkflowSnapshot:
        self.runtime_supervisor.reconcile()
        return self.workflow_repository.load_snapshot(run_id)

    def load_transcript_document(self, run_id: str) -> tuple[str, str]:
        snapshot = self.get_workflow_run(run_id)
        if snapshot.artifact is None:
            raise FileNotFoundError(f"No transcript artifact exists for run: {run_id}")

        transcript_path = Path(snapshot.artifact.path)
        if not transcript_path.exists() or not transcript_path.is_file():
            raise FileNotFoundError(f"Transcript file does not exist: {transcript_path}")

        return str(transcript_path), transcript_path.read_text(encoding="utf-8")