from pathlib import Path
from typing import Iterable
from datetime import timedelta

from faster_whisper import WhisperModel


class BatchTranscriber:
    """Batch process every audio file and write matching transcript files."""

    SUPPORTED_EXTENSIONS = {".mp3", ".wav", ".m4a", ".flac", ".aac", ".ogg"}

    def __init__(
        self,
        audio_dir: str = "audio",
        output_dir: str = "output",
        model_size: str = "medium",
        device: str = "cuda",
        compute_type: str = "int8_float16",
        beam_size: int = 5,
    ) -> None:
        self.audio_dir = Path(audio_dir)
        self.output_dir = Path(output_dir)
        self.beam_size = beam_size
        self.model = WhisperModel(model_size, device=device, compute_type=compute_type)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def iter_audio_files(self) -> Iterable[Path]:
        """Yield every supported audio file under the audio directory."""
        if not self.audio_dir.exists():
            print(f"找不到音訊資料夾: {self.audio_dir.resolve()}")
            return []

        return (
            path
            for path in self.audio_dir.rglob("*")
            if path.is_file() and path.suffix.lower() in self.SUPPORTED_EXTENSIONS
        )

    def transcribe_file(self, audio_path: Path) -> None:
        """Transcribe a single file and persist the transcript inside output dir."""
        segments, info = self.model.transcribe(str(audio_path), beam_size=self.beam_size)
        print(f"    偵測到語言: {info.language}，信心指數: {info.language_probability:.2f}")

        output_file = self.output_dir / f"{audio_path.stem}.txt"
        print(f"    產出文字檔案到: {output_file}")
        with output_file.open("w", encoding="utf-8") as target:
            for segment in segments:
                # Convert seconds to hh:mm:ss.mmm format
                start_time = str(timedelta(seconds=segment.start))
                end_time = str(timedelta(seconds=segment.end))
                print(f"    [{start_time} -> {end_time}] {segment.text}")
                line = f"[{start_time} -> {end_time}] {segment.text}"
                target.write(line + "\n")
        
        print(f"    已產出文字檔案: {output_file}")

    def transcribe_all(self) -> None:
        audio_files = list(self.iter_audio_files())
        if not audio_files:
            print(f"在 {self.audio_dir} 找不到相容的音訊檔案")
            return

        for audio_file in audio_files:
            try:
                print(f"[{audio_files.index(audio_file)+1}/{len(audio_files)}] 開始轉錄: {audio_file.name}")
                self.transcribe_file(audio_file)
            except Exception as exc:  # noqa: BLE001 - log and continue batch
                print(f"處理 {audio_file.name} 時發生錯誤: {exc}")


def main() -> None:
    transcriber = BatchTranscriber()
    transcriber.transcribe_all()


if __name__ == "__main__":
    main()
