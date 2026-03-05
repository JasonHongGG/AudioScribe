import json
import logging
from dataclasses import dataclass
from pathlib import Path


@dataclass
class RegionConfig:
    trim: tuple[float, float] | None
    excludes: list[tuple[float, float]]


def _merge_intervals(intervals: list[tuple[float, float]]) -> list[tuple[float, float]]:
    if not intervals:
        return []
    
    # Sort by start time
    sorted_intervals = sorted(intervals, key=lambda x: x[0])
    merged = [sorted_intervals[0]]
    
    for current in sorted_intervals[1:]:
        prev_start, prev_end = merged[-1]
        curr_start, curr_end = current
        
        if curr_start <= prev_end:
            # Overlapping or adjacent, merge them
            merged[-1] = (prev_start, max(prev_end, curr_end))
        else:
            merged.append(current)
            
    return merged


def _subtract_intervals(base: list[tuple[float, float]], subtract: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """Subtract intervals from base intervals."""
    if not subtract:
        return base
        
    merged_subtract = _merge_intervals(subtract)
    
    result = []
    for b_start, b_end in base:
        current_chunks = [(b_start, b_end)]
        
        for s_start, s_end in merged_subtract:
            next_chunks = []
            for c_start, c_end in current_chunks:
                # If there's no overlap, keep the chunk as is
                if s_end <= c_start or s_start >= c_end:
                    next_chunks.append((c_start, c_end))
                else:
                    # There is overlap, split the chunk
                    if c_start < s_start:
                        next_chunks.append((c_start, s_start))
                    if s_end < c_end:
                        next_chunks.append((s_end, c_end))
            current_chunks = next_chunks
            
        result.extend(current_chunks)
        
    return result


def parse_regions_config(config_path: Path) -> RegionConfig | None:
    """Parse a regions.json file if it exists."""
    if not config_path.is_file():
        return None
        
    try:
        with config_path.open("r", encoding="utf-8") as f:
            data = json.load(f)
            
        trim_data = data.get("trim")
        trim: tuple[float, float] | None = None
        if isinstance(trim_data, list) and len(trim_data) == 2:
            trim = (float(trim_data[0]), float(trim_data[1]))
        exclude_data = data.get("exclude") or []
        excludes = [tuple(r) for r in exclude_data if isinstance(r, (list, tuple)) and len(r) == 2]
        return RegionConfig(trim=trim, excludes=excludes)
    except Exception as exc:
        logging.warning(f"Failed to parse regions config {config_path}: {exc}")
        return None


def resolve_trim_range(config: RegionConfig, max_duration: float) -> tuple[float, float]:
    """Resolve trim range and cap it to max_duration."""
    if config.trim is None:
        return (0.0, max_duration)

    start, end = config.trim
    start = max(0.0, min(start, max_duration))
    end = max(0.0, min(end, max_duration))
    if start >= end:
        return (0.0, max_duration)
    return (start, end)


def resolve_regions(config: RegionConfig, max_duration: float) -> list[tuple[float, float]]:
    """Resolve trim range minus excluded ranges up to max_duration."""
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
