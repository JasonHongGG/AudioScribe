import os
import json
import math
import subprocess
from dataclasses import dataclass
from pathlib import Path

from audioscribe.infrastructure.runtime import windows_subprocess_kwargs

VIDEO_EXTENSIONS = {".mp4", ".mkv", ".avi", ".mov", ".webm", ".flv", ".wmv", ".ts"}


@dataclass(frozen=True, slots=True)
class WaveformLevelSpec:
    level: int
    seconds_per_bar: float
    bars_per_tile: int

    @property
    def tile_duration(self) -> float:
        return self.seconds_per_bar * self.bars_per_tile


WAVEFORM_LEVEL_SPECS = [
    WaveformLevelSpec(level=0, seconds_per_bar=12.0, bars_per_tile=256),
    WaveformLevelSpec(level=1, seconds_per_bar=3.0, bars_per_tile=256),
    WaveformLevelSpec(level=2, seconds_per_bar=0.75, bars_per_tile=256),
    WaveformLevelSpec(level=3, seconds_per_bar=0.1875, bars_per_tile=256),
    WaveformLevelSpec(level=4, seconds_per_bar=0.046875, bars_per_tile=256),
]


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
    subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, **windows_subprocess_kwargs())


def get_audio_duration(audio_path: Path) -> float:
    """Get the duration of an audio file in seconds using ffprobe."""
    cmd = [
        _ffprobe_executable(),
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(audio_path)
    ]
    result = subprocess.run(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=True,
        **windows_subprocess_kwargs(),
    )
    return float(result.stdout.strip())


def generate_waveform_bars(audio_path: Path, start_time: float = 0.0, end_time: float | None = None, bar_count: int = 1024) -> tuple[list[float], float]:
    duration = get_audio_duration(audio_path)
    if duration <= 0:
        return ([], 0.0)

    normalized_start = max(0.0, min(start_time, duration))
    normalized_end = duration if end_time is None else max(normalized_start, min(end_time, duration))
    segment_duration = normalized_end - normalized_start
    if segment_duration <= 0 or bar_count <= 0:
        return ([], duration)

    samples_per_bucket = 128
    sample_rate = max(128, min(4000, math.ceil((bar_count * samples_per_bucket) / segment_duration)))
    total_frames = max(1, round(segment_duration * sample_rate))
    amplitudes = [0.0] * bar_count
    frame_index = 0

    cmd = [
        _ffmpeg_executable(),
        "-v", "error",
        "-ss", str(normalized_start),
        "-i", str(audio_path),
        "-t", str(segment_duration),
        "-vn",
        "-ac", "1",
        "-ar", str(sample_rate),
        "-f", "f32le",
        "pipe:1",
    ]

    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, **windows_subprocess_kwargs())
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

            for sample in samples:
                bucket = min(bar_count - 1, (frame_index * bar_count) // total_frames)
                amplitude = max(0.0, min(1.0, abs(float(sample))))
                if amplitude > amplitudes[bucket]:
                    amplitudes[bucket] = amplitude
                frame_index += 1
    finally:
        _stdout, stderr = proc.communicate()

    if proc.returncode != 0:
        raise RuntimeError(stderr.decode("utf-8", errors="replace").strip() or "ffmpeg waveform extraction failed")

    return (amplitudes, duration)


def build_waveform_levels() -> list[WaveformLevelSpec]:
    return list(WAVEFORM_LEVEL_SPECS)


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
    subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, **windows_subprocess_kwargs())
