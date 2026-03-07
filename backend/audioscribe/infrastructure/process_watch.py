import ctypes
import os
import signal
import threading
import time
from collections.abc import Callable

from audioscribe.infrastructure.log_stream import log_bus


def _is_parent_alive_windows(parent_pid: int) -> bool:
    synchronize = 0x00100000
    handle = ctypes.windll.kernel32.OpenProcess(synchronize, False, parent_pid)
    if handle == 0:
        return False
    try:
        wait_result = ctypes.windll.kernel32.WaitForSingleObject(handle, 0)
        return wait_result == 0x00000102
    finally:
        ctypes.windll.kernel32.CloseHandle(handle)


def _is_parent_alive_posix(parent_pid: int) -> bool:
    try:
        os.kill(parent_pid, 0)
    except OSError:
        return False
    return True


def is_parent_alive(parent_pid: int) -> bool:
    if parent_pid <= 0:
        return True
    if os.name == "nt":
        return _is_parent_alive_windows(parent_pid)
    return _is_parent_alive_posix(parent_pid)


def start_parent_watch(parent_pid: int | None, on_parent_exit: Callable[[], None]) -> threading.Event:
    stop_event = threading.Event()

    if parent_pid is None:
        return stop_event

    def _watch() -> None:
        while not stop_event.wait(2.0):
            if is_parent_alive(parent_pid):
                continue

            log_bus.write(f"[Runtime] Parent process {parent_pid} is gone. Stopping backend sidecar.")
            try:
                on_parent_exit()
            finally:
                try:
                    os.kill(os.getpid(), signal.SIGTERM)
                except Exception:
                    os._exit(1)

    threading.Thread(target=_watch, name="parent-watch", daemon=True).start()
    return stop_event