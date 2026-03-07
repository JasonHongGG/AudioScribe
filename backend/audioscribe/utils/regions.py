from collections.abc import Mapping, Sequence
from dataclasses import dataclass


@dataclass(slots=True)
class RegionConfig:
    trim: tuple[float, float] | None
    excludes: list[tuple[float, float]]


def _coerce_pair(value: object) -> tuple[float, float] | None:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)) or len(value) != 2:
        return None

    try:
        return (float(value[0]), float(value[1]))
    except (TypeError, ValueError):
        return None


def parse_regions_payload(payload: Mapping[str, object] | None) -> RegionConfig | None:
    if not payload:
        return None

    trim = _coerce_pair(payload.get("trim"))
    excludes_value = payload.get("excludes") or payload.get("exclude") or []
    excludes: list[tuple[float, float]] = []

    if isinstance(excludes_value, Sequence) and not isinstance(excludes_value, (str, bytes)):
        for item in excludes_value:
            pair = _coerce_pair(item)
            if pair is not None:
                excludes.append(pair)

    return RegionConfig(trim=trim, excludes=excludes)


def _merge_intervals(intervals: list[tuple[float, float]]) -> list[tuple[float, float]]:
    if not intervals:
        return []

    sorted_intervals = sorted(intervals, key=lambda x: x[0])
    merged = [sorted_intervals[0]]

    for current in sorted_intervals[1:]:
        prev_start, prev_end = merged[-1]
        curr_start, curr_end = current

        if curr_start <= prev_end:
            merged[-1] = (prev_start, max(prev_end, curr_end))
        else:
            merged.append(current)

    return merged


def _subtract_intervals(base: list[tuple[float, float]], subtract: list[tuple[float, float]]) -> list[tuple[float, float]]:
    if not subtract:
        return base

    merged_subtract = _merge_intervals(subtract)

    result = []
    for b_start, b_end in base:
        current_chunks = [(b_start, b_end)]

        for s_start, s_end in merged_subtract:
            next_chunks = []
            for c_start, c_end in current_chunks:
                if s_end <= c_start or s_start >= c_end:
                    next_chunks.append((c_start, c_end))
                else:
                    if c_start < s_start:
                        next_chunks.append((c_start, s_start))
                    if s_end < c_end:
                        next_chunks.append((s_end, c_end))
            current_chunks = next_chunks

        result.extend(current_chunks)

    return result


def resolve_trim_range(config: RegionConfig, max_duration: float) -> tuple[float, float]:
    if config.trim is None:
        return (0.0, max_duration)

    start, end = config.trim
    start = max(0.0, min(start, max_duration))
    end = max(0.0, min(end, max_duration))
    if start >= end:
        return (0.0, max_duration)
    return (start, end)


def resolve_regions(config: RegionConfig, max_duration: float) -> list[tuple[float, float]]:
    trim_start, trim_end = resolve_trim_range(config, max_duration)
    base_regions = [(trim_start, trim_end)]

    capped_excludes = []
    for start, end in config.excludes:
        start = max(trim_start, min(start, trim_end))
        end = max(trim_start, min(end, trim_end))
        if start < end:
            capped_excludes.append((start, end))

    final_regions = _subtract_intervals(base_regions, capped_excludes)
    return [r for r in final_regions if r[0] < r[1]]
