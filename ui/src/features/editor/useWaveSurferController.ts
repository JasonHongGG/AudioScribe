import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { FileTask, TrimRange, AudioSegment } from '../tasks/types';

const MAX_ZOOM = 180;

type UpdateTask = (id: string, updater: FileTask | ((task: FileTask) => FileTask)) => void;

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
    const [, setResizeTick] = useState(0);

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
        setIsPlaying(false);
        wavesurferRef.current?.destroy();

        const ws = WaveSurfer.create({
            container: containerRef.current,
            waveColor: '#5b5b5d',
            progressColor: 'rgba(250, 204, 21, 1)',
            cursorColor: 'rgba(250, 204, 21, 1)',
            cursorWidth: 2,
            barWidth: 2,
            barGap: 2,
            barRadius: 3,
            height: 200,
            barHeight: 0.8,
            normalize: false,
            interact: false,
            minPxPerSec: zoom,
            hideScrollbar: true,
        });

        wavesurferRef.current = ws;

        const loadAudio = async () => {
            try {
                const audioPath = task.media.playbackPath;

                if (!audioPath) {
                    return;
                }

                const isRawVideo = task.source.kind === 'video' && !task.media.extractionPath;
                if (isRawVideo) {
                    return;
                }

                await ws.load(convertFileSrc(audioPath));
            } catch (error: unknown) {
                if (error instanceof Error && error.name === 'AbortError') {
                    return;
                }
                console.error('Failed to load audio source:', error);
            }
        };

        void loadAudio();

        ws.on('decode', () => {
            const decodedData = ws.getDecodedData();
            if (!decodedData) {
                return;
            }

            for (let i = 0; i < decodedData.numberOfChannels; i += 1) {
                const channelData = decodedData.getChannelData(i);
                for (let j = 0; j < channelData.length; j += 1) {
                    const value = channelData[j];
                    channelData[j] = Math.pow(Math.abs(value), 1.5) * Math.sign(value);
                }
            }
        });

        ws.on('ready', () => {
            const audioDuration = ws.getDuration();
            setDuration(audioDuration);

            if (audioDuration > 0) {
                const fitZoom = Math.max(0.5, ws.getWidth() / audioDuration);
                setMinZoom(fitZoom);
                const initialZoom = Math.min(Math.max(fitZoom, 0.5), MAX_ZOOM);
                setZoom(initialZoom);
                ws.zoom(initialZoom);
            }

            const defaultTrim: TrimRange = { start: 0, end: audioDuration };
            const currentTrim = task.editor.trimRange ?? defaultTrim;
            const trimRange: TrimRange = {
                start: Math.max(0, Math.min(currentTrim.start, audioDuration)),
                end: Math.max(0, Math.min(currentTrim.end, audioDuration)),
            };

            setScrollOffset(ws.getScroll());

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
    }, [task?.id, task?.media.playbackPath, task?.media.extractionPath, task?.source.path, task?.source.kind, updateTask]);

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
                    const nextScroll = Math.max(0, Math.min(maxScroll, ws.getScroll() + event.deltaX));
                    ws.setScroll(nextScroll);
                    setScrollOffset(ws.getScroll());
                }
                return;
            }

            const panDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
            if (Math.abs(panDelta) > 0) {
                const maxScroll = ws.getWrapper().scrollWidth - ws.getWidth();
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
        volume,
        scrollOffset,
        getTimelineMetrics,
        setVolume,
        seekTo: (value: number) => wavesurferRef.current?.setTime(value),
        togglePlay: () => wavesurferRef.current?.playPause(),
        skipBy: (seconds: number) => wavesurferRef.current?.skip(seconds),
    }), [currentTime, duration, getTimelineMetrics, isPlaying, scrollOffset, volume]);

    return api;
}
