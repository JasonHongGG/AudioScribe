import os
import sys
from pathlib import Path


CREATE_NO_WINDOW = 0x08000000


def bootstrap_windows_cuda_dll() -> None:
    if sys.platform != "win32":
        return

    try:
        import importlib.util

        nvidia_spec = importlib.util.find_spec("nvidia")
        if nvidia_spec and nvidia_spec.submodule_search_locations:
            for nvidia_dir in nvidia_spec.submodule_search_locations:
                for bin_dir in Path(nvidia_dir).rglob("bin"):
                    if bin_dir.is_dir():
                        os.add_dll_directory(str(bin_dir))
                        os.environ["PATH"] = str(bin_dir) + os.pathsep + os.environ.get("PATH", "")
    except Exception:
        # Keep startup resilient; downstream model loading will report concrete failures.
        pass


def build_worker_env() -> dict[str, str]:
    env = os.environ.copy()
    env.setdefault("PYTHONUTF8", "1")
    env.setdefault("PYTHONIOENCODING", "utf-8")
    env.setdefault("PYTHONUNBUFFERED", "1")
    return env


def windows_subprocess_kwargs() -> dict[str, int]:
    if sys.platform != "win32":
        return {}
    return {"creationflags": CREATE_NO_WINDOW}
