from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path
from typing import Callable

from audioscribe.infrastructure.log_stream import log_bus
from audioscribe.stt.base import STTProvider
from audioscribe.utils.ffmpeg import extract_audio_chunk, get_audio_duration
from audioscribe.utils.regions import RegionConfig, parse_regions_config, resolve_regions, resolve_trim_range


@dataclass(slots=True)
class ProgressReporter:
    callback: Callable[[int], None] | None = None
    _last: int = 0

    def update(self, value: int) -> None:
        if self.callback is None:
            return
        clamped = max(0, min(100, int(value)))
        if clamped <= self._last:
            return
        self._last = clamped
        self.callback(clamped)


class TranscriptionService:
    def __init__(self, provider: STTProvider, progress_callback: Callable[[int], None] | None = None) -> None:
        self.provider = provider
        self.progress = ProgressReporter(progress_callback)
        self.tmp_dir = Path("tmp")
        self.tmp_dir.mkdir(parents=True, exist_ok=True)

    def transcribe_file(self, audio_path: Path, output_dir: Path) -> Path:
        output_dir.mkdir(parents=True, exist_ok=True)
        output_file = output_dir / f"{audio_path.stem}.txt"
        self.progress._last = 0
        self.progress.update(5)

        regions_file = audio_path.with_name(audio_path.stem + ".regions.json")
        regions_config = parse_regions_config(regions_file)

        chunks: list[tuple[float, float]] = []
        processing_audio = audio_path
        base_offset = 0.0
        trim_tmp_path: Path | None = None

        total_duration = self._safe_duration(audio_path)

        if regions_config is not None:
            log_bus.write(f"    找到區段設定檔: {regions_file.name}")
            duration = total_duration if total_duration > 0 else self._safe_duration(audio_path)
            trim_start, trim_end = resolve_trim_range(regions_config, duration)

            if trim_start > 0.0 or trim_end < duration:
                trim_tmp_path = self.tmp_dir / f"{audio_path.stem}.trim.flac"
                log_bus.write(f"    先執行裁切範圍: {trim_start:.2f}s -> {trim_end:.2f}s")
                extract_audio_chunk(audio_path, trim_tmp_path, trim_start, trim_end)
                processing_audio = trim_tmp_path
                base_offset = trim_start

                adjusted_excludes = [(start - trim_start, end - trim_start) for start, end in regions_config.excludes]
                adjusted_config = RegionConfig(trim=(0.0, trim_end - trim_start), excludes=adjusted_excludes)
                chunks = resolve_regions(adjusted_config, trim_end - trim_start)
            else:
                chunks = resolve_regions(regions_config, duration)

        self.progress.update(15)

        try:
            with output_file.open("w", encoding="utf-8") as target:
                if chunks:
                    self._transcribe_chunked(processing_audio, chunks, base_offset, target)
                else:
                    self._transcribe_single(processing_audio, base_offset, total_duration, target)
        finally:
            if trim_tmp_path is not None and trim_tmp_path.exists():
                trim_tmp_path.unlink()

        log_bus.write(f"    已產出文字檔案: {output_file}")
        self.progress.update(100)
        return output_file

    def _transcribe_single(self, audio_path: Path, offset: float, total_duration: float, target) -> None:
        self.progress.update(25)
        duration_hint = total_duration
        if offset > 0 and total_duration > 0:
            duration_hint = max(0.0, total_duration - offset)
        self._transcribe_chunk(audio_path, target, offset, 25, 90, duration_hint)
        self.progress.update(90)

    def _transcribe_chunked(self, source_audio: Path, chunks: list[tuple[float, float]], base_offset: float, target) -> None:
        chunk_count = len(chunks)
        log_bus.write(f"    將處理 {chunk_count} 個有效區段...")

        for i, (start, end) in enumerate(chunks):
            progress_start = 20 + int((i / max(1, chunk_count)) * 70)
            progress_end = 20 + int(((i + 1) / max(1, chunk_count)) * 70)
            self.progress.update(progress_start)

            chunk_path = self.tmp_dir / f"chunk_{i}.flac"
            log_bus.write(f"    > 擷取區段 [{i + 1}/{chunk_count}]: {start:.2f}s -> {end:.2f}s")
            extract_audio_chunk(source_audio, chunk_path, start, end)

            try:
                self._transcribe_chunk(
                    chunk_path,
                    target,
                    base_offset + start,
                    progress_start,
                    progress_end,
                    max(0.0, end - start),
                )
            finally:
                if chunk_path.exists():
                    chunk_path.unlink()

            self.progress.update(progress_end)

    def _transcribe_chunk(
        self,
        audio_path: Path,
        target,
        offset: float,
        progress_start: int,
        progress_end: int,
        duration_hint: float,
    ) -> None:
        result = self.provider.transcribe(audio_path)

        if result.language:
            if result.language_probability is not None:
                log_bus.write(f"    偵測到語言: {result.language}，信心指數: {result.language_probability:.2f}")
            else:
                log_bus.write(f"    偵測到語言: {result.language}")

        if result.has_timestamps:
            for segment in result.segments:
                actual_start = segment.start + offset
                actual_end = segment.end + offset
                line = f"[{timedelta(seconds=actual_start)} -> {timedelta(seconds=actual_end)}] {segment.text}"
                log_bus.write(f"    {line}")
                target.write(line + "\n")

                if duration_hint > 0 and progress_end > progress_start:
                    ratio = max(0.0, min(1.0, segment.end / duration_hint))
                    step = progress_start + int((progress_end - progress_start) * ratio)
                    self.progress.update(step)
            return

        collected: list[str] = []
        for segment in result.segments:
            text = segment.text.strip()
            if text:
                collected.append(text)

        plain_text = " ".join(collected).strip()
        fallback_duration = duration_hint
        if fallback_duration <= 0 and result.segments:
            fallback_duration = max(0.0, max(segment.end for segment in result.segments))

        line = f"{plain_text}" if plain_text else f"[無法擷取文字，預估長度: {fallback_duration:.2f}s]"
        log_bus.write(f"    {line}")
        target.write(line + "\n")

        self.progress.update(progress_end)

    @staticmethod
    def _safe_duration(audio_path: Path) -> float:
        try:
            return get_audio_duration(audio_path)
        except Exception:
            return 0.0
