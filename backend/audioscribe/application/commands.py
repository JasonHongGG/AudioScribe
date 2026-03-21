from __future__ import annotations

import shutil
import uuid
from dataclasses import dataclass
from pathlib import Path

from audioscribe.domain.models import (
    ArtifactRecord,
    AssetRecord,
    EditorSelection,
    SourceAsset,
    WorkflowDraft,
    WorkflowSnapshot,
    WorkflowSpec,
    build_default_editor_selection,
)
from audioscribe.infrastructure.adapters.media_preparation import MediaPreparationAdapter
from audioscribe.infrastructure.repositories.asset_repository import AssetRepository
from audioscribe.infrastructure.repositories.workflow_repository import WorkflowRepository
from audioscribe.infrastructure.runtime_supervisor import RuntimeSupervisor


@dataclass(slots=True)
class ImportAssetCommand:
    source_path: str


@dataclass(slots=True)
class StartWorkflowRunCommand:
    asset_id: str
    draft: WorkflowDraft


@dataclass(slots=True)
class ExportArtifactCommand:
    run_id: str
    destination_path: str


class WorkbenchCommandHandlers:
    def __init__(
        self,
        *,
        asset_repository: AssetRepository,
        workflow_repository: WorkflowRepository,
        media_preparation: MediaPreparationAdapter,
        runtime_supervisor: RuntimeSupervisor,
    ) -> None:
        self.asset_repository = asset_repository
        self.workflow_repository = workflow_repository
        self.media_preparation = media_preparation
        self.runtime_supervisor = runtime_supervisor

    def import_asset(self, command: ImportAssetCommand) -> tuple[AssetRecord, EditorSelection]:
        source = SourceAsset.from_path(command.source_path)
        prepared_media = self.media_preparation.prepare(source)
        asset = AssetRecord(asset_id=uuid.uuid4().hex, source=source, prepared_media=prepared_media)
        self.asset_repository.save(asset)
        duration = prepared_media.waveform.duration if prepared_media.waveform is not None else 0.0
        return asset, build_default_editor_selection(duration)

    def start_workflow_run(self, command: StartWorkflowRunCommand) -> WorkflowSnapshot:
        if command.asset_id != command.draft.asset_id:
            raise ValueError("Asset id mismatch between route payload and draft payload.")

        asset = self.asset_repository.get(command.asset_id)
        run_id = uuid.uuid4().hex
        spec = WorkflowSpec(run_id=run_id, asset=asset, draft=command.draft)
        snapshot = WorkflowSnapshot(
            run_id=run_id,
            asset_id=asset.asset_id,
            asset_name=asset.source.name,
            capability=command.draft.profile.capability,
            status="queued",
            progress=0,
        )
        paths = self.workflow_repository.create(spec, snapshot)
        self.runtime_supervisor.start(run_id, paths.workflow_file)
        return self.workflow_repository.load_snapshot(run_id)

    def export_artifact(self, command: ExportArtifactCommand) -> str:
        snapshot = self.workflow_repository.load_snapshot(command.run_id)
        if snapshot.artifact is None:
            raise FileNotFoundError(f"No workflow artifact exists for run: {command.run_id}")

        source = Path(snapshot.artifact.path)
        destination = self._unique_destination_path(Path(command.destination_path))
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        return str(destination)

    def shutdown(self) -> None:
        self.runtime_supervisor.shutdown()

    @staticmethod
    def _unique_destination_path(destination: Path) -> Path:
        if not destination.exists():
            return destination

        parent = destination.parent
        stem = destination.stem or "artifact"
        suffix = destination.suffix
        for index in range(1, 10_000):
            candidate = parent / f"{stem}{index}{suffix}"
            if not candidate.exists():
                return candidate
        return destination