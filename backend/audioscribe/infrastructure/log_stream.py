import asyncio
import sys
from typing import AsyncGenerator


class LogBus:
    def __init__(self) -> None:
        self._listeners: list[asyncio.Queue[str]] = []

    def add_listener(self) -> asyncio.Queue[str]:
        q: asyncio.Queue[str] = asyncio.Queue()
        self._listeners.append(q)
        return q

    def remove_listener(self, q: asyncio.Queue[str]) -> None:
        if q in self._listeners:
            self._listeners.remove(q)

    def write(self, message: str) -> None:
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
            for q in self._listeners:
                loop.call_soon_threadsafe(q.put_nowait, message)
        except RuntimeError:
            pass

    async def stream(self, q: asyncio.Queue[str]) -> AsyncGenerator[str, None]:
        try:
            while True:
                message = await q.get()
                yield f"data: {message}\n\n"
                q.task_done()
        except asyncio.CancelledError:
            self.remove_listener(q)
            raise


log_bus = LogBus()
