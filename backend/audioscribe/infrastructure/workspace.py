import hashlib
from dataclasses import dataclass, field
from pathlib import Path


@dataclass(slots=True)
class AssetPaths:
    asset_id: str
    root_dir: Path
    asset_file: Path


@dataclass(slots=True)
class WorkflowPaths:
    run_id: str
    root_dir: Path
    workflow_file: Path
    snapshot_file: Path
    events_file: Path
    transcript_file: Path
    work_dir: Path


@dataclass(slots=True)
class WorkspacePaths:
    base_dir: Path
    root_dir: Path = field(init=False)
    assets_dir: Path = field(init=False)
    workflows_dir: Path = field(init=False)
    media_cache_dir: Path = field(init=False)

    def __post_init__(self) -> None:
        self.root_dir = self.base_dir / "tmp"
        self.assets_dir = self.root_dir / "assets"
        self.workflows_dir = self.root_dir / "workflows"
        self.media_cache_dir = self.root_dir / "media-cache"
        self.assets_dir.mkdir(parents=True, exist_ok=True)
        self.workflows_dir.mkdir(parents=True, exist_ok=True)
        self.media_cache_dir.mkdir(parents=True, exist_ok=True)

    def create_asset_paths(self, asset_id: str) -> AssetPaths:
        root_dir = self.assets_dir / asset_id
        root_dir.mkdir(parents=True, exist_ok=True)
        return AssetPaths(asset_id=asset_id, root_dir=root_dir, asset_file=root_dir / "asset.json")

    def asset_paths(self, asset_id: str) -> AssetPaths:
        root_dir = self.assets_dir / asset_id
        return AssetPaths(asset_id=asset_id, root_dir=root_dir, asset_file=root_dir / "asset.json")

    def create_workflow_paths(self, run_id: str) -> WorkflowPaths:
        root_dir = self.workflows_dir / run_id
        root_dir.mkdir(parents=True, exist_ok=True)
        outputs_dir = root_dir / "outputs"
        outputs_dir.mkdir(parents=True, exist_ok=True)
        work_dir = root_dir / "work"
        work_dir.mkdir(parents=True, exist_ok=True)
        return WorkflowPaths(
            run_id=run_id,
            root_dir=root_dir,
            workflow_file=root_dir / "workflow.json",
            snapshot_file=root_dir / "snapshot.json",
            events_file=root_dir / "events.ndjson",
            transcript_file=outputs_dir / "transcript.txt",
            work_dir=work_dir,
        )

    def workflow_paths(self, run_id: str) -> WorkflowPaths:
        root_dir = self.workflows_dir / run_id
        outputs_dir = root_dir / "outputs"
        work_dir = root_dir / "work"
        return WorkflowPaths(
            run_id=run_id,
            root_dir=root_dir,
            workflow_file=root_dir / "workflow.json",
            snapshot_file=root_dir / "snapshot.json",
            events_file=root_dir / "events.ndjson",
            transcript_file=outputs_dir / "transcript.txt",
            work_dir=work_dir,
        )

    def iter_workflow_dirs(self) -> list[Path]:
        return [path for path in self.workflows_dir.iterdir() if path.is_dir()]

    def media_cache_path(self, source_path: Path) -> Path:
        fingerprint = self._source_fingerprint(source_path)
        cache_dir = self.media_cache_dir / fingerprint
        cache_dir.mkdir(parents=True, exist_ok=True)
        return cache_dir / "audio.mp3"

    def waveform_cache_path(self, source_path: Path) -> Path:
        fingerprint = self._source_fingerprint(source_path)
        cache_dir = self.media_cache_dir / fingerprint
        cache_dir.mkdir(parents=True, exist_ok=True)
        return cache_dir / "waveform.json"

    def waveform_cache_dir(self, source_path: Path) -> Path:
        fingerprint = self._source_fingerprint(source_path)
        cache_dir = self.media_cache_dir / fingerprint
        cache_dir.mkdir(parents=True, exist_ok=True)
        return cache_dir

    def waveform_tile_cache_path(self, source_path: Path, level: int, tile_start_time: float, tile_end_time: float) -> Path:
        cache_dir = self.waveform_cache_dir(source_path) / "tiles"
        cache_dir.mkdir(parents=True, exist_ok=True)
        tile_key = f"l{level}-{tile_start_time:.6f}-{tile_end_time:.6f}.json"
        return cache_dir / tile_key

    @staticmethod
    def _source_fingerprint(source_path: Path) -> str:
        stat = source_path.stat()
        payload = f"{source_path.resolve()}::{stat.st_size}::{stat.st_mtime_ns}".encode("utf-8", errors="replace")
        return hashlib.sha1(payload).hexdigest()[:16]