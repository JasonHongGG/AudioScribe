from dataclasses import dataclass


@dataclass(slots=True)
class FasterWhisperConfig:
    # small, medium, large-v1, large-v2, large-v3, large, distil-large-v2, distil-large-v3, distil-large-v3.5, large-v3-turbo, turbo
    model_size: str = "medium"
    device: str = "cuda"
    compute_type: str = "int8_float16"
    beam_size: int = 5
    vad_filter: bool = False
    condition_on_previous_text: bool = False


@dataclass(slots=True)
class Qwen3AsrConfig:
    model_name: str = "Qwen/Qwen3-ASR-1.7B"
    forced_aligner: str = "Qwen/Qwen3-ForcedAligner-0.6B"
    device_map: str = "cuda:0"
    dtype: str = "bfloat16"
    max_inference_batch_size: int = 8
    max_new_tokens: int = 4096
    language: str | None = None
    return_time_stamps: bool = True
