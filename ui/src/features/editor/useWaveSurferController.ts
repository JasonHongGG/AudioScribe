import { useCallback, useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { AudioSegment, EditorSession, TrimRange, WorkbenchEntry } from '../workbench/models';


const MAX_ZOOM = 180;

type UpdateEditorSession = (assetId: string, updater: EditorSession | ((editor: EditorSession) => EditorSession)) => void;


export function useWaveSurferController(entry: WorkbenchEntry | undefined, updateEditorSession: UpdateEditorSession) {
    const containerRef = useRef<HTMLDivElement>(null);
    const glassCardRef = useRef<HTMLDivElement>(null);
    const wavesurferRef = useRef<WaveSurfer | null>(null);
    const latestEntryRef = useRef<WorkbenchEntry | undefined>(entry);
    const audioReadyRef = useRef(false);

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [zoom, setZoom] = useState(50);
    const [minZoom, setMinZoom] = useState(1);
    const [scrollOffset, setScrollOffset] = useState(0);
    const [isWaveformLoading, setIsWaveformLoading] = useState(false);
    const [waveformLoadProgress, setWaveformLoadProgress] = useState<number | null>(null);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [, setResizeTick] = useState(0);

    useEffect(() => {
        latestEntryRef.current = entry;
    }, [entry]);

    const applyFitZoom = useCallback((ws: WaveSurfer, audioDuration: number) => {
        if (audioDuration <= 0 || !audioReadyRef.current) {
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
        if (!containerRef.current || !entry) {
            return;
        }

        setCurrentTime(0);
        setDuration(0);
        setIsPlaying(false);
        setScrollOffset(0);
        setIsWaveformLoading(false);
        setWaveformLoadProgress(null);
        audioReadyRef.current = false;
        wavesurferRef.current?.destroy();

        const assetId = entry.asset.assetId;
        const audioPath = entry.asset.media.playbackPath;
        const waveform = entry.asset.media.waveform;
        const isRawVideo = entry.asset.source.kind === 'video' && !entry.asset.media.extractionPath;
        let disposed = false;

        const ws = WaveSurfer.create({
            container: containerRef.current,
            waveColor: '#5b5b5d',
            progressColor: 'rgba(250, 204, 21, 1)',
            cursorColor: 'rgba(250, 204, 21, 1)',
            cursorWidth: 2,
            height: 200,
            normalize: false,
            interact: false,
            minPxPerSec: 50,
            hideScrollbar: true,
        });

        wavesurferRef.current = ws;

        const loadAudio = async () => {
            try {
                if (!audioPath) {
                    return;
                }

                if (isRawVideo) {
                    return;
                }

                const audioUrl = convertFileSrc(audioPath);

                setIsWaveformLoading(true);
                setWaveformLoadProgress(null);

                if (waveform && waveform.peaks.length > 0 && waveform.duration > 0) {
                    await ws.load(audioUrl, waveform.peaks, waveform.duration);
                    return;
                }

                await ws.load(audioUrl);
            } catch (error: unknown) {
                if (disposed) {
                    return;
                }
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
            if (disposed) {
                return;
            }
            setWaveformLoadProgress(percent);
        });

        ws.on('ready', () => {
            if (disposed) {
                return;
            }
            const audioDuration = ws.getDuration();
            audioReadyRef.current = true;

            setDuration(audioDuration);
            setIsWaveformLoading(false);
            setWaveformLoadProgress(100);

            if (audioDuration > 0) {
                applyFitZoom(ws, audioDuration);
            }

            const latestEntry = latestEntryRef.current;
            if (!latestEntry || latestEntry.asset.assetId !== assetId) {
                return;
            }

            const defaultTrim: TrimRange = { start: 0, end: audioDuration };
            const currentTrim = latestEntry.editorSession.trimRange ?? defaultTrim;
            const trimRange: TrimRange = {
                start: Math.max(0, Math.min(currentTrim.start, audioDuration)),
                end: Math.max(0, Math.min(currentTrim.end, audioDuration)),
            };

            setScrollOffset(0);

            if (latestEntry.editorSession.segments.length === 0) {
                const initialSegment: AudioSegment = {
                    id: crypto.randomUUID(),
                    start: trimRange.start,
                    end: trimRange.end,
                    included: true,
                };
                updateEditorSession(assetId, (editor) => ({
                    ...editor,
                    trimRange,
                    segments: [initialSegment],
                }));
            } else if (!latestEntry.editorSession.trimRange) {
                updateEditorSession(assetId, (editor) => ({
                    ...editor,
                    trimRange,
                }));
            }
        });

        let isUpdatingTime = false;
        ws.on('audioprocess', () => {
            if (disposed) {
                return;
            }
            if (isUpdatingTime) {
                return;
            }

            isUpdatingTime = true;
            requestAnimationFrame(() => {
                setCurrentTime(ws.getCurrentTime());
                isUpdatingTime = false;
            });
        });

        ws.on('seeking', () => {
            if (!disposed) {
                setCurrentTime(ws.getCurrentTime());
            }
        });
        ws.on('play', () => {
            if (!disposed) {
                setIsPlaying(true);
            }
        });
        ws.on('pause', () => {
            if (!disposed) {
                setIsPlaying(false);
            }
        });

        let isUpdatingScroll = false;
        ws.on('scroll', (_visibleStart, _visibleEnd, scrollLeft) => {
            if (disposed) {
                return;
            }
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
            if (!disposed) {
                setScrollOffset(ws.getScroll());
            }
        });

        return () => {
            disposed = true;
            audioReadyRef.current = false;
            ws.destroy();
        };
    }, [applyFitZoom, entry?.asset.assetId, entry?.asset.media.playbackPath, entry?.asset.media.extractionPath, entry?.asset.media.waveform, entry?.asset.source.kind, updateEditorSession]);

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
        if (!ws || duration <= 0 || !audioReadyRef.current) {
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
        wavesurferRef.current?.setPlaybackRate(playbackRate);
    }, [playbackRate]);

    useEffect(() => {
        const element = glassCardRef.current;
        if (!element) {
            return;
        }

        const handleWheel = (event: WheelEvent) => {
            const ws = wavesurferRef.current;
            if (!ws || !audioReadyRef.current) {
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
            if (!ws || !audioReadyRef.current) {
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
                default:
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const seekTo = useCallback((value: number) => {
        const ws = wavesurferRef.current;
        if (!ws || duration <= 0 || !audioReadyRef.current) {
            return;
        }
        ws.seekTo(Math.max(0, Math.min(1, value / duration)));
    }, [duration]);

    const togglePlay = useCallback(() => {
        if (!audioReadyRef.current) {
            return;
        }
        wavesurferRef.current?.playPause();
    }, []);

    const skipBy = useCallback((seconds: number) => {
        if (!audioReadyRef.current) {
            return;
        }
        wavesurferRef.current?.skip(seconds);
    }, []);

    return {
        containerRef,
        glassCardRef,
        wavesurferRef,
        isPlaying,
        currentTime,
        duration,
        volume,
        playbackRate,
        scrollOffset,
        isWaveformLoading,
        waveformLoadProgress,
        getTimelineMetrics,
        seekTo,
        togglePlay,
        skipBy,
        setVolume,
        setPlaybackRate,
    };
}