from typing import Literal

from pydantic import BaseModel, Field


ProviderId = Literal["faster-whisper", "qwen3-asr"]


class HealthResponse(BaseModel):
    status: Literal["ok"]
    message: str
    endpoint: str


class ExtractMediaRequest(BaseModel):
    source_path: str


class WaveformPayload(BaseModel):
    duration: float
    peaks: list[list[float]] = Field(default_factory=list)


class ExtractMediaResponse(BaseModel):
    status: Literal["ready", "error"]
    media_path: str | None = None
    waveform: WaveformPayload | None = None
    error: str | None = None


class TranscriptionOptionsPayload(BaseModel):
    provider_id: ProviderId
    model_id: str


class EditorSegmentPayload(BaseModel):
    start: float
    end: float
    included: bool = True


class EditorSelectionPayload(BaseModel):
    trim_start: float | None = None
    trim_end: float | None = None
    segments: list[EditorSegmentPayload] = Field(default_factory=list)


class StartTranscriptionRequest(BaseModel):
    source_path: str
    media_path: str | None = None
    options: TranscriptionOptionsPayload
    editor: EditorSelectionPayload | None = None


class JobAcceptedResponse(BaseModel):
    status: Literal["accepted"]
    job_id: str
    task_name: str


class JobStatusResponse(BaseModel):
    status: Literal["running", "success", "error"]
    job_id: str
    task_name: str
    progress: int | None = None
    transcript_path: str | None = None
    error: str | None = None
    details: str | None = None