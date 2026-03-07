import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { FileTask, TrimRange, AudioSegment } from '../tasks/types';

const MAX_ZOOM = 180;
const MAX_WAVEFORM_CACHE_ENTRIES = 8;

type WaveformCacheEntry = {
    peaks: Array<Float32Array | number[]>;
    duration: number;
};

type UpdateTask = (id: string, updater: FileTask | ((task: FileTask) => FileTask)) => void;

const waveformCache = new Map<string, WaveformCacheEntry>();

function rememberWaveform(audioPath: string, entry: WaveformCacheEntry) {
    if (waveformCache.has(audioPath)) {
        waveformCache.delete(audioPath);
    }

    waveformCache.set(audioPath, entry);

    while (waveformCache.size > MAX_WAVEFORM_CACHE_ENTRIES) {
        const oldestKey = waveformCache.keys().next().value;
        if (!oldestKey) {
            break;
        }
        waveformCache.delete(oldestKey);
    }
}

export function useWaveSurferController(task: FileTask | undefined, updateTask: UpdateTask) {
    const containerRef = useRef<HTMLDivElement>(null);
    const glassCardRef = useRef<HTMLDivElement>(null);
    const wavesurferRef = useRef<WaveSurfer | null>(null);

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [zoom, setZoom] = useState(50);
    const [minZoom, setMinZoom] = useState(1);
    const [scrollOffset, setScrollOffset] = useState(0);
    const [isWaveformLoading, setIsWaveformLoading] = useState(false);
    const [waveformLoadProgress, setWaveformLoadProgress] = useState<number | null>(null);
    const [, setResizeTick] = useState(0);

    const applyFitZoom = useCallback((ws: WaveSurfer, audioDuration: number) => {
        if (audioDuration <= 0) {
            return;
        }

        const viewportWidth = containerRef.current?.clientWidth ?? ws.getWidth();
        const fitZoom = Math.max(0.0001, viewportWidth / audioDuration);
        const nextZoom = Math.min(Math.max(fitZoom, 0.0001), MAX_ZOOM);

        setMinZoom(fitZoom);
        setZoom(nextZoom);
        ws.zoom(nextZoom);

        requestAnimationFrame(() => {
            ws.setScroll(0);
            setScrollOffset(0);
        });
    }, []);

    const getTimelineMetrics = useCallback(() => {
        const ws = wavesurferRef.current;
        const viewportWidth = ws?.getWidth() ?? containerRef.current?.clientWidth ?? 0;
        const scrollLeft = ws?.getScroll() ?? 0;
        const wrapperWidth = ws?.getWrapper()?.scrollWidth ?? 0;
        const totalWidth = wrapperWidth > 0
            ? wrapperWidth
            : (duration > 0 ? Math.max(viewportWidth, duration * zoom) : viewportWidth);

        return {
            viewportWidth,
            scrollLeft,
            totalWidth,
        };
    }, [duration, zoom]);

    useEffect(() => {
        if (!containerRef.current || !task) {
            return;
        }

        setCurrentTime(0);
        setDuration(0);
        setIsPlaying(false);
        setScrollOffset(0);
        setIsWaveformLoading(false);
        setWaveformLoadProgress(null);
        wavesurferRef.current?.destroy();

        const ws = WaveSurfer.create({
            container: containerRef.current,
            waveColor: '#5b5b5d',
            progressColor: 'rgba(250, 204, 21, 1)',
            cursorColor: 'rgba(250, 204, 21, 1)',
            cursorWidth: 2,
            height: 200,
            normalize: false,
            interact: false,
            minPxPerSec: zoom,
            hideScrollbar: true,
        });

        wavesurferRef.current = ws;

        const loadAudio = async () => {
            try {
                const audioPath = task.media.playbackPath;
                const waveform = task.media.waveform;

                if (!audioPath) {
                    return;
                }

                const isRawVideo = task.source.kind === 'video' && !task.media.extractionPath;
                if (isRawVideo) {
                    return;
                }

                const audioUrl = convertFileSrc(audioPath);
                const cachedWaveform = waveformCache.get(audioPath);

                setIsWaveformLoading(true);
                setWaveformLoadProgress(cachedWaveform ? 100 : null);

                if (waveform && waveform.peaks.length > 0 && waveform.duration > 0) {
                    rememberWaveform(audioPath, {
                        peaks: waveform.peaks,
                        duration: waveform.duration,
                    });
                    await ws.load(audioUrl, waveform.peaks, waveform.duration);
                    return;
                }

                if (cachedWaveform) {
                    await ws.load(audioUrl, cachedWaveform.peaks, cachedWaveform.duration);
                    return;
                }

                await ws.load(audioUrl);
            } catch (error: unknown) {
                if (error instanceof Error && error.name === 'AbortError') {
                    return;
                }
                setIsWaveformLoading(false);
                setWaveformLoadProgress(null);
                console.error('Failed to load audio source:', error);
            }
        };

        void loadAudio();

        ws.on('loading', (percent: number) => {
            setWaveformLoadProgress(percent);
        });

        ws.on('ready', () => {
            const audioDuration = ws.getDuration();
            const audioPath = task.media.playbackPath;

            setDuration(audioDuration);
            setIsWaveformLoading(false);
            setWaveformLoadProgress(100);

            if (audioDuration > 0) {
                applyFitZoom(ws, audioDuration);
            }

            const defaultTrim: TrimRange = { start: 0, end: audioDuration };
            const currentTrim = task.editor.trimRange ?? defaultTrim;
            const trimRange: TrimRange = {
                start: Math.max(0, Math.min(currentTrim.start, audioDuration)),
                end: Math.max(0, Math.min(currentTrim.end, audioDuration)),
            };

            setScrollOffset(0);

            if (task.editor.segments.length === 0) {
                const initialSegment: AudioSegment = {
                    id: crypto.randomUUID(),
                    start: trimRange.start,
                    end: trimRange.end,
                    included: true,
                };
                updateTask(task.id, (currentTask) => ({
                    ...currentTask,
                    editor: {
                        ...currentTask.editor,
                        trimRange,
                        segments: [initialSegment],
                    },
                }));
            } else if (!task.editor.trimRange) {
                updateTask(task.id, (currentTask) => ({
                    ...currentTask,
                    editor: {
                        ...currentTask.editor,
                        trimRange,
                    },
                }));
            }

            if (audioPath && !waveformCache.has(audioPath) && ws.getDecodedData()) {
                const scheduleCache = typeof window.requestIdleCallback === 'function'
                    ? window.requestIdleCallback.bind(window)
                    : (callback: IdleRequestCallback) => window.setTimeout(() => callback({
                        didTimeout: false,
                        timeRemaining: () => 0,
                    }), 0);

                scheduleCache(() => {
                    try {
                        rememberWaveform(audioPath, {
                            peaks: ws.exportPeaks(),
                            duration: audioDuration,
                        });
                    } catch (error) {
                        console.warn('Failed to cache waveform peaks', error);
                    }
                });
            }
        });

        let isUpdatingTime = false;
        ws.on('audioprocess', () => {
            if (isUpdatingTime) {
                return;
            }

            isUpdatingTime = true;
            requestAnimationFrame(() => {
                setCurrentTime(ws.getCurrentTime());
                isUpdatingTime = false;
            });
        });

        ws.on('seeking', () => setCurrentTime(ws.getCurrentTime()));
        ws.on('play', () => setIsPlaying(true));
        ws.on('pause', () => setIsPlaying(false));

        let isUpdatingScroll = false;
        ws.on('scroll', (_visibleStart, _visibleEnd, scrollLeft) => {
            if (isUpdatingScroll) {
                return;
            }

            isUpdatingScroll = true;
            requestAnimationFrame(() => {
                setScrollOffset(scrollLeft);
                isUpdatingScroll = false;
            });
        });

        ws.on('zoom', () => {
            setScrollOffset(ws.getScroll());
        });

        return () => {
            ws.destroy();
        };
    }, [applyFitZoom, task?.id, task?.media.playbackPath, task?.media.extractionPath, task?.media.waveform, task?.source.path, task?.source.kind, updateTask]);

    useEffect(() => {
        if (!containerRef.current) {
            return;
        }

        const observer = new ResizeObserver(() => {
            setResizeTick((tick) => tick + 1);
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const ws = wavesurferRef.current;
        if (!ws || duration <= 0) {
            return;
        }

        const shouldRefit = zoom <= minZoom * 1.02;
        if (!shouldRefit) {
            return;
        }

        applyFitZoom(ws, duration);
    }, [applyFitZoom, duration, minZoom, zoom]);

    useEffect(() => {
        wavesurferRef.current?.setVolume(volume);
    }, [volume]);

    useEffect(() => {
        const element = glassCardRef.current;
        if (!element) {
            return;
        }

        const handleWheel = (event: WheelEvent) => {
            const ws = wavesurferRef.current;
            if (!ws) {
                return;
            }

            const path = event.composedPath() as HTMLElement[];
            const isTimelineHover = path.some((node) => node.classList && node.classList.contains('timeline-container'));
            event.preventDefault();

            if (isTimelineHover) {
                if (Math.abs(event.deltaY) > 0) {
                    const currentZoom = ws.options.minPxPerSec || minZoom;
                    const nextZoom = Math.max(minZoom, Math.min(MAX_ZOOM, currentZoom - event.deltaY * 0.1));
                    setZoom(nextZoom);
                    ws.zoom(nextZoom);
                }
                if (Math.abs(event.deltaX) > 0) {
                    const maxScroll = ws.getWrapper().scrollWidth - ws.getWidth();
                    if (maxScroll <= 1) {
                        ws.setScroll(0);
                        setScrollOffset(0);
                        return;
                    }
                    const nextScroll = Math.max(0, Math.min(maxScroll, ws.getScroll() + event.deltaX));
                    ws.setScroll(nextScroll);
                    setScrollOffset(ws.getScroll());
                }
                return;
            }

            const panDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
            if (Math.abs(panDelta) > 0) {
                const maxScroll = ws.getWrapper().scrollWidth - ws.getWidth();
                if (maxScroll <= 1) {
                    ws.setScroll(0);
                    setScrollOffset(0);
                    return;
                }
                const nextScroll = Math.max(0, Math.min(maxScroll, ws.getScroll() + panDelta));
                ws.setScroll(nextScroll);
                setScrollOffset(ws.getScroll());
            }
        };

        element.addEventListener('wheel', handleWheel, { passive: false });
        return () => element.removeEventListener('wheel', handleWheel);
    }, [minZoom]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement).tagName)) {
                return;
            }

            const ws = wavesurferRef.current;
            if (!ws) {
                return;
            }

            switch (event.key) {
                case ' ':
                    event.preventDefault();
                    ws.playPause();
                    break;
                case 'ArrowLeft':
                    event.preventDefault();
                    ws.skip(-5);
                    break;
                case 'ArrowRight':
                    event.preventDefault();
                    ws.skip(5);
                    break;
                case ',':
                case '<':
                    event.preventDefault();
                    ws.skip(-1);
                    break;
                case '.':
                case '>':
                    event.preventDefault();
                    ws.skip(1);
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const api = useMemo(() => ({
        containerRef,
        glassCardRef,
        wavesurferRef,
        isPlaying,
        currentTime,
        duration,
        isWaveformLoading,
        waveformLoadProgress,
        volume,
        scrollOffset,
        getTimelineMetrics,
        setVolume,
        seekTo: (value: number) => wavesurferRef.current?.setTime(value),
        togglePlay: () => wavesurferRef.current?.playPause(),
        skipBy: (seconds: number) => wavesurferRef.current?.skip(seconds),
    }), [currentTime, duration, getTimelineMetrics, isPlaying, isWaveformLoading, scrollOffset, volume, waveformLoadProgress]);

    return api;
}
