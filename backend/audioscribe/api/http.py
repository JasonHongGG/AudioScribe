from pathlib import Path

from fastapi import FastAPI, HTTPException

from audioscribe.application.job_manager import JobManager
from audioscribe.contracts import (
    ExtractMediaRequest,
    ExtractMediaResponse,
    HealthResponse,
    JobAcceptedResponse,
    JobStatusResponse,
    StartTranscriptionRequest,
)
from audioscribe.infrastructure.log_stream import log_bus
from audioscribe.infrastructure.runtime import bootstrap_windows_cuda_dll
from audioscribe.infrastructure.workspace import WorkspacePaths


bootstrap_windows_cuda_dll()
BASE_DIR = Path(__file__).resolve().parents[2]
workspace = WorkspacePaths(base_dir=BASE_DIR)
job_manager = JobManager(base_dir=BASE_DIR, workspace=workspace)


def create_app() -> FastAPI:
    app = FastAPI(title="AudioScribe AI Engine", version="2.0.0")

    @app.get("/health", response_model=HealthResponse)
    def health_check() -> HealthResponse:
        return HealthResponse(status="ok", message="AudioScribe AI Engine is running.", endpoint="local-sidecar")

    @app.post("/extract-media", response_model=ExtractMediaResponse)
    async def extract_audio(req: ExtractMediaRequest) -> ExtractMediaResponse:
        import asyncio
        from audioscribe.utils.ffmpeg import is_video_file, extract_audio_to_mp3

        source = Path(req.source_path)
        if not source.exists():
            return ExtractMediaResponse(status="error", error=f"File not found: {req.source_path}")

        if not is_video_file(source):
            return ExtractMediaResponse(status="ready", media_path=str(source))

        output_mp3 = workspace.media_cache_path(source)

        if output_mp3.exists() and output_mp3.stat().st_mtime >= source.stat().st_mtime:
            log_bus.write(f"[API] Using cached audio: {output_mp3.name}")
            return ExtractMediaResponse(status="ready", media_path=str(output_mp3))

        log_bus.write(f"[API] Extracting audio from video: {source.name} (this may take a while...)")
        try:
            await asyncio.to_thread(extract_audio_to_mp3, source, output_mp3)
            log_bus.write(f"[API] Audio extracted: {output_mp3.name}")
            return ExtractMediaResponse(status="ready", media_path=str(output_mp3))
        except Exception as exc:
            log_bus.write(f"[API] Audio extraction failed: {exc}")
            return ExtractMediaResponse(status="error", error=str(exc))

    @app.post("/transcriptions", response_model=JobAcceptedResponse)
    async def start_transcribe(req: StartTranscriptionRequest) -> dict:
        source_path = Path(req.source_path)
        if not source_path.exists():
            raise HTTPException(status_code=404, detail=f"File not found: {req.source_path}")

        log_bus.write(f"\n[API] Received transcription request for: {source_path.name}")
        log_bus.write(f"[API] Provider: {req.options.provider_id} | Model: {req.options.model_id}")

        try:
            return job_manager.start_job(req)
        except Exception as exc:  # noqa: BLE001
            log_bus.write(f"[API] Error starting transcription: {exc}")
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    @app.get("/jobs/{job_id}", response_model=JobStatusResponse)
    async def get_job_status(job_id: str) -> dict:
        return job_manager.get_job_status(job_id)

    return app


app = create_app()
