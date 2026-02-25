from dataclasses import dataclass


@dataclass(slots=True)
class TranscriptSegment:
    start: float
    end: float
    text: str


@dataclass(slots=True)
class TranscriptionResult:
    language: str | None
    language_probability: float | None
    segments: list[TranscriptSegment]
