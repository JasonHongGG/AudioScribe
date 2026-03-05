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

    @app.get("/health")
    def health_check() -> dict:
        return {"status": "ok", "message": "AudioScribe AI Engine is running."}

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
