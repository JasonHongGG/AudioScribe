import os
import json
import math
import subprocess
from pathlib import Path

VIDEO_EXTENSIONS = {".mp4", ".mkv", ".avi", ".mov", ".webm", ".flv", ".wmv", ".ts"}


def _ffmpeg_executable() -> str:
    return os.environ.get("AUDIOSCRIBE_FFMPEG_PATH", "ffmpeg")


def _ffprobe_executable() -> str:
    return os.environ.get("AUDIOSCRIBE_FFPROBE_PATH", "ffprobe")


def is_video_file(path: Path) -> bool:
    """Check if a file is a video format that needs audio extraction."""
    return path.suffix.lower() in VIDEO_EXTENSIONS


def extract_audio_to_mp3(input_path: Path, output_path: Path) -> None:
    """Extract audio track from a video file and save as MP3 (192kbps)."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        _ffmpeg_executable(),
        "-y",
        "-i", str(input_path),
        "-vn",              # Strip video stream
        "-acodec", "libmp3lame",
        "-ab", "192k",
        str(output_path),
    ]
    subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)


def get_audio_duration(audio_path: Path) -> float:
    """Get the duration of an audio file in seconds using ffprobe."""
    cmd = [
        _ffprobe_executable(),
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(audio_path)
    ]
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
    return float(result.stdout.strip())


def generate_waveform_peaks(audio_path: Path, max_length: int = 8000) -> tuple[list[list[float]], float]:
    duration = get_audio_duration(audio_path)
    if duration <= 0:
        return ([[]], 0.0)

    samples_per_bucket = 128
    sample_rate = max(128, min(2000, math.ceil((max_length * samples_per_bucket) / duration)))
    total_frames = max(1, round(duration * sample_rate))
    peaks = [[0.0] * max_length for _ in range(2)]
    frame_index = 0

    cmd = [
        _ffmpeg_executable(),
        "-v", "error",
        "-i", str(audio_path),
        "-vn",
        "-ac", "2",
        "-ar", str(sample_rate),
        "-f", "f32le",
        "pipe:1",
    ]

    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert proc.stdout is not None
    remainder = b""

    try:
        while True:
            chunk = proc.stdout.read(65536)
            if not chunk:
                break

            payload = remainder + chunk
            consumed = len(payload) - (len(payload) % 8)
            if consumed == 0:
                remainder = payload
                continue

            remainder = payload[consumed:]
            samples = memoryview(payload[:consumed]).cast("f")

            for index in range(0, len(samples), 2):
                bucket = min(max_length - 1, (frame_index * max_length) // total_frames)
                left = float(samples[index])
                right = float(samples[index + 1])

                if abs(left) > abs(peaks[0][bucket]):
                    peaks[0][bucket] = max(-1.0, min(1.0, left))
                if abs(right) > abs(peaks[1][bucket]):
                    peaks[1][bucket] = max(-1.0, min(1.0, right))

                frame_index += 1
    finally:
        _stdout, stderr = proc.communicate()

    if proc.returncode != 0:
        raise RuntimeError(stderr.decode("utf-8", errors="replace").strip() or "ffmpeg waveform extraction failed")

    if peaks[0] == peaks[1]:
        return ([peaks[0]], duration)

    return (peaks, duration)


def extract_audio_chunk(input_path: Path, output_path: Path, start: float, end: float) -> None:
    """Extract a chunk of audio using ffmpeg."""
    # We use -y to overwrite output if it exists
    # -ss before -i is faster for seeking, but since we are doing precise cuts and converting,
    # putting -ss before -i might cut at keyframes depending on format. To be safe with audio,
    # we can put -ss before -i and also re-encode or just put it after -i.
    # Since it's audio, decoding the whole thing is fast anyway, but -ss before -i is fine.
    # Using flac for the temporary chunk to preserve quality without huge file sizes like wav.
    cmd = [
        _ffmpeg_executable(),
        "-y",
        "-ss", str(start),
        "-i", str(input_path),
        "-t", str(end - start),
        "-c:a", "flac",
        str(output_path)
    ]
    subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
