from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal


SourceKind = Literal["audio", "video"]
ArtifactKind = Literal["transcript"]
WorkflowCapability = Literal["transcription"]
WorkflowStatus = Literal["draft", "prepared", "queued", "running", "completed", "failed", "cancelled"]

VIDEO_EXTENSIONS = {".mp4", ".mkv", ".avi", ".mov", ".webm", ".flv", ".wmv", ".ts"}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass(slots=True)
class WaveformBar:
    start_time: float
    end_time: float
    amplitude: float


@dataclass(slots=True)
class WaveformLevel:
    level: int
    seconds_per_bar: float
    bars_per_tile: int

    @property
    def tile_duration(self) -> float:
        return self.seconds_per_bar * self.bars_per_tile


@dataclass(slots=True)
class WaveformSummary:
    duration: float
    overview_bars: list[WaveformBar] = field(default_factory=list)
    levels: list[WaveformLevel] = field(default_factory=list)


@dataclass(slots=True)
class SourceAsset:
    path: str
    name: str
    kind: SourceKind

    @classmethod
    def from_path(cls, path: str) -> "SourceAsset":
        source_path = Path(path)
        kind: SourceKind = "video" if source_path.suffix.lower() in VIDEO_EXTENSIONS else "audio"
        return cls(path=str(source_path), name=source_path.name, kind=kind)


@dataclass(slots=True)
class PreparedMedia:
    playback_path: str
    extraction_path: str | None
    waveform: WaveformSummary | None = None


@dataclass(slots=True)
class AssetRecord:
    asset_id: str
    source: SourceAsset
    prepared_media: PreparedMedia
    imported_at: str = field(default_factory=utc_now)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, payload: dict) -> "AssetRecord":
        source_payload = payload.get("source") or {}
        prepared_media_payload = payload.get("prepared_media") or {}
        waveform_payload = prepared_media_payload.get("waveform")
        waveform = None
        if isinstance(waveform_payload, dict):
            waveform = WaveformSummary(
                duration=float(waveform_payload.get("duration") or 0.0),
                overview_bars=[
                    WaveformBar(
                        start_time=float(bar.get("start_time") or 0.0),
                        end_time=float(bar.get("end_time") or 0.0),
                        amplitude=float(bar.get("amplitude") or 0.0),
                    )
                    for bar in waveform_payload.get("overview_bars") or []
                    if isinstance(bar, dict)
                ],
                levels=[
                    WaveformLevel(
                        level=int(level.get("level") or 0),
                        seconds_per_bar=float(level.get("seconds_per_bar") or 0.0),
                        bars_per_tile=int(level.get("bars_per_tile") or 0),
                    )
                    for level in waveform_payload.get("levels") or []
                    if isinstance(level, dict)
                ],
            )

        source_path = str(source_payload.get("path") or "")
        return cls(
            asset_id=str(payload.get("asset_id") or ""),
            source=SourceAsset(
                path=source_path,
                name=str(source_payload.get("name") or Path(source_path).name or "Untitled"),
                kind="video" if source_payload.get("kind") == "video" else "audio",
            ),
            prepared_media=PreparedMedia(
                playback_path=str(prepared_media_payload.get("playback_path") or source_path),
                extraction_path=(
                    str(prepared_media_payload.get("extraction_path"))
                    if prepared_media_payload.get("extraction_path")
                    else None
                ),
                waveform=waveform,
            ),
            imported_at=str(payload.get("imported_at") or utc_now()),
        )


@dataclass(slots=True)
class SelectionSegment:
    start: float
    end: float
    included: bool = True


@dataclass(slots=True)
class EditorSelection:
    trim_start: float | None = None
    trim_end: float | None = None
    segments: list[SelectionSegment] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, payload: dict | None) -> "EditorSelection":
        payload = payload or {}
        return cls(
            trim_start=payload.get("trim_start"),
            trim_end=payload.get("trim_end"),
            segments=[
                SelectionSegment(
                    start=float(segment.get("start") or 0.0),
                    end=float(segment.get("end") or 0.0),
                    included=bool(segment.get("included", True)),
                )
                for segment in payload.get("segments") or []
                if isinstance(segment, dict)
            ],
        )


