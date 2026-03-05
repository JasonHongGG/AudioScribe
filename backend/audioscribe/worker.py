import argparse
import json
import os
import sys
import threading
import time
import traceback
from pathlib import Path

from audioscribe.batch_transcriber import BatchTranscriber


def _bootstrap_windows_cuda_dll() -> None:
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
        # If nvidia packages are unavailable, keep going and let model load report the real error.
        pass


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="AudioScribe transcription worker")
    parser.add_argument("--file-path", required=True, help="Absolute path to audio file")
    parser.add_argument("--provider", required=True, help="STT provider name")
    parser.add_argument("--model-size", required=True, help="Model size")
    parser.add_argument("--result-file", required=True, help="Result JSON output path")
    parser.add_argument("--progress-file", required=False, help="Progress JSON output path")
    parser.add_argument("--regions-json", required=False, help="JSON string for regions config")
    return parser.parse_args()


def write_result(result_path: Path, payload: dict) -> None:
    result_path.parent.mkdir(parents=True, exist_ok=True)
    with result_path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def write_progress(progress_path: Path | None, percent: int) -> None:
    if progress_path is None:
        return

    progress_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "status": "running",
        "progress": max(0, min(100, int(percent))),
    }
    with progress_path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def main() -> int:
    os.environ.setdefault("PYTHONUTF8", "1")
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    _bootstrap_windows_cuda_dll()

    args = parse_args()
    audio_path = Path(args.file_path)
    result_file = Path(args.result_file)
    progress_file = Path(args.progress_file) if args.progress_file else None

    progress_state = {
        "value": 1,
        "updated_at": time.monotonic(),
        "done": False,
    }
    progress_lock = threading.Lock()

    def set_progress(value: int) -> None:
        with progress_lock:
            clamped = max(0, min(100, int(value)))
            if clamped <= progress_state["value"]:
                return
            progress_state["value"] = clamped
            progress_state["updated_at"] = time.monotonic()
        write_progress(progress_file, clamped)

    def heartbeat() -> None:
        while True:
            with progress_lock:
                if progress_state["done"]:
                    return
                value = int(progress_state["value"])
                idle_sec = time.monotonic() - float(progress_state["updated_at"])

            if value < 95 and idle_sec >= 2.5:
                set_progress(value + 1)

            time.sleep(1.0)

    write_progress(progress_file, 1)
    hb_thread = threading.Thread(target=heartbeat, daemon=True)
    hb_thread.start()

    if not audio_path.exists():
        write_result(
            result_file,
            {
                "status": "error",
                "message": f"File not found: {audio_path}",
            },
        )
        return 1

    try:
        from audioscribe.config import FasterWhisperConfig
        from audioscribe.stt.faster_whisper_provider import FasterWhisperSTTProvider

        if args.provider != "faster-whisper":
            raise RuntimeError(f"Provider not supported yet: {args.provider}")

        if args.regions_json:
            regions_data = json.loads(args.regions_json)
            if "excludes" in regions_data:
                val = regions_data.pop("excludes")
                if val:
                    regions_data["exclude"] = val
            regions_file = audio_path.with_name(audio_path.stem + ".regions.json")
            with regions_file.open("w", encoding="utf-8") as f:
                json.dump(regions_data, f, ensure_ascii=False, indent=4)

        config = FasterWhisperConfig(model_size=args.model_size)
        provider = FasterWhisperSTTProvider(config)
        transcriber = BatchTranscriber(
            stt_provider=provider,
            audio_dir=str(audio_path.parent),
            output_dir=str(audio_path.parent / "output"),
            progress_callback=set_progress,
        )

        transcriber.transcribe_file(audio_path)

        write_result(
            result_file,
            {
                "status": "success",
                "file": audio_path.name,
            },
        )
        set_progress(100)
        with progress_lock:
            progress_state["done"] = True
        return 0
    except Exception as exc:  # noqa: BLE001
        with progress_lock:
            progress_state["done"] = True
        write_result(
            result_file,
            {
                "status": "error",
                "message": str(exc),
                "traceback": traceback.format_exc(),
            },
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
