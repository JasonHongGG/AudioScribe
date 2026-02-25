from audioscribe.config import FasterWhisperConfig, Qwen3AsrConfig
from audioscribe.interfaces.stt import STTProvider
from audioscribe.stt.faster_whisper_provider import FasterWhisperSTTProvider
from audioscribe.stt.qwen3_asr_provider import Qwen3AsrSTTProvider


class STTFactory:
    @staticmethod
    def create(provider: str) -> STTProvider:
        normalized = provider.strip().lower()

        if normalized in {"faster-whisper", "whisper"}:
            return FasterWhisperSTTProvider(FasterWhisperConfig())

        if normalized in {"qwen3-asr", "qwen", "qwen-asr"}:
            return Qwen3AsrSTTProvider(Qwen3AsrConfig())

        raise ValueError(
            f"不支援的 STT provider: {provider}，可用選項: faster-whisper, qwen3-asr"
        )