@dataclass(slots=True)
class WorkflowProfile:
    capability: WorkflowCapability
    provider_id: str
    model_id: str

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, payload: dict | None) -> "WorkflowProfile":
        payload = payload or {}
        capability = payload.get("capability")
        return cls(
            capability="transcription" if capability != "transcription" else capability,
            provider_id=str(payload.get("provider_id") or "faster-whisper"),
            model_id=str(payload.get("model_id") or "large-v3"),
        )


@dataclass(slots=True)
class WorkflowDraft:
    asset_id: str
    selection: EditorSelection
    profile: WorkflowProfile

    def to_dict(self) -> dict:
        return {
            "asset_id": self.asset_id,
            "selection": self.selection.to_dict(),
            "profile": self.profile.to_dict(),
        }

    @classmethod
    def from_dict(cls, payload: dict | None) -> "WorkflowDraft":
        payload = payload or {}
        return cls(
            asset_id=str(payload.get("asset_id") or ""),
            selection=EditorSelection.from_dict(payload.get("selection")),
            profile=WorkflowProfile.from_dict(payload.get("profile")),
        )


@dataclass(slots=True)
class ArtifactRecord:
    artifact_id: str
    kind: ArtifactKind
    path: str
    created_at: str = field(default_factory=utc_now)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, payload: dict | None) -> "ArtifactRecord | None":
        if not isinstance(payload, dict):
            return None
        path = payload.get("path")
        if not path:
            return None
        kind = payload.get("kind")
        return cls(
            artifact_id=str(payload.get("artifact_id") or ""),
            kind="transcript" if kind != "transcript" else kind,
            path=str(path),
            created_at=str(payload.get("created_at") or utc_now()),
        )


@dataclass(slots=True)
class WorkflowSpec:
    run_id: str
    asset: AssetRecord
    draft: WorkflowDraft
    created_at: str = field(default_factory=utc_now)

    def to_dict(self) -> dict:
        return {
            "run_id": self.run_id,
            "asset": self.asset.to_dict(),
            "draft": self.draft.to_dict(),
            "created_at": self.created_at,
        }

    @classmethod
    def from_dict(cls, payload: dict) -> "WorkflowSpec":
        return cls(
            run_id=str(payload.get("run_id") or ""),
            asset=AssetRecord.from_dict(payload.get("asset") or {}),
            draft=WorkflowDraft.from_dict(payload.get("draft") or {}),
            created_at=str(payload.get("created_at") or utc_now()),
        )


@dataclass(slots=True)
class WorkflowSnapshot:
    run_id: str
    asset_id: str
    asset_name: str
    capability: WorkflowCapability
    status: WorkflowStatus
    progress: int
    created_at: str = field(default_factory=utc_now)
    updated_at: str = field(default_factory=utc_now)
    error_message: str | None = None
    artifact: ArtifactRecord | None = None

    def to_dict(self) -> dict:
        payload = asdict(self)
        payload["progress"] = max(0, min(100, int(self.progress)))
        return payload

    @classmethod
    def from_dict(cls, payload: dict) -> "WorkflowSnapshot":
        status = payload.get("status")
        if status not in {"draft", "prepared", "queued", "running", "completed", "failed", "cancelled"}:
            status = "draft"
        capability = payload.get("capability")
        return cls(
            run_id=str(payload.get("run_id") or ""),
            asset_id=str(payload.get("asset_id") or ""),
            asset_name=str(payload.get("asset_name") or "Untitled"),
            capability="transcription" if capability != "transcription" else capability,
            status=status,
            progress=max(0, min(100, int(payload.get("progress") or 0))),
            created_at=str(payload.get("created_at") or utc_now()),
            updated_at=str(payload.get("updated_at") or utc_now()),
            error_message=(str(payload.get("error_message")) if payload.get("error_message") else None),
            artifact=ArtifactRecord.from_dict(payload.get("artifact")),
        )


def build_default_editor_selection(duration: float) -> EditorSelection:
    normalized_duration = max(0.0, float(duration))
    if normalized_duration <= 0:
        return EditorSelection(trim_start=0.0, trim_end=0.0, segments=[])
    return EditorSelection(
        trim_start=0.0,
        trim_end=normalized_duration,
        segments=[SelectionSegment(start=0.0, end=normalized_duration, included=True)],
    )
