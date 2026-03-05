import asyncio
import logging
import sys
from typing import AsyncGenerator

class LogBuffer:
    def __init__(self):
        self.listeners: list[asyncio.Queue] = []

    def add_listener(self) -> asyncio.Queue:
        q = asyncio.Queue()
        self.listeners.append(q)
        return q

    def remove_listener(self, q: asyncio.Queue):
        if q in self.listeners:
            self.listeners.remove(q)

    def write(self, message: str):
        # Keep console logging resilient on Windows code pages (e.g. cp950).
        try:
            print(message, flush=True)
        except UnicodeEncodeError:
            safe = message.encode("utf-8", errors="backslashreplace").decode("utf-8", errors="ignore")
            try:
                print(safe, flush=True)
            except Exception:
                try:
                    sys.stdout.buffer.write((safe + "\n").encode("utf-8", errors="backslashreplace"))
                    sys.stdout.flush()
                except Exception:
                    pass
        try:
            loop = asyncio.get_running_loop()
            for q in self.listeners:
                loop.call_soon_threadsafe(q.put_nowait, message)
        except RuntimeError:
            pass # No event loop running yet (e.g. during startup), just print

global_logger = LogBuffer()

async def get_log_stream(q: asyncio.Queue) -> AsyncGenerator[str, None]:
    try:
        while True:
            # Wait for the next log message
            message = await q.get()
            yield f"data: {message}\n\n"
            q.task_done()
    except asyncio.CancelledError:
        global_logger.remove_listener(q)
        raise
