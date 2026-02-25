from pathlib import Path

from audioscribe.config import FasterWhisperConfig
from audioscribe.interfaces.stt import STTProvider
from audioscribe.models import TranscriptSegment, TranscriptionResult


class FasterWhisperSTTProvider(STTProvider):
    def __init__(self, config: FasterWhisperConfig) -> None:
        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:
            raise RuntimeError(
                "找不到 faster-whisper，請先執行: pip install faster-whisper"
            ) from exc

        self.vad_filter=config.vad_filter
        self._beam_size = config.beam_size
        self._model = WhisperModel(
            config.model_size,
            device=config.device,
            compute_type=config.compute_type,
        )

    def transcribe(self, audio_path: Path) -> TranscriptionResult:
        segments, info = self._model.transcribe(str(audio_path), beam_size=self._beam_size, vad_filter=self.vad_filter)
        normalized_segments = [
            TranscriptSegment(start=segment.start, end=segment.end, text=segment.text)
            for segment in segments
        ]
        return TranscriptionResult(
            language=info.language,
            language_probability=info.language_probability,
            segments=normalized_segments,
        )
