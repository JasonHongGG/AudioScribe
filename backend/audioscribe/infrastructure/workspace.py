import hashlib
from dataclasses import dataclass, field
from pathlib import Path


@dataclass(slots=True)
class JobPaths:
    job_id: str
    root_dir: Path
    result_file: Path
    progress_file: Path
    transcript_file: Path
    work_dir: Path


@dataclass(slots=True)
class WorkspacePaths:
    base_dir: Path
    root_dir: Path = field(init=False)
    jobs_dir: Path = field(init=False)
    media_cache_dir: Path = field(init=False)

    def __post_init__(self) -> None:
        self.root_dir = self.base_dir / "tmp"
        self.jobs_dir = self.root_dir / "jobs"
        self.media_cache_dir = self.root_dir / "media-cache"
        self.jobs_dir.mkdir(parents=True, exist_ok=True)
        self.media_cache_dir.mkdir(parents=True, exist_ok=True)

    def create_job_paths(self, job_id: str) -> JobPaths:
        root_dir = self.jobs_dir / job_id
        root_dir.mkdir(parents=True, exist_ok=True)
        output_dir = root_dir / "outputs"
        output_dir.mkdir(parents=True, exist_ok=True)
        work_dir = root_dir / "work"
        work_dir.mkdir(parents=True, exist_ok=True)
        return JobPaths(
            job_id=job_id,
            root_dir=root_dir,
            result_file=root_dir / "result.json",
            progress_file=root_dir / "progress.json",
            transcript_file=output_dir / "transcript.txt",
            work_dir=work_dir,
        )

    def iter_job_dirs(self) -> list[Path]:
        return [path for path in self.jobs_dir.iterdir() if path.is_dir()]

    def media_cache_path(self, source_path: Path) -> Path:
        fingerprint = self._source_fingerprint(source_path)
        cache_dir = self.media_cache_dir / fingerprint
        cache_dir.mkdir(parents=True, exist_ok=True)
        return cache_dir / "audio.mp3"

    @staticmethod
    def _source_fingerprint(source_path: Path) -> str:
        stat = source_path.stat()
        payload = f"{source_path.resolve()}::{stat.st_size}::{stat.st_mtime_ns}".encode("utf-8", errors="replace")
        return hashlib.sha1(payload).hexdigest()[:16]