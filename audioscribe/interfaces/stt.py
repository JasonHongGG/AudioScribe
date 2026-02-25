from abc import ABC, abstractmethod
from pathlib import Path

from audioscribe.models import TranscriptionResult


class STTProvider(ABC):
    @abstractmethod
    def transcribe(self, audio_path: Path) -> TranscriptionResult:
        raise NotImplementedError
