import argparse
from pathlib import Path

from audioscribe.application.worker_job import WorkerJobRequest, execute_worker_job


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="AudioScribe transcription worker")
    parser.add_argument("--file-path", required=True, help="Absolute path to audio file")
    parser.add_argument("--provider", required=True, help="STT provider name")
    parser.add_argument("--model-size", required=True, help="Model size")
    parser.add_argument("--result-file", required=True, help="Result JSON output path")
    parser.add_argument("--progress-file", required=True, help="Progress JSON output path")
    parser.add_argument("--regions-json", required=False, help="JSON string for regions config")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    req = WorkerJobRequest(
        file_path=Path(args.file_path),
        provider=args.provider,
        model_size=args.model_size,
        result_file=Path(args.result_file),
        progress_file=Path(args.progress_file),
        regions_json=args.regions_json,
    )
    return execute_worker_job(req)


if __name__ == "__main__":
    raise SystemExit(main())
