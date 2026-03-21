from typing import Literal

from pydantic import BaseModel, Field


ProviderId = Literal["faster-whisper", "qwen3-asr"]
SourceKind = Literal["audio", "video"]
ArtifactKind = Literal["transcript"]
WorkflowCapability = Literal["transcription"]
WorkflowStatus = Literal["draft", "prepared", "queued", "running", "completed", "failed", "cancelled"]


class HealthResponse(BaseModel):
    status: Literal["ok"]
    message: str
    endpoint: str


class SourceAssetPayload(BaseModel):
    path: str
    name: str
    kind: SourceKind


class WaveformBarPayload(BaseModel):
    start_time: float
    end_time: float
    amplitude: float


class WaveformLevelPayload(BaseModel):
    level: int
    seconds_per_bar: float
    bars_per_tile: int
    tile_duration: float


class WaveformPayload(BaseModel):
    duration: float
    overview_bars: list[WaveformBarPayload] = Field(default_factory=list)
    levels: list[WaveformLevelPayload] = Field(default_factory=list)


class PreparedMediaPayload(BaseModel):
    playback_path: str
    extraction_path: str | None = None
    waveform: WaveformPayload | None = None


class AssetRecordPayload(BaseModel):
    asset_id: str
    source: SourceAssetPayload
    prepared_media: PreparedMediaPayload
    imported_at: str


class WaveformMetadataResponse(BaseModel):
    asset_id: str
    waveform: WaveformPayload


class WaveformTileResponse(BaseModel):
    asset_id: str
    level: int
    tile_start_time: float
    tile_end_time: float
    bars: list[WaveformBarPayload] = Field(default_factory=list)


class SelectionSegmentPayload(BaseModel):
    start: float
    end: float
    included: bool = True


class EditorSelectionPayload(BaseModel):
    trim_start: float | None = None
    trim_end: float | None = None
    segments: list[SelectionSegmentPayload] = Field(default_factory=list)


class WorkflowProfilePayload(BaseModel):
    capability: WorkflowCapability
    provider_id: ProviderId
    model_id: str


class WorkflowDraftPayload(BaseModel):
    asset_id: str
    selection: EditorSelectionPayload
    profile: WorkflowProfilePayload


class ArtifactRecordPayload(BaseModel):
    artifact_id: str
    kind: ArtifactKind
    path: str
    created_at: str


class ImportAssetRequest(BaseModel):
    source_path: str


class ImportAssetResponse(BaseModel):
    asset: AssetRecordPayload
    editor_session: EditorSelectionPayload


class StartWorkflowRunRequest(BaseModel):
    asset_id: str
    draft: WorkflowDraftPayload


class WorkflowRunSnapshotResponse(BaseModel):
    run_id: str
    asset_id: str
    asset_name: str
    capability: WorkflowCapability
    status: WorkflowStatus
    progress: int
    created_at: str
    updated_at: str
    error_message: str | None = None
    artifact: ArtifactRecordPayload | None = None


class WorkflowRunAcceptedResponse(BaseModel):
    status: Literal["accepted"]
    snapshot: WorkflowRunSnapshotResponse


class TranscriptDocumentResponse(BaseModel):
    run_id: str
    path: str
    content: str


class ExportTranscriptRequest(BaseModel):
    destination_path: str


class ExportTranscriptResponse(BaseModel):
    path: str