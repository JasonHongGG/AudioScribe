from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from audioscribe.application.job_manager import JobManager
from audioscribe.infrastructure.log_stream import log_bus
from audioscribe.infrastructure.runtime import bootstrap_windows_cuda_dll


bootstrap_windows_cuda_dll()
BASE_DIR = Path(__file__).resolve().parents[2]
job_manager = JobManager(base_dir=BASE_DIR)


class TranscribeRequest(BaseModel):
    file_path: str
    provider: str
    model_size: str
    regions: dict | None = None


class JobStatusResponse(BaseModel):
    status: str
    job_id: str | None = None
    file: str | None = None
    progress: int | None = None
    message: str | None = None
    error: str | None = None


def create_app() -> FastAPI:
    app = FastAPI(title="AudioScribe AI Engine", version="2.0.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    class ExtractAudioRequest(BaseModel):
        file_path: str

    @app.get("/health")
    def health_check() -> dict:
        return {"status": "ok", "message": "AudioScribe AI Engine is running."}

    @app.post("/extract-audio")
    async def extract_audio(req: ExtractAudioRequest) -> dict:
        import asyncio
        from audioscribe.utils.ffmpeg import is_video_file, extract_audio_to_mp3

        source = Path(req.file_path)
        if not source.exists():
            return {"status": "error", "error": f"File not found: {req.file_path}"}

        if not is_video_file(source):
            # Not a video — no extraction needed, return original path
            return {"status": "success", "audio_path": str(source)}

        audio_dir = BASE_DIR.parent / "audio" / "tmp"
        print(f"audio_dir: {audio_dir}")
        audio_dir.mkdir(parents=True, exist_ok=True)
        output_mp3 = audio_dir / f"{source.stem}.mp3"

        # Skip if already extracted and source hasn't changed
        if output_mp3.exists() and output_mp3.stat().st_mtime >= source.stat().st_mtime:
            log_bus.write(f"[API] Using cached audio: {output_mp3.name}")
            return {"status": "success", "audio_path": str(output_mp3)}

        log_bus.write(f"[API] Extracting audio from video: {source.name} (this may take a while...)")
        try:
            # Run FFmpeg in a thread pool to avoid blocking the event loop
            await asyncio.to_thread(extract_audio_to_mp3, source, output_mp3)
            log_bus.write(f"[API] Audio extracted: {output_mp3.name}")
            return {"status": "success", "audio_path": str(output_mp3)}
        except Exception as exc:
            log_bus.write(f"[API] Audio extraction failed: {exc}")
            return {"status": "error", "error": str(exc)}

    @app.get("/stream-logs")
    async def stream_logs() -> StreamingResponse:
        q = log_bus.add_listener()
        return StreamingResponse(log_bus.stream(q), media_type="text/event-stream")

    @app.post("/transcribe")
    async def start_transcribe(req: TranscribeRequest) -> dict:
        audio_path = Path(req.file_path)
        if not audio_path.exists():
            return {"status": "error", "error": f"File not found: {req.file_path}"}

        log_bus.write(f"\n[API] Received transcription request for: {audio_path.name}")
        log_bus.write(f"[API] Provider: {req.provider} | Model: {req.model_size}")

        try:
            return job_manager.start_job(
                file_path=audio_path,
                provider=req.provider,
                model_size=req.model_size,
                regions=req.regions,
            )
        except Exception as exc:  # noqa: BLE001
            log_bus.write(f"[API] Error starting transcription: {exc}")
            return {"status": "error", "message": str(exc)}

    @app.get("/jobs/{job_id}", response_model=JobStatusResponse)
    async def get_job_status(job_id: str) -> dict:
        return job_manager.get_job_status(job_id)

    return app


app = create_app()
