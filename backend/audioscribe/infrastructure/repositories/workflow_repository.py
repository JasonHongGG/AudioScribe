from __future__ import annotations

import json
from pathlib import Path

from audioscribe.domain.models import ArtifactRecord, WorkflowSnapshot, WorkflowSpec, utc_now
from audioscribe.infrastructure.json_files import read_json, write_json
from audioscribe.infrastructure.workspace import WorkspacePaths, WorkflowPaths


class WorkflowRepository:
    def __init__(self, workspace: WorkspacePaths) -> None:
        self.workspace = workspace

    def create(self, spec: WorkflowSpec, snapshot: WorkflowSnapshot) -> WorkflowPaths:
        paths = self.workspace.create_workflow_paths(spec.run_id)
        write_json(paths.workflow_file, {"version": 1, "workflow": spec.to_dict()})
        write_json(paths.snapshot_file, {"version": 1, "snapshot": snapshot.to_dict()})
        self.append_event(spec.run_id, "workflow.created", snapshot.to_dict())
        return paths

    def paths_for(self, run_id: str) -> WorkflowPaths:
        return self.workspace.workflow_paths(run_id)

    def load_spec(self, run_id: str) -> WorkflowSpec:
        payload = read_json(self.paths_for(run_id).workflow_file).get("workflow") or {}
        return WorkflowSpec.from_dict(payload)

    def load_spec_from_file(self, workflow_file: Path) -> WorkflowSpec:
        payload = read_json(workflow_file).get("workflow") or {}
        return WorkflowSpec.from_dict(payload)

    def load_snapshot(self, run_id: str) -> WorkflowSnapshot:
        payload = read_json(self.paths_for(run_id).snapshot_file).get("snapshot") or {}
        return WorkflowSnapshot.from_dict(payload)

    def save_snapshot(self, snapshot: WorkflowSnapshot) -> WorkflowSnapshot:
        snapshot.updated_at = utc_now()
        write_json(self.paths_for(snapshot.run_id).snapshot_file, {"version": 1, "snapshot": snapshot.to_dict()})
        return snapshot

    def update_snapshot(
        self,
        run_id: str,
        *,
        status: str,
        progress: int,
        error_message: str | None = None,
        artifact: ArtifactRecord | None = None,
    ) -> WorkflowSnapshot:
        snapshot = self.load_snapshot(run_id)
        snapshot.status = status
        snapshot.progress = max(0, min(100, int(progress)))
        snapshot.error_message = error_message
        snapshot.artifact = artifact
        self.save_snapshot(snapshot)
        self.append_event(run_id, "workflow.updated", snapshot.to_dict())
        return snapshot

    def append_event(self, run_id: str, event_type: str, payload: dict) -> None:
        paths = self.paths_for(run_id)
        paths.events_file.parent.mkdir(parents=True, exist_ok=True)
        with paths.events_file.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps({"timestamp": utc_now(), "type": event_type, "payload": payload}, ensure_ascii=True) + "\n")