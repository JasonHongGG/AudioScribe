import logging
import asyncio
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Initialize FastAPI App
app = FastAPI(title="AudioScribe AI Engine", version="0.1.0")

# Allow requests from the Tauri frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to tauri://localhost
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from pathlib import Path

from audioscribe.logger import global_logger, get_log_stream
from audioscribe.batch_transcriber import BatchTranscriber
from audioscribe.interfaces.stt import STTProvider
# We will dynamically instantiate providers later, but mock it for now
from audioscribe.stt.faster_whisper_provider import FasterWhisperSTTProvider

@app.get("/health")
def health_check():
    """Simple endpoint to verify the Sidecar is running."""
    return {"status": "ok", "message": "AudioScribe AI Engine is running."}

@app.get("/stream-logs")
async def stream_logs():
    """SSE endpoint for streaming backend logs to the React UI."""
    q = global_logger.add_listener()
    return StreamingResponse(get_log_stream(q), media_type="text/event-stream")

import json

class TranscribeRequest(BaseModel):
    file_path: str
    provider: str
    model_size: str
    regions: dict | None = None

@app.post("/transcribe")
async def transcribe_endpoint(req: TranscribeRequest):
    """Triggers the transcription process for a specific file."""
    audio_path = Path(req.file_path)
    if not audio_path.exists():
        return {"error": f"File not found: {req.file_path}"}
        
    global_logger.write(f"\n[API] Received transcription request for: {audio_path.name}")
    global_logger.write(f"[API] Provider: {req.provider} | Model: {req.model_size}")

    # Write dynamic regions UI config to disk for the transriber to pick up
    if req.regions is not None:
        regions_file = audio_path.with_name(audio_path.stem + ".regions.json")
        with regions_file.open("w", encoding="utf-8") as f:
            json.dump(req.regions, f, ensure_ascii=False, indent=4)
        global_logger.write(f"[API] Saved dynamic regions from UI: {regions_file.name}")

    # TODO: Refactor config instantiation out of this scope later to avoid reloading models
    try:
        if req.provider == "faster-whisper":
            from audioscribe.config import FasterWhisperConfig
            config = FasterWhisperConfig(model=req.model_size)
            provider = FasterWhisperSTTProvider(config)
        else:
            return {"error": f"Provider not supported yet: {req.provider}"}
            
        transcriber = BatchTranscriber(
            stt_provider=provider,
            audio_dir=str(audio_path.parent),
            output_dir=str(audio_path.parent / "output")
        )
        
        # Run transcription in a separate thread so we don't block the ASGI event loop completely
        await asyncio.to_thread(transcriber.transcribe_file, audio_path)
        
        return {"status": "success", "file": audio_path.name}
    except Exception as e:
        global_logger.write(f"[API] Error during transcription: {e}")
        return {"status": "error", "message": str(e)}

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print("Starting AudioScribe Backend Sidecar on port 8000...")
    uvicorn.run("audioscribe.server:app", host="127.0.0.1", port=8000, reload=True)
