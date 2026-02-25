from datetime import timedelta
from pathlib import Path
import re
from typing import Iterable

from audioscribe.interfaces.stt import STTProvider


class BatchTranscriber:
    SUPPORTED_EXTENSIONS = {".mp3", ".wav", ".m4a", ".flac", ".aac", ".ogg"}

    def __init__(
        self,
        stt_provider: STTProvider,
        audio_dir: str = "audio",
        output_dir: str = "output",
    ) -> None:
        self.stt_provider = stt_provider
        self.audio_dir = Path(audio_dir)
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

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
        result = self.stt_provider.transcribe(audio_path)
        if result.language:
            if result.language_probability is not None:
                print(
                    f"    偵測到語言: {result.language}，信心指數: {result.language_probability:.2f}"
                )
            else:
                print(f"    偵測到語言: {result.language}")

        output_file = self.output_dir / f"{audio_path.stem}.txt"
        print(f"    產出文字檔案到: {output_file}")
        has_real_timestamps = any(segment.end > segment.start for segment in result.segments)

        with output_file.open("w", encoding="utf-8") as target:
            if has_real_timestamps:
                for segment in result.segments:
                    start_time = str(timedelta(seconds=segment.start))
                    end_time = str(timedelta(seconds=segment.end))
                    line = f"[{start_time} -> {end_time}] {segment.text}"
                    print(f"    {line}")
                    target.write(line + "\n")
            else:
                plain_text = " ".join(segment.text.strip() for segment in result.segments if segment.text.strip())
                lines = self._split_text_lines(plain_text)
                for line in lines:
                    print(f"    {line}")
                    target.write(line + "\n")

        print(f"    已產出文字檔案: {output_file}")

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
            print(f"在 {self.audio_dir} 找不到相容的音訊檔案")
            return

        for index, audio_file in enumerate(audio_files, start=1):
            try:
                print(f"[{index}/{len(audio_files)}] 開始轉錄: {audio_file.name}")
                self.transcribe_file(audio_file)
            except Exception as exc:  # noqa: BLE001 - log and continue batch
                print(
                    f"處理 {audio_file.name} 時發生錯誤: "
                    f"{type(exc).__name__}: {exc or '<empty message>'}"
                )
