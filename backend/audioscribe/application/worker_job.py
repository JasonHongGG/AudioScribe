import traceback
from dataclasses import dataclass
from pathlib import Path

from audioscribe.application.transcription_service import TranscriptionService
from audioscribe.config import FasterWhisperConfig
from audioscribe.infrastructure.json_files import write_json
from audioscribe.infrastructure.runtime import bootstrap_windows_cuda_dll
from audioscribe.stt.faster_whisper_provider import FasterWhisperSTTProvider


@dataclass(slots=True)
class WorkerJobRequest:
    file_path: Path
    provider: str
    model_size: str
    result_file: Path
    progress_file: Path
    regions_json: str | None = None


def _write_progress(progress_file: Path, progress: int) -> None:
    write_json(progress_file, {"status": "running", "progress": max(0, min(100, int(progress)))})


def _write_result(result_file: Path, payload: dict) -> None:
    write_json(result_file, payload)


def _normalize_regions_json(raw: str) -> dict:
    import json

    data = json.loads(raw)
    if not isinstance(data, dict):
        return {}

    regions_data = dict(data)
    if "excludes" in regions_data:
        value = regions_data.pop("excludes")
        if value:
            regions_data["exclude"] = value
    return regions_data


def execute_worker_job(req: WorkerJobRequest) -> int:
    bootstrap_windows_cuda_dll()
    _write_progress(req.progress_file, 1)

    if not req.file_path.exists():
        _write_result(req.result_file, {"status": "error", "message": f"File not found: {req.file_path}"})
        return 1

    try:
        if req.provider != "faster-whisper":
            raise RuntimeError(f"Provider not supported yet: {req.provider}")

        if req.regions_json:
            import json

            regions = _normalize_regions_json(req.regions_json)
            regions_file = req.file_path.with_name(req.file_path.stem + ".regions.json")
            with regions_file.open("w", encoding="utf-8") as f:
                json.dump(regions, f, ensure_ascii=False, indent=2)

        config = FasterWhisperConfig(model_size=req.model_size)
        provider = FasterWhisperSTTProvider(config)
        service = TranscriptionService(provider=provider, progress_callback=lambda p: _write_progress(req.progress_file, p))
        service.transcribe_file(req.file_path, req.file_path.parent / "output")

        _write_result(req.result_file, {"status": "success", "file": req.file_path.name, "progress": 100})
        _write_progress(req.progress_file, 100)
        return 0
    except Exception as exc:  # noqa: BLE001
        _write_result(
            req.result_file,
            {
                "status": "error",
                "message": str(exc),
                "traceback": traceback.format_exc(),
            },
        )
        return 1
