import asyncio
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from audioscribe.application.commands import ExportArtifactCommand, ImportAssetCommand, StartWorkflowRunCommand, WorkbenchCommandHandlers
from audioscribe.application.queries import WorkbenchQueries
from audioscribe.contracts import (
    AssetRecordPayload,
    ArtifactRecordPayload,
    EditorSelectionPayload,
    ExportTranscriptRequest,
    ExportTranscriptResponse,
    HealthResponse,
    ImportAssetRequest,
    ImportAssetResponse,
    StartWorkflowRunRequest,
    TranscriptDocumentResponse,
    WaveformBarPayload,
    WaveformLevelPayload,
    WaveformMetadataResponse,
    WaveformPayload,
    WaveformTileResponse,
    WorkflowRunAcceptedResponse,
    WorkflowRunSnapshotResponse,
)
from audioscribe.domain.models import AssetRecord, ArtifactRecord, EditorSelection, WaveformBar, WaveformLevel, WaveformSummary, WorkflowDraft, WorkflowProfile, WorkflowSnapshot
from audioscribe.infrastructure.adapters.media_preparation import MediaPreparationAdapter
from audioscribe.infrastructure.log_stream import log_bus
from audioscribe.infrastructure.repositories.asset_repository import AssetRepository
from audioscribe.infrastructure.repositories.workflow_repository import WorkflowRepository
from audioscribe.infrastructure.runtime import bootstrap_windows_cuda_dll
from audioscribe.infrastructure.runtime_supervisor import RuntimeSupervisor
from audioscribe.infrastructure.workspace import WorkspacePaths


bootstrap_windows_cuda_dll()
SOURCE_BASE_DIR = Path(__file__).resolve().parents[2]
WORKSPACE_BASE_DIR = Path(os.environ.get("AUDIOSCRIBE_APP_DATA_DIR", SOURCE_BASE_DIR))
workspace = WorkspacePaths(base_dir=WORKSPACE_BASE_DIR)
asset_repository = AssetRepository(workspace)
workflow_repository = WorkflowRepository(workspace)
runtime_supervisor = RuntimeSupervisor(base_dir=SOURCE_BASE_DIR, workflow_repository=workflow_repository)
media_preparation = MediaPreparationAdapter(workspace)
command_handlers = WorkbenchCommandHandlers(
    asset_repository=asset_repository,
    workflow_repository=workflow_repository,
    media_preparation=media_preparation,
    runtime_supervisor=runtime_supervisor,
)
query_handlers = WorkbenchQueries(workflow_repository=workflow_repository, runtime_supervisor=runtime_supervisor)


DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:1420",
    "http://127.0.0.1:1420",
    "tauri://localhost",
    "https://tauri.localhost",
]


def resolve_allowed_origins() -> list[str]:
    configured = os.environ.get("AUDIOSCRIBE_ALLOWED_ORIGINS", "")
    origins = [origin.strip() for origin in configured.split(",") if origin.strip()]
    if not origins:
        return DEFAULT_ALLOWED_ORIGINS.copy()
    return origins


def map_editor_selection(selection: EditorSelection) -> EditorSelectionPayload:
    return EditorSelectionPayload(
        trim_start=selection.trim_start,
        trim_end=selection.trim_end,
        segments=[
            {"start": segment.start, "end": segment.end, "included": segment.included}
            for segment in selection.segments
        ],
    )


def map_asset(asset: AssetRecord) -> AssetRecordPayload:
    return AssetRecordPayload(
        asset_id=asset.asset_id,
        source={
            "path": asset.source.path,
            "name": asset.source.name,
            "kind": asset.source.kind,
        },
        prepared_media={
            "playback_path": asset.prepared_media.playback_path,
            "extraction_path": asset.prepared_media.extraction_path,
            "waveform": map_waveform(asset.prepared_media.waveform),
        },
        imported_at=asset.imported_at,
    )


def map_waveform_bar(bar: WaveformBar) -> WaveformBarPayload:
    return WaveformBarPayload(
        start_time=bar.start_time,
        end_time=bar.end_time,
        amplitude=bar.amplitude,
    )


def map_waveform_level(level: WaveformLevel) -> WaveformLevelPayload:
    return WaveformLevelPayload(
        level=level.level,
        seconds_per_bar=level.seconds_per_bar,
        bars_per_tile=level.bars_per_tile,
        tile_duration=level.tile_duration,
    )


def map_waveform(waveform: WaveformSummary | None) -> WaveformPayload | None:
    if waveform is None:
        return None
    return WaveformPayload(
        duration=waveform.duration,
        overview_bars=[map_waveform_bar(bar) for bar in waveform.overview_bars],
        levels=[map_waveform_level(level) for level in waveform.levels],
    )


def map_artifact(artifact: ArtifactRecord | None) -> ArtifactRecordPayload | None:
    if artifact is None:
        return None
    return ArtifactRecordPayload(
        artifact_id=artifact.artifact_id,
        kind=artifact.kind,
        path=artifact.path,
        created_at=artifact.created_at,
    )


def map_snapshot(snapshot: WorkflowSnapshot) -> WorkflowRunSnapshotResponse:
    return WorkflowRunSnapshotResponse(
        run_id=snapshot.run_id,
        asset_id=snapshot.asset_id,
        asset_name=snapshot.asset_name,
        capability=snapshot.capability,
        status=snapshot.status,
        progress=snapshot.progress,
        created_at=snapshot.created_at,
        updated_at=snapshot.updated_at,
        error_message=snapshot.error_message,
        artifact=map_artifact(snapshot.artifact),
    )


def map_draft(payload) -> WorkflowDraft:
    return WorkflowDraft(
        asset_id=payload.asset_id,
        selection=EditorSelection.from_dict(payload.selection.model_dump()),
        profile=WorkflowProfile.from_dict(payload.profile.model_dump()),
    )


def create_app() -> FastAPI:
    app = FastAPI(title="AudioScribe Workflow Engine", version="3.0.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=resolve_allowed_origins(),
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health", response_model=HealthResponse)
    def health_check() -> HealthResponse:
        return HealthResponse(status="ok", message="AudioScribe workflow engine is running.", endpoint="local-sidecar")

    @app.post("/assets/import", response_model=ImportAssetResponse)
    async def import_asset(req: ImportAssetRequest) -> ImportAssetResponse:
        try:
            asset, editor_session = await asyncio.to_thread(command_handlers.import_asset, ImportAssetCommand(source_path=req.source_path))
            return ImportAssetResponse(asset=map_asset(asset), editor_session=map_editor_selection(editor_session))
        except Exception as exc:  # noqa: BLE001
            log_bus.write(f"[HTTP] Asset import failed: {exc}")
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    @app.get("/assets/{asset_id}/waveform/metadata", response_model=WaveformMetadataResponse)
    async def get_waveform_metadata(asset_id: str) -> WaveformMetadataResponse:
        try:
            asset = await asyncio.to_thread(asset_repository.get, asset_id)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

        waveform = map_waveform(asset.prepared_media.waveform)
        if waveform is None:
            raise HTTPException(status_code=404, detail=f"No waveform metadata exists for asset: {asset_id}")
        return WaveformMetadataResponse(asset_id=asset_id, waveform=waveform)

    @app.get("/assets/{asset_id}/waveform/tiles", response_model=WaveformTileResponse)
    async def get_waveform_tile(asset_id: str, level: int, start_time: float, end_time: float) -> WaveformTileResponse:
        try:
            asset = await asyncio.to_thread(asset_repository.get, asset_id)
            resolved_level, bars = await asyncio.to_thread(
                media_preparation.load_waveform_tile,
                asset.source,
                asset.prepared_media,
                level,
                start_time,
                end_time,
            )
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        tile_start_time = max(0.0, (bars[0].start_time if bars else start_time))
        tile_end_time = min(asset.prepared_media.waveform.duration if asset.prepared_media.waveform else end_time, (bars[-1].end_time if bars else end_time))
        return WaveformTileResponse(
            asset_id=asset_id,
            level=resolved_level.level,
            tile_start_time=tile_start_time,
            tile_end_time=tile_end_time,
            bars=[map_waveform_bar(bar) for bar in bars],
        )

    @app.post("/workflow-runs", response_model=WorkflowRunAcceptedResponse)
    async def start_workflow_run(req: StartWorkflowRunRequest) -> WorkflowRunAcceptedResponse:
        try:
            snapshot = await asyncio.to_thread(
                command_handlers.start_workflow_run,
                StartWorkflowRunCommand(asset_id=req.asset_id, draft=map_draft(req.draft)),
            )
            return WorkflowRunAcceptedResponse(status="accepted", snapshot=map_snapshot(snapshot))
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except Exception as exc:  # noqa: BLE001
            log_bus.write(f"[HTTP] Workflow start failed: {exc}")
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    @app.get("/workflow-runs/{run_id}", response_model=WorkflowRunSnapshotResponse)
    async def get_workflow_run(run_id: str) -> WorkflowRunSnapshotResponse:
        try:
            snapshot = await asyncio.to_thread(query_handlers.get_workflow_run, run_id)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        return map_snapshot(snapshot)

    @app.get("/workflow-runs/{run_id}/transcript", response_model=TranscriptDocumentResponse)
    async def load_transcript(run_id: str) -> TranscriptDocumentResponse:
        try:
            transcript_path, content = await asyncio.to_thread(query_handlers.load_transcript_document, run_id)
            return TranscriptDocumentResponse(run_id=run_id, path=transcript_path, content=content)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.post("/workflow-runs/{run_id}/transcript-export", response_model=ExportTranscriptResponse)
    async def export_transcript(run_id: str, req: ExportTranscriptRequest) -> ExportTranscriptResponse:
        try:
            output_path = await asyncio.to_thread(
                command_handlers.export_artifact,
                ExportArtifactCommand(run_id=run_id, destination_path=req.destination_path),
            )
            return ExportTranscriptResponse(path=output_path)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    return app


app = create_app()