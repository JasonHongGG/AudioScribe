import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchWaveformMetadata, fetchWaveformTile } from '../../services/backendClient';
import type { WaveformBarView, WaveformLevelView, WaveformView, WorkbenchEntry } from '../workbench/models';


interface WaveformTileCacheEntry {
    assetId: string;
    level: number;
    tileStartTime: number;
    tileEndTime: number;
    bars: WaveformBarView[];
}


function mapWaveformPayload(waveform: {
    duration: number;
    overview_bars: Array<{ start_time: number; end_time: number; amplitude: number }>;
    levels: Array<{ level: number; seconds_per_bar: number; bars_per_tile: number; tile_duration: number }>;
}): WaveformView {
    return {
        duration: waveform.duration,
        overviewBars: waveform.overview_bars.map((bar) => ({
            startTime: bar.start_time,
            endTime: bar.end_time,
            amplitude: bar.amplitude,
        })),
        levels: waveform.levels.map((level) => ({
            level: level.level,
            secondsPerBar: level.seconds_per_bar,
            barsPerTile: level.bars_per_tile,
            tileDuration: level.tile_duration,
        })),
    };
}


function selectDetailLevel(levels: WaveformLevelView[], pxPerSecond: number): WaveformLevelView | null {
    if (levels.length === 0 || pxPerSecond <= 0) {
        return null;
    }

    let bestLevel = levels[0] ?? null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const level of levels) {
        const pxPerBar = level.secondsPerBar * pxPerSecond;
        const score = Math.abs(pxPerBar - 6);
        if (score < bestScore) {
            bestLevel = level;
            bestScore = score;
        }
    }
    return bestLevel;
}


function buildTileKey(assetId: string, level: number, tileStartTime: number, tileEndTime: number): string {
    return `${assetId}:${level}:${tileStartTime}:${tileEndTime}`;
}


export function useWaveformQuery(
    entry: WorkbenchEntry | undefined,
    visibleRange: { start: number; end: number },
    pxPerSecond: number,
    playbackDuration: number,
) {
    const [waveform, setWaveform] = useState<WaveformView | null>(entry?.asset.media.waveform ?? null);
    const [tileCache, setTileCache] = useState<Record<string, WaveformTileCacheEntry>>({});
    const [isMetadataLoading, setIsMetadataLoading] = useState(false);
    const [waveformLoadProgress, setWaveformLoadProgress] = useState<number | null>(null);
    const lastRenderedBarsRef = useRef<WaveformBarView[]>(entry?.asset.media.waveform?.overviewBars ?? []);

    useEffect(() => {
        setWaveform(entry?.asset.media.waveform ?? null);
        setTileCache({});
        lastRenderedBarsRef.current = entry?.asset.media.waveform?.overviewBars ?? [];
    }, [entry?.asset.assetId, entry?.asset.media.waveform]);

    useEffect(() => {
        if (waveform || !entry) {
            return;
        }

        let cancelled = false;
        setIsMetadataLoading(true);
        setWaveformLoadProgress(15);

        void fetchWaveformMetadata(entry.asset.assetId)
            .then((response) => {
                if (cancelled) {
                    return;
                }
                setWaveform(mapWaveformPayload(response.waveform));
                setWaveformLoadProgress(100);
            })
            .catch((error) => {
                if (!cancelled) {
                    console.error('Failed to load waveform metadata:', error);
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setIsMetadataLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [entry, waveform]);

    const detailLevel = useMemo(() => selectDetailLevel(waveform?.levels ?? [], pxPerSecond), [waveform?.levels, pxPerSecond]);

    useEffect(() => {
        if (!entry || !waveform || !detailLevel || visibleRange.end <= visibleRange.start) {
            return;
        }

        const resolvedDuration = playbackDuration || waveform.duration;
        const preloadPadding = (visibleRange.end - visibleRange.start) * 0.5;
        const requestStart = Math.max(0, visibleRange.start - preloadPadding);
        const requestEnd = Math.min(resolvedDuration, visibleRange.end + preloadPadding);
        const firstTileStart = Math.floor(requestStart / detailLevel.tileDuration) * detailLevel.tileDuration;
        const lastTileStart = Math.floor(requestEnd / detailLevel.tileDuration) * detailLevel.tileDuration;
        const requestedTiles: Array<{ tileStartTime: number; tileEndTime: number }> = [];

        for (let tileStartTime = firstTileStart; tileStartTime <= lastTileStart; tileStartTime += detailLevel.tileDuration) {
            const tileEndTime = Math.min(resolvedDuration, tileStartTime + detailLevel.tileDuration);
            const key = buildTileKey(entry.asset.assetId, detailLevel.level, tileStartTime, tileEndTime);
            if (!tileCache[key]) {
                requestedTiles.push({ tileStartTime, tileEndTime });
            }
        }

        if (requestedTiles.length === 0) {
            return;
        }

        let cancelled = false;
        setWaveformLoadProgress((current) => current ?? 35);

        void Promise.all(requestedTiles.map(async ({ tileStartTime, tileEndTime }, index) => {
            const response = await fetchWaveformTile(entry.asset.assetId, detailLevel.level, tileStartTime, tileEndTime);
            if (cancelled) {
                return;
            }
            setTileCache((current) => ({
                ...current,
                [buildTileKey(entry.asset.assetId, response.level, response.tile_start_time, response.tile_end_time)]: {
                    assetId: entry.asset.assetId,
                    level: response.level,
                    tileStartTime: response.tile_start_time,
                    tileEndTime: response.tile_end_time,
                    bars: response.bars.map((bar) => ({
                        startTime: bar.start_time,
                        endTime: bar.end_time,
                        amplitude: bar.amplitude,
                    })),
                },
            }));
            setWaveformLoadProgress(35 + Math.round(((index + 1) / requestedTiles.length) * 65));
        }))
            .catch((error) => {
                if (!cancelled) {
                    console.error('Failed to load waveform tile:', error);
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setWaveformLoadProgress((current) => current);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [detailLevel, entry, playbackDuration, tileCache, visibleRange.end, visibleRange.start, waveform]);

    const renderBars = useMemo(() => {
        if (!waveform) {
            return [] as WaveformBarView[];
        }

        if (!detailLevel) {
            lastRenderedBarsRef.current = waveform.overviewBars;
            return waveform.overviewBars;
        }

        const matchingTiles = Object.values(tileCache)
            .filter((tile) => tile.assetId === entry?.asset.assetId && tile.level === detailLevel.level)
            .filter((tile) => tile.tileEndTime >= visibleRange.start && tile.tileStartTime <= visibleRange.end)
            .sort((left, right) => left.tileStartTime - right.tileStartTime);

        if (matchingTiles.length === 0) {
            return lastRenderedBarsRef.current.length > 0 ? lastRenderedBarsRef.current : waveform.overviewBars;
        }

        const resolvedBars = matchingTiles.flatMap((tile) => tile.bars);
        if (resolvedBars.length > 0) {
            lastRenderedBarsRef.current = resolvedBars;
        }
        return resolvedBars;
    }, [detailLevel, entry?.asset.assetId, tileCache, visibleRange.end, visibleRange.start, waveform]);

    return {
        waveform,
        renderBars,
        isWaveformLoading: isMetadataLoading,
        waveformLoadProgress,
    };
}