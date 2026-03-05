from audioscribe.config import FasterWhisperConfig, Qwen3AsrConfig
from audioscribe.stt.base import STTProvider
from audioscribe.stt.faster_whisper_provider import FasterWhisperSTTProvider
from audioscribe.stt.qwen3_asr_provider import Qwen3AsrSTTProvider

SUPPORTED_PROVIDERS = ("faster-whisper", "qwen3-asr")


def create_stt_provider(provider: str, model_size: str | None = None) -> STTProvider:
    normalized = provider.strip().lower()

    if normalized in {"faster-whisper", "whisper"}:
        cfg = FasterWhisperConfig(model_size=model_size or FasterWhisperConfig.model_size)
        return FasterWhisperSTTProvider(cfg)

    if normalized in {"qwen3-asr", "qwen", "qwen-asr"}:
        return Qwen3AsrSTTProvider(Qwen3AsrConfig())

    raise ValueError(f"Unsupported STT provider: {provider}")
