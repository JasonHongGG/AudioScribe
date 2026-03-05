import logging
import os

import uvicorn

from audioscribe.api.http import app


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print("Starting AudioScribe Backend Sidecar on port 8000...")
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8000,
        reload=os.environ.get("AUDIOSCRIBE_RELOAD", "0") == "1",
        reload_includes=["*.py"],
        timeout_keep_alive=600,
    )
