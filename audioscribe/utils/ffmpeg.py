import json
import subprocess
from pathlib import Path


def get_audio_duration(audio_path: Path) -> float:
    """Get the duration of an audio file in seconds using ffprobe."""
    cmd = [
        "ffprobe",
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(audio_path)
    ]
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
    return float(result.stdout.strip())


def extract_audio_chunk(input_path: Path, output_path: Path, start: float, end: float) -> None:
    """Extract a chunk of audio using ffmpeg."""
    # We use -y to overwrite output if it exists
    # -ss before -i is faster for seeking, but since we are doing precise cuts and converting,
    # putting -ss before -i might cut at keyframes depending on format. To be safe with audio,
    # we can put -ss before -i and also re-encode or just put it after -i.
    # Since it's audio, decoding the whole thing is fast anyway, but -ss before -i is fine.
    # Using flac for the temporary chunk to preserve quality without huge file sizes like wav.
    cmd = [
        "ffmpeg",
        "-y",
        "-ss", str(start),
        "-i", str(input_path),
        "-t", str(end - start),
        "-c:a", "flac",
        str(output_path)
    ]
    subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
