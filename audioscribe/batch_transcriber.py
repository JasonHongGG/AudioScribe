import os
import re
from datetime import timedelta
from pathlib import Path
from typing import Iterable

from audioscribe.interfaces.stt import STTProvider
from audioscribe.utils.ffmpeg import extract_audio_chunk, get_audio_duration
from audioscribe.utils.regions import RegionConfig, parse_regions_config, resolve_regions, resolve_trim_range
from audioscribe.logger import global_logger

class BatchTranscriber:
    SUPPORTED_EXTENSIONS = {".mp3", ".wav", ".m4a", ".flac", ".aac", ".ogg", ".mp4", ".mkv"}

    def __init__(
        self,
        stt_provider: STTProvider,
        audio_dir: str = "audio",
        output_dir: str = "output",
    ) -> None:
        self.stt_provider = stt_provider
        self.audio_dir = Path(audio_dir)
        self.output_dir = Path(output_dir)
        self.tmp_dir = Path("tmp")
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.tmp_dir.mkdir(parents=True, exist_ok=True)

    def iter_audio_files(self) -> Iterable[Path]:
        if not self.audio_dir.exists():
            print(f"找不到音訊資料夾: {self.audio_dir.resolve()}")
            return []

        return (
            path
            for path in self.audio_dir.rglob("*")
            if path.is_file() and path.suffix.lower() in self.SUPPORTED_EXTENSIONS
        )

    def transcribe_file(self, audio_path: Path) -> None:
        output_file = self.output_dir / f"{audio_path.stem}.txt"
        global_logger.write(f"    產出文字檔案到: {output_file}")

        # Check for regions config
        regions_file = audio_path.with_name(audio_path.stem + ".regions.json")
        regions_config = parse_regions_config(regions_file)

        chunks_to_process: list[tuple[float, float]] = []
        is_chunked = False
        processing_audio = audio_path
        base_time_offset = 0.0
        trim_tmp_path: Path | None = None

        if regions_config is not None:
            global_logger.write(f"    找到區段設定檔: {regions_file.name}")
            try:
                duration = get_audio_duration(audio_path)
                trim_start, trim_end = resolve_trim_range(regions_config, duration)

                if trim_start > 0.0 or trim_end < duration:
                    trim_tmp_path = self.tmp_dir / f"{audio_path.stem}.trim.flac"
                    global_logger.write(
                        f"    先執行裁切範圍: {trim_start:.2f}s -> {trim_end:.2f}s"
                    )
                    extract_audio_chunk(audio_path, trim_tmp_path, trim_start, trim_end)
                    processing_audio = trim_tmp_path
                    base_time_offset = trim_start

                    adjusted_excludes = [
                        (start - trim_start, end - trim_start)
                        for start, end in regions_config.excludes
                    ]
                    adjusted_config = RegionConfig(
                        trim=(0.0, trim_end - trim_start),
                        excludes=adjusted_excludes,
                    )
                    chunks_to_process = resolve_regions(adjusted_config, trim_end - trim_start)
                else:
                    chunks_to_process = resolve_regions(regions_config, duration)

                is_chunked = True
            except Exception as e:
                global_logger.write(f"    取得音檔長度失敗，忽略區段設定: {e}")

        try:
            # Open the target file once
            with output_file.open("w", encoding="utf-8") as target:
                if not is_chunked or not chunks_to_process:
                    # Process the whole file (or trimmed file) at once
                    self._process_and_write_chunk(processing_audio, target, offset=base_time_offset)
                else:
                    # Process each valid chunk
                    global_logger.write(f"    將處理 {len(chunks_to_process)} 個有效區段...")
                    for i, (start, end) in enumerate(chunks_to_process):
                        chunk_path = self.tmp_dir / f"chunk_{i}.flac"
                        global_logger.write(f"    > 擷取區段 [{i+1}/{len(chunks_to_process)}]: {start:.2f}s -> {end:.2f}s")
                        extract_audio_chunk(processing_audio, chunk_path, start, end)

                        try:
                            self._process_and_write_chunk(chunk_path, target, offset=base_time_offset + start)
                        finally:
                            if chunk_path.exists():
                                chunk_path.unlink()
        finally:
            if trim_tmp_path is not None and trim_tmp_path.exists():
                trim_tmp_path.unlink()

        global_logger.write(f"    已產出文字檔案: {output_file}")

    def _process_and_write_chunk(self, audio_path: Path, target, offset: float) -> None:
        """Processes a single audio file/chunk and writes the result to the target file."""
        result = self.stt_provider.transcribe(audio_path)
        
        if result.language:
            if result.language_probability is not None:
                global_logger.write(
                    f"    偵測到語言: {result.language}，信心指數: {result.language_probability:.2f}"
                )
            else:
                global_logger.write(f"    偵測到語言: {result.language}")

        if result.has_timestamps:
            for segment in result.segments:
                # Add the offset to align chunk timestamps perfectly with original audio
                actual_start = segment.start + offset
                actual_end = segment.end + offset
                
                # Exclude completely 0 timestamps if they happen (e.g. Qwen fallback without actual timestamps)
                if segment.start == 0.0 and segment.end == 0.0 and actual_start != 0.0:
                    start_time = "[No Timestamps]"
                    end_time = ""
                    line = f"{start_time} {segment.text}"
                else:
                    start_time = str(timedelta(seconds=actual_start))
                    end_time = str(timedelta(seconds=actual_end))
                    line = f"[{start_time} -> {end_time}] {segment.text}"
                    
                global_logger.write(f"    {line}")
                target.write(line + "\n")
        else:
            # No timestamps — collect all text and split into readable lines
            all_texts: list[str] = []
            for segment in result.segments:
                text = segment.text.strip()
                if text:
                    all_texts.append(text)
            plain_text = " ".join(all_texts)
            lines = self._split_text_lines(plain_text)
            for line in lines:
                global_logger.write(f"    {line}")
                target.write(line + "\n")

    @staticmethod
    def _split_text_lines(text: str) -> list[str]:
        if not text:
            return []

        normalized = re.sub(r"\s+", " ", text).strip()
        pieces = re.split(r"(?<=[.!?。！？])\s+", normalized)
        lines = [piece for piece in pieces if piece]
        if len(lines) > 1:
            return lines

        words = normalized.split(" ")
        if len(words) <= 16:
            return [normalized]

        chunk_size = 16
        return [" ".join(words[index : index + chunk_size]) for index in range(0, len(words), chunk_size)]

    def transcribe_all(self) -> None:
        audio_files = list(self.iter_audio_files())
        if not audio_files:
            global_logger.write(f"在 {self.audio_dir} 找不到相容的音訊檔案")
            return

        for index, audio_file in enumerate(audio_files, start=1):
            try:
                global_logger.write(f"[{index}/{len(audio_files)}] 開始轉錄: {audio_file.name}")
                self.transcribe_file(audio_file)
            except Exception as exc:  # noqa: BLE001 - log and continue batch
                global_logger.write(
                    f"處理 {audio_file.name} 時發生錯誤: "
                    f"{type(exc).__name__}: {exc or '<empty message>'}"
                )
