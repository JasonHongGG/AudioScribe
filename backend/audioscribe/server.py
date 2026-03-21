import logging
import os

import uvicorn

from audioscribe.api.http import app, command_handlers
from audioscribe.infrastructure.process_watch import start_parent_watch


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    port = int(os.environ.get("AUDIOSCRIBE_BACKEND_PORT", "8000"))
    parent_pid = os.environ.get("AUDIOSCRIBE_PARENT_PID")
    stop_watch = start_parent_watch(int(parent_pid) if parent_pid else None, command_handlers.shutdown)
    logging.info("Starting AudioScribe Backend Sidecar on port %s", port)
    try:
        uvicorn.run(
            app,
            host="127.0.0.1",
            port=port,
            reload=os.environ.get("AUDIOSCRIBE_RELOAD", "0") == "1",
            reload_includes=["*.py"],
            timeout_keep_alive=600,
        )
    finally:
        stop_watch.set()
        command_handlers.shutdown()
