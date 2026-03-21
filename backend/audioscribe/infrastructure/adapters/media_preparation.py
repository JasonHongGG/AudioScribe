from __future__ import annotations

import json
import math
from pathlib import Path

from audioscribe.domain.models import PreparedMedia, SourceAsset, WaveformBar, WaveformLevel, WaveformSummary
from audioscribe.infrastructure.log_stream import log_bus
from audioscribe.infrastructure.workspace import WorkspacePaths
from audioscribe.utils.ffmpeg import build_waveform_levels, extract_audio_to_mp3, generate_waveform_bars, is_video_file


OVERVIEW_BAR_COUNT = 1400


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
            if self._is_valid_waveform_payload(waveform_payload):
                log_bus.write(f"[Media] Using cached waveform: {source_path.name}")
            else:
                waveform_payload = None

        if waveform_payload is None:
            log_bus.write(f"[Media] Generating waveform overview: {source_path.name}")
            amplitudes, duration = generate_waveform_bars(media_path, 0.0, None, OVERVIEW_BAR_COUNT)
            waveform_payload = {
                "duration": duration,
                "overview_bars": self._serialize_bars(0.0, duration, amplitudes),
                "levels": [
                    {
                        "level": level.level,
                        "seconds_per_bar": level.seconds_per_bar,
                        "bars_per_tile": level.bars_per_tile,
                        "tile_duration": level.tile_duration,
                    }
                    for level in build_waveform_levels()
                ],
            }
            waveform_cache.write_text(json.dumps(waveform_payload), encoding="utf-8")

        waveform = None
        if waveform_payload is not None:
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

        return PreparedMedia(
            playback_path=str(media_path),
            extraction_path=extraction_path,
            waveform=waveform,
        )

    def load_waveform_tile(self, source: SourceAsset, prepared_media: PreparedMedia, level_index: int, start_time: float, end_time: float) -> tuple[WaveformLevel, list[WaveformBar]]:
        if prepared_media.waveform is None:
            raise FileNotFoundError(f"No waveform metadata exists for asset: {source.name}")

        level = next((item for item in prepared_media.waveform.levels if item.level == level_index), None)
        if level is None:
            raise ValueError(f"Unknown waveform level: {level_index}")

        duration = prepared_media.waveform.duration
        tile_start_time = max(0.0, math.floor(start_time / level.tile_duration) * level.tile_duration)
        tile_end_time = min(duration, max(tile_start_time + level.tile_duration, math.ceil(end_time / level.tile_duration) * level.tile_duration))
        source_path = Path(source.path)
        tile_cache_path = self.workspace.waveform_tile_cache_path(source_path, level.level, tile_start_time, tile_end_time)
        media_path = Path(prepared_media.extraction_path or prepared_media.playback_path)

        tile_payload: dict | None = None
        if tile_cache_path.exists() and tile_cache_path.stat().st_mtime >= media_path.stat().st_mtime:
            tile_payload = json.loads(tile_cache_path.read_text(encoding="utf-8"))
        else:
            amplitudes, _ = generate_waveform_bars(media_path, tile_start_time, tile_end_time, level.bars_per_tile)
            tile_payload = {
                "tile_start_time": tile_start_time,
                "tile_end_time": tile_end_time,
                "bars": self._serialize_bars(tile_start_time, tile_end_time, amplitudes),
            }
            tile_cache_path.write_text(json.dumps(tile_payload), encoding="utf-8")

        bars = [
            WaveformBar(
                start_time=float(bar.get("start_time") or 0.0),
                end_time=float(bar.get("end_time") or 0.0),
                amplitude=float(bar.get("amplitude") or 0.0),
            )
            for bar in tile_payload.get("bars") or []
            if isinstance(bar, dict)
        ]
        return level, bars

    @staticmethod
    def _serialize_bars(start_time: float, end_time: float, amplitudes: list[float]) -> list[dict[str, float]]:
        if not amplitudes or end_time <= start_time:
            return []

        step = (end_time - start_time) / len(amplitudes)
        bars: list[dict[str, float]] = []
        for index, amplitude in enumerate(amplitudes):
            bar_start = start_time + (index * step)
            bar_end = end_time if index == len(amplitudes) - 1 else start_time + ((index + 1) * step)
            bars.append({
                "start_time": bar_start,
                "end_time": bar_end,
                "amplitude": float(amplitude),
            })
        return bars

    @staticmethod
    def _is_valid_waveform_payload(payload: dict | None) -> bool:
        if not isinstance(payload, dict):
            return False
        if not isinstance(payload.get("duration"), (int, float)):
            return False
        overview_bars = payload.get("overview_bars")
        levels = payload.get("levels")
        return isinstance(overview_bars, list) and len(overview_bars) > 0 and isinstance(levels, list) and len(levels) > 0
