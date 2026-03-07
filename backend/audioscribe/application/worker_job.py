import traceback
from dataclasses import dataclass
from pathlib import Path

from audioscribe.application.transcription_service import TranscriptionService
from audioscribe.contracts import EditorSelectionPayload
from audioscribe.infrastructure.json_files import write_json
from audioscribe.infrastructure.runtime import bootstrap_windows_cuda_dll
from audioscribe.stt.provider_registry import create_stt_provider


@dataclass(slots=True)
class WorkerJobRequest:
    source_path: Path
    media_path: Path | None
    provider: str
    model_size: str
    result_file: Path
    progress_file: Path
    transcript_file: Path
    work_dir: Path
    editor_json: str | None = None


def _write_progress(progress_file: Path, progress: int) -> None:
    write_json(progress_file, {"status": "running", "progress": max(0, min(100, int(progress)))})


def _write_result(result_file: Path, payload: dict) -> None:
    write_json(result_file, payload)


def _normalize_editor_json(raw: str) -> dict:
    import json

    data = json.loads(raw)
    if not isinstance(data, dict):
        return {}

    editor = EditorSelectionPayload.model_validate(data)
    excludes = [
        [segment.start, segment.end]
        for segment in editor.segments
        if not segment.included
    ]
    return {
        "trim": [editor.trim_start, editor.trim_end]
        if editor.trim_start is not None and editor.trim_end is not None
        else None,
        "excludes": excludes,
    }


def execute_worker_job(req: WorkerJobRequest) -> int:
    bootstrap_windows_cuda_dll()
    _write_progress(req.progress_file, 1)
    req.result_file.parent.mkdir(parents=True, exist_ok=True)
    req.transcript_file.parent.mkdir(parents=True, exist_ok=True)
    req.work_dir.mkdir(parents=True, exist_ok=True)

    if not req.source_path.exists():
        _write_result(req.result_file, {"status": "error", "message": f"File not found: {req.source_path}"})
        return 1

    try:
        regions = _normalize_editor_json(req.editor_json) if req.editor_json else None
        provider = create_stt_provider(req.provider, model_size=req.model_size)
        service = TranscriptionService(
            provider=provider,
            progress_callback=lambda p: _write_progress(req.progress_file, p),
            tmp_dir=req.work_dir,
        )
        audio_path = req.media_path or req.source_path
        output_path = service.transcribe_file(
            audio_path,
            req.transcript_file,
            regions_payload=regions,
        )

        _write_result(
            req.result_file,
            {
                "status": "success",
                "task_name": req.source_path.name,
                "transcript_path": str(output_path),
                "progress": 100,
            },
        )
        _write_progress(req.progress_file, 100)
        return 0
    except Exception as exc:  # noqa: BLE001
        traceback.print_exc()
        _write_result(
            req.result_file,
            {
                "status": "error",
                "message": str(exc),
                "details": f"{type(exc).__name__}: {exc}",
            },
        )
        return 1
