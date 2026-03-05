from pathlib import Path
from typing import Generator

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

        self._vad_filter = config.vad_filter
        self._beam_size = config.beam_size
        self._condition_on_previous_text = config.condition_on_previous_text
        self._model = WhisperModel(
            config.model_size,
            device=config.device,
            compute_type=config.compute_type,
        )

    def transcribe(self, audio_path: Path) -> TranscriptionResult:
        segments, info = self._model.transcribe(
            str(audio_path),
            beam_size=self._beam_size,
            vad_filter=self._vad_filter,
            condition_on_previous_text=self._condition_on_previous_text,
        )

        # Keep segments as a lazy generator for streaming output
        def _iter_segments() -> Generator[TranscriptSegment, None, None]:
            for segment in segments:
                yield TranscriptSegment(
                    start=segment.start, end=segment.end, text=segment.text
                )

        return TranscriptionResult(
            language=info.language,
            language_probability=info.language_probability,
            segments=_iter_segments(),
            has_timestamps=True,
        )
