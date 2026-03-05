from dataclasses import dataclass
from typing import Iterable


@dataclass(slots=True)
class TranscriptSegment:
    start: float
    end: float
    text: str


@dataclass(slots=True)
class TranscriptionResult:
    language: str | None
    language_probability: float | None
    segments: Iterable[TranscriptSegment]
    has_timestamps: bool = True
