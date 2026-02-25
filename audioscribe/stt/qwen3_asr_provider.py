from pathlib import Path
from typing import Any

from audioscribe.config import Qwen3AsrConfig
from audioscribe.interfaces.stt import STTProvider
from audioscribe.models import TranscriptSegment, TranscriptionResult


class Qwen3AsrSTTProvider(STTProvider):
    def __init__(self, config: Qwen3AsrConfig) -> None:
        try:
            import av
            import numpy as np
            import torch
            from qwen_asr import Qwen3ASRModel
        except ImportError as exc:
            raise RuntimeError(
                "找不到 qwen-asr/torch/av/numpy，請先執行: uv sync --extra qwen"
            ) from exc

        self._av = av
        self._np = np
        dtype = self._resolve_dtype(torch, config.dtype)
        self._language = config.language
        self._return_time_stamps = config.return_time_stamps
        init_kwargs: dict[str, Any] = {
            "dtype": dtype,
            "device_map": config.device_map,
            "max_inference_batch_size": config.max_inference_batch_size,
            "max_new_tokens": config.max_new_tokens,
        }
        if config.forced_aligner:
            init_kwargs["forced_aligner"] = config.forced_aligner
            init_kwargs["forced_aligner_kwargs"] = {
                "dtype": dtype,
                "device_map": config.device_map,
            }

        self._model = Qwen3ASRModel.from_pretrained(
            config.model_name,
            **init_kwargs,
        )

    def transcribe(self, audio_path: Path) -> TranscriptionResult:
        kwargs: dict[str, Any] = {
            "audio": str(audio_path),
            "language": self._language,
        }
        if self._return_time_stamps:
            kwargs["return_time_stamps"] = True

        try:
            results = self._model.transcribe(**kwargs)
        except Exception as first_error:
            audio = self._load_audio_with_av(audio_path)
            if audio is None:
                raise RuntimeError(
                    f"Qwen3-ASR 讀取音檔失敗 ({audio_path.name}): {type(first_error).__name__}: {first_error}"
                ) from first_error

            fallback_kwargs: dict[str, Any] = {
                "audio": audio,
                "language": self._language,
            }
            if self._return_time_stamps:
                fallback_kwargs["return_time_stamps"] = True

            try:
                results = self._model.transcribe(**fallback_kwargs)
            except Exception as second_error:
                raise RuntimeError(
                    "Qwen3-ASR 轉錄失敗（已嘗試路徑讀取與 PyAV fallback）: "
                    f"{type(first_error).__name__}: {first_error}; "
                    f"{type(second_error).__name__}: {second_error}"
                ) from second_error

        if not results:
            return TranscriptionResult(language=None, language_probability=None, segments=[])

        result = results[0]
        segments = self._extract_segments(result)
        text = self._pick_field(result, "text")

        if not segments and text:
            segments = [TranscriptSegment(start=0.0, end=0.0, text=str(text))]

        return TranscriptionResult(
            language=self._pick_field(result, "language"),
            language_probability=None,
            segments=segments,
        )

    @staticmethod
    def _resolve_dtype(torch_module: Any, dtype_name: str) -> Any:
        if dtype_name == "float16":
            return torch_module.float16
        if dtype_name == "float32":
            return torch_module.float32
        return torch_module.bfloat16

    @staticmethod
    def _extract_segments(result: Any) -> list[TranscriptSegment]:
        time_stamps = Qwen3AsrSTTProvider._pick_field(result, "time_stamps")
        if not time_stamps:
            time_stamps = Qwen3AsrSTTProvider._pick_field(result, "timestamps")
        if not time_stamps:
            return []

        segments: list[TranscriptSegment] = []
        for item in time_stamps:
            text = Qwen3AsrSTTProvider._pick_field(item, "text")
            start = Qwen3AsrSTTProvider._pick_field(item, "start_time")
            end = Qwen3AsrSTTProvider._pick_field(item, "end_time")

            if isinstance(item, (list, tuple)) and len(item) >= 3:
                start = item[0]
                end = item[1]
                text = item[2]

            if text is None or start is None or end is None:
                continue
            segments.append(TranscriptSegment(start=float(start), end=float(end), text=str(text)))
        return segments

    @staticmethod
    def _pick_field(source: Any, key: str) -> Any:
        if isinstance(source, dict):
            return source.get(key)
        return getattr(source, key, None)

    def _load_audio_with_av(self, audio_path: Path) -> tuple[Any, int] | None:
        try:
            container = self._av.open(str(audio_path))
        except Exception:
            return None

        chunks: list[Any] = []
        sample_rate: int | None = None
        try:
            audio_stream = next((stream for stream in container.streams if stream.type == "audio"), None)
            if audio_stream is None:
                return None

            for frame in container.decode(audio=0):
                array = frame.to_ndarray()
                if array.ndim == 2:
                    array = array.mean(axis=0)
                chunks.append(array.astype(self._np.float32, copy=False))
                sample_rate = frame.sample_rate or sample_rate
        finally:
            container.close()

        if not chunks or sample_rate is None:
            return None

        waveform = self._np.concatenate(chunks).astype(self._np.float32, copy=False)
        return waveform, int(sample_rate)
