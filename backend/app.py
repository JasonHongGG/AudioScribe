import argparse
from pathlib import Path
from typing import Iterable

from audioscribe.application.transcription_service import TranscriptionService
from audioscribe.infrastructure.log_stream import log_bus
from audioscribe.stt.provider_registry import SUPPORTED_PROVIDERS, create_stt_provider


SUPPORTED_EXTENSIONS = {".mp3", ".wav", ".m4a", ".flac", ".aac", ".ogg", ".mp4", ".mkv"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="AudioScribe - Batch audio transcription")
    parser.add_argument("--audio-dir", default="audio", help="音訊資料夾")
    parser.add_argument("--output-dir", default="output", help="輸出資料夾")
    parser.add_argument(
        "--stt-provider",
        default="faster-whisper",
        choices=list(SUPPORTED_PROVIDERS),
        help="STT provider",
    )
    parser.add_argument("--model-size", default="base", help="faster-whisper model size")
    return parser.parse_args()


def iter_audio_files(audio_dir: Path) -> Iterable[Path]:
    if not audio_dir.exists():
        log_bus.write(f"找不到音訊資料夾: {audio_dir.resolve()}")
        return []

    return (
        path
        for path in audio_dir.rglob("*")
        if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS
    )


def main() -> None:
    args = parse_args()
    stt_provider = create_stt_provider(args.stt_provider, model_size=args.model_size)
    service = TranscriptionService(provider=stt_provider)
    audio_dir = Path(args.audio_dir)
    output_dir = Path(args.output_dir)

    files = list(iter_audio_files(audio_dir))
    if not files:
        log_bus.write(f"在 {audio_dir} 找不到相容的音訊檔案")
        return

    for index, audio_file in enumerate(files, start=1):
        try:
            log_bus.write(f"[{index}/{len(files)}] 開始轉錄: {audio_file.name}")
            service.transcribe_file(audio_path=audio_file, output_dir=output_dir)
        except Exception as exc:  # noqa: BLE001
            log_bus.write(f"處理 {audio_file.name} 時發生錯誤: {type(exc).__name__}: {exc}")


if __name__ == "__main__":
    main()
