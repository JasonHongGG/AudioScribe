import asyncio
import json
import os
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
SOURCE_BASE_DIR = Path(__file__).resolve().parents[2]
WORKSPACE_BASE_DIR = Path(os.environ.get("AUDIOSCRIBE_APP_DATA_DIR", SOURCE_BASE_DIR))
workspace = WorkspacePaths(base_dir=WORKSPACE_BASE_DIR)
job_manager = JobManager(base_dir=SOURCE_BASE_DIR, workspace=workspace)


def create_app() -> FastAPI:
    app = FastAPI(title="AudioScribe AI Engine", version="2.0.0")

    @app.get("/health", response_model=HealthResponse)
    def health_check() -> HealthResponse:
        return HealthResponse(status="ok", message="AudioScribe AI Engine is running.", endpoint="local-sidecar")

    @app.post("/extract-media", response_model=ExtractMediaResponse)
    async def extract_audio(req: ExtractMediaRequest) -> ExtractMediaResponse:
        from audioscribe.utils.ffmpeg import extract_audio_to_mp3, generate_waveform_peaks, is_video_file

        source = Path(req.source_path)
        if not source.exists():
            return ExtractMediaResponse(status="error", error=f"File not found: {req.source_path}")

        try:
            media_path = source

            if is_video_file(source):
                output_mp3 = workspace.media_cache_path(source)

                if output_mp3.exists() and output_mp3.stat().st_mtime >= source.stat().st_mtime:
                    log_bus.write(f"[API] Using cached audio: {output_mp3.name}")
                else:
                    log_bus.write(f"[API] Extracting audio from video: {source.name} (this may take a while...)")
                    await asyncio.to_thread(extract_audio_to_mp3, source, output_mp3)
                    log_bus.write(f"[API] Audio extracted: {output_mp3.name}")

                media_path = output_mp3

            waveform_cache = workspace.waveform_cache_path(source)
            waveform_payload = None

            if waveform_cache.exists() and waveform_cache.stat().st_mtime >= media_path.stat().st_mtime:
                waveform_payload = json.loads(waveform_cache.read_text(encoding="utf-8"))
                log_bus.write(f"[API] Using cached waveform: {source.name}")
            else:
                log_bus.write(f"[API] Generating waveform peaks: {source.name}")
                peaks, duration = await asyncio.to_thread(generate_waveform_peaks, media_path)
                waveform_payload = {"duration": duration, "peaks": peaks}
                waveform_cache.write_text(json.dumps(waveform_payload), encoding="utf-8")
                log_bus.write(f"[API] Waveform ready: {source.name}")

            return ExtractMediaResponse(
                status="ready",
                media_path=str(media_path),
                waveform=waveform_payload,
            )
        except Exception as exc:
            log_bus.write(f"[API] Media preparation failed: {exc}")
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
