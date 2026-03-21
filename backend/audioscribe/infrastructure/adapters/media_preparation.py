from __future__ import annotations

import json
from pathlib import Path

from audioscribe.domain.models import PreparedMedia, SourceAsset, WaveformSummary
from audioscribe.infrastructure.log_stream import log_bus
from audioscribe.infrastructure.workspace import WorkspacePaths
from audioscribe.utils.ffmpeg import extract_audio_to_mp3, generate_waveform_peaks, is_video_file


class MediaPreparationAdapter:
    def __init__(self, workspace: WorkspacePaths) -> None:
        self.workspace = workspace

    def prepare(self, source: SourceAsset) -> PreparedMedia:
        source_path = Path(source.path)
        if not source_path.exists():
            raise FileNotFoundError(f"File not found: {source.path}")

        media_path = source_path
        extraction_path: str | None = None

        if is_video_file(source_path):
            cached_audio_path = self.workspace.media_cache_path(source_path)
            if cached_audio_path.exists() and cached_audio_path.stat().st_mtime >= source_path.stat().st_mtime:
                log_bus.write(f"[Media] Using cached audio: {cached_audio_path.name}")
            else:
                log_bus.write(f"[Media] Extracting audio from video: {source_path.name}")
                extract_audio_to_mp3(source_path, cached_audio_path)
            media_path = cached_audio_path
            extraction_path = str(cached_audio_path)

        waveform_cache = self.workspace.waveform_cache_path(source_path)
        waveform_payload: dict | None = None
        if waveform_cache.exists() and waveform_cache.stat().st_mtime >= media_path.stat().st_mtime:
            waveform_payload = json.loads(waveform_cache.read_text(encoding="utf-8"))
            log_bus.write(f"[Media] Using cached waveform: {source_path.name}")
        else:
            log_bus.write(f"[Media] Generating waveform peaks: {source_path.name}")
            peaks, duration = generate_waveform_peaks(media_path)
            waveform_payload = {"duration": duration, "peaks": peaks}
            waveform_cache.write_text(json.dumps(waveform_payload), encoding="utf-8")

        waveform = None
        if waveform_payload is not None:
            waveform = WaveformSummary(
                duration=float(waveform_payload.get("duration") or 0.0),
                peaks=[list(channel) for channel in waveform_payload.get("peaks") or []],
            )

        return PreparedMedia(
            playback_path=str(media_path),
            extraction_path=extraction_path,
            waveform=waveform,
        )
