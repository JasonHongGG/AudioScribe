import argparse
import os
from pathlib import Path

from audioscribe.application.worker_run import execute_run_file
from audioscribe.infrastructure.workspace import WorkspacePaths


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="AudioScribe workflow worker")
    parser.add_argument("--workflow-file", required=True, help="Absolute path to workflow specification")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    source_base_dir = Path(__file__).resolve().parents[1]
    workspace_base_dir = Path(os.environ.get("AUDIOSCRIBE_APP_DATA_DIR", source_base_dir))
    workspace = WorkspacePaths(base_dir=workspace_base_dir)
    return execute_run_file(Path(args.workflow_file), workspace)


if __name__ == "__main__":
    raise SystemExit(main())
