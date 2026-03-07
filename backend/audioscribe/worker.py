import argparse
from pathlib import Path

from audioscribe.application.worker_job import WorkerJobRequest, execute_worker_job


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="AudioScribe transcription worker")
    parser.add_argument("--source-path", required=True, help="Absolute path to source media file")
    parser.add_argument("--media-path", required=False, help="Absolute path to prepared playback/transcription media")
    parser.add_argument("--provider", required=True, help="STT provider name")
    parser.add_argument("--model-size", required=True, help="Model size")
    parser.add_argument("--result-file", required=True, help="Result JSON output path")
    parser.add_argument("--progress-file", required=True, help="Progress JSON output path")
    parser.add_argument("--transcript-file", required=True, help="Transcript output path")
    parser.add_argument("--work-dir", required=True, help="Temporary workspace for the job")
    parser.add_argument("--editor-json", required=False, help="JSON string for editor selection")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    req = WorkerJobRequest(
        source_path=Path(args.source_path),
        media_path=Path(args.media_path) if args.media_path else None,
        provider=args.provider,
        model_size=args.model_size,
        result_file=Path(args.result_file),
        progress_file=Path(args.progress_file),
        transcript_file=Path(args.transcript_file),
        work_dir=Path(args.work_dir),
        editor_json=args.editor_json,
    )
    return execute_worker_job(req)


if __name__ == "__main__":
    raise SystemExit(main())
