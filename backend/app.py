import argparse

from audioscribe.batch_transcriber import BatchTranscriber
from audioscribe.factories.stt_factory import STTFactory


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="AudioScribe - Batch audio transcription")
    parser.add_argument("--audio-dir", default="audio", help="音訊資料夾")
    parser.add_argument("--output-dir", default="output", help="輸出資料夾")
    parser.add_argument(
        "--stt-provider",
        default="faster-whisper",
        choices=["faster-whisper", "qwen3-asr"],
        help="STT provider",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    stt_provider = STTFactory.create(args.stt_provider)

    transcriber = BatchTranscriber(
        stt_provider=stt_provider,
        audio_dir=args.audio_dir,
        output_dir=args.output_dir,
    )
    transcriber.transcribe_all()


if __name__ == "__main__":
    main()
