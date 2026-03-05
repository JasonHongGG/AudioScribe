import { useEffect, useRef, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { useStore, AudioSegment, TrimRange } from '../../store';
import { Scissors, CheckSquare, XSquare, Play, Pause, Volume2, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion, AnimatePresence } from 'framer-motion';
import { Tooltip } from '../ui/Tooltip';

function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs));
}

// Custom hook to keep active tool reference fresh for event listeners without re-binding
function useActiveTool() {
    const activeToolRef = useStore(state => state.activeToolRef);
    const ref = useRef(activeToolRef);
    useEffect(() => { ref.current = activeToolRef; }, [activeToolRef]);
    return ref;
}

export function FileEditor({ taskId }: { taskId: string }) {
    const task = useStore(state => state.tasks.find(t => t.id === taskId));
    const updateTask = useStore(state => state.updateTask);
    const activeToolRef = useStore(state => state.activeToolRef);
    const setActiveTool = useStore(state => state.setActiveTool);

    const containerRef = useRef<HTMLDivElement>(null);
    const glassCardRef = useRef<HTMLDivElement>(null);
    const wavesurferRef = useRef<WaveSurfer | null>(null);

    const currentToolRef = useActiveTool();

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [zoom, setZoom] = useState(50); // pixels per second
    const [minZoom, setMinZoom] = useState(1);
    const [scrollOffset, setScrollOffset] = useState(0); // For syncing custom overlays
    const [volHovered, setVolHovered] = useState(false);

    const MAX_ZOOM = 180; // finest visible precision remains at second-level timeline ticks

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

    // 1. Initialize WaveSurfer
    useEffect(() => {
        if (!containerRef.current || !task) return;

        // Destroy previous instance
        if (wavesurferRef.current) {
            wavesurferRef.current.destroy();
        }

        const ws = WaveSurfer.create({
            container: containerRef.current,
            waveColor: '#5b5b5d', // Mathematically equivalent to rgba(255, 255, 255, 0.35) on the dark background, but SOLID so progressColor doesn't muddy
            progressColor: 'rgba(250, 204, 21, 1)', // Bright yellow for played
            cursorColor: 'rgba(250, 204, 21, 1)', // Standard thin playhead
            cursorWidth: 2,
            barWidth: 3,
            barGap: 3,
            barRadius: 4,
            height: 200,
            normalize: true,
            interact: false, // Disable native click-to-seek to allow custom pan/split
            minPxPerSec: zoom,
            hideScrollbar: true,
        });

        wavesurferRef.current = ws;

        // Load Audio Source
        const loadAudio = async () => {
            try {
                if (task.file) {
                    // Native Web API File
                    const url = URL.createObjectURL(task.file);
                    await ws.load(url);
                } else if (task.file_path) {
                    // Tauri Absolute Path
                    const assetUrl = convertFileSrc(task.file_path);
                    await ws.load(assetUrl);
                }
            } catch (err: any) {
                if (err.name === 'AbortError') {
                    // Harmless React 18 Strict Mode double-mount unmount abort
                    console.log("Audio load aborted (expected in Strict Mode)");
                } else {
                    console.error("Failed to load audio source:", err);
                }
            }
        };

        loadAudio();

        // Event Listeners

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

            const defaultTrim: TrimRange = {
                start: 0,
                end: audioDuration,
            };
            const currentTrim = task.trimRange ?? defaultTrim;
            const trimRange: TrimRange = {
                start: Math.max(0, Math.min(currentTrim.start, audioDuration)),
                end: Math.max(0, Math.min(currentTrim.end, audioDuration)),
            };

            setScrollOffset(ws.getScroll());

            // Initialize default single segment if empty
            if (!task.segments || task.segments.length === 0) {
                const initialSegment: AudioSegment = {
                    id: Math.random().toString(36).substring(7),
                    start: trimRange.start,
                    end: trimRange.end,
                    included: true
                };
                updateTask(task.id, {
                    trimRange,
                    segments: [initialSegment],
                });
            } else if (!task.trimRange) {
                updateTask(task.id, { trimRange });
            }
        });

        ws.on('audioprocess', () => setCurrentTime(ws.getCurrentTime()));
        ws.on('seeking', () => setCurrentTime(ws.getCurrentTime()));
        ws.on('play', () => setIsPlaying(true));
        ws.on('pause', () => setIsPlaying(false));
        ws.on('scroll', (_visibleStart, _visibleEnd, scrollLeft) => {
            setScrollOffset(scrollLeft);
        });
        // Update scroll position when zooming
        ws.on('zoom', () => {
            setScrollOffset(ws.getScroll());
        });

        return () => {
            ws.destroy();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [task?.id]); // Re-init on file switch

    // 2. Window Resize Handling to fix React Overlay sync
    const [, setResizeTick] = useState(0);
    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver(() => {
            // Force a re-render so getTimelineMetrics() returns updated viewportWidth
            setResizeTick(t => t + 1);
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        wavesurferRef.current?.setVolume(volume);
    }, [volume]);

    // 3. Zoom Handling — use native addEventListener with { passive: false }
    useEffect(() => {
        const el = glassCardRef.current;
        if (!el) return;

        const handleWheel = (e: WheelEvent) => {
            const ws = wavesurferRef.current;
            if (!ws) return;

            console.log('[WHEEL] fired', { deltaX: e.deltaX, deltaY: e.deltaY, target: (e.target as HTMLElement).className });

            // Need to use classList check because composedPath handles shadow DOMs better
            const path = e.composedPath() as HTMLElement[];
            const isTimelineHover = path.some(node => node.classList && node.classList.contains('timeline-container'));

            console.log('[WHEEL] isTimelineHover:', isTimelineHover);

            // Prevent browser's default scrolling behavior (requires passive: false)
            e.preventDefault();

            if (isTimelineHover) {
                // Vertical scroll on timeline = zoom
                if (Math.abs(e.deltaY) > 0) {
                    const currentZoom = ws.options.minPxPerSec || minZoom;
                    const nextZoom = Math.max(minZoom, Math.min(MAX_ZOOM, currentZoom - e.deltaY * 0.1));
                    setZoom(nextZoom);
                    ws.zoom(nextZoom);
                }
                // Horizontal scroll on timeline = pan
                if (Math.abs(e.deltaX) > 0) {
                    const maxScroll = ws.getWrapper().scrollWidth - ws.getWidth();
                    const nextScroll = Math.max(0, Math.min(maxScroll, ws.getScroll() + e.deltaX));
                    ws.setScroll(nextScroll);
                    setScrollOffset(ws.getScroll());
                }
            } else {
                // Waveform area: any wheel translates to horizontal pan
                const panDelta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
                if (Math.abs(panDelta) > 0) {
                    const maxScroll = ws.getWrapper().scrollWidth - ws.getWidth();
                    let nextScroll = ws.getScroll() + panDelta;
                    nextScroll = Math.max(0, Math.min(maxScroll, nextScroll));
                    ws.setScroll(nextScroll);
                    setScrollOffset(ws.getScroll());
                }
            }
        };

        el.addEventListener('wheel', handleWheel, { passive: false });
        return () => el.removeEventListener('wheel', handleWheel);
    }, [minZoom]);



    // 4. Interaction Handlers (Split & Mute)
    const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!wavesurferRef.current || !task?.segments || !duration) return;

        const rect = containerRef.current!.getBoundingClientRect();
        const { scrollLeft, totalWidth } = getTimelineMetrics();
        if (totalWidth <= 0) return;

        const xPos = e.clientX - rect.left + scrollLeft;
        const clickTime = (xPos / totalWidth) * duration;
        const activeTrim = task.trimRange ?? { start: 0, end: duration };
        if (clickTime < activeTrim.start || clickTime > activeTrim.end) return;

        // Find clicked segment
        const clickedSegIndex = task.segments.findIndex(s => clickTime >= s.start && clickTime <= s.end);
        if (clickedSegIndex === -1) return;

        const seg = task.segments[clickedSegIndex];
        const tool = currentToolRef.current;

        const newSegments = [...task.segments];

        if (tool === 'split') {
            // Split into two
            const splitId = Math.random().toString(36).substring(7);
            const leftObj: AudioSegment = { ...seg, end: clickTime };
            const rightObj: AudioSegment = { id: splitId, start: clickTime, end: seg.end, included: seg.included };

            newSegments.splice(clickedSegIndex, 1, leftObj, rightObj);
            updateTask(taskId, { segments: newSegments });

        } else if (tool === 'include') {
            newSegments[clickedSegIndex] = { ...seg, included: true };
            updateTask(taskId, { segments: newSegments });

        } else if (tool === 'exclude') {
            newSegments[clickedSegIndex] = { ...seg, included: false };
            updateTask(taskId, { segments: newSegments });
        }
    };

    const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault(); // Stop native context menu
        if (!wavesurferRef.current || !task?.segments || task.segments.length <= 1) return;

        // Right click deletion of segment boundaries
        const rect = containerRef.current!.getBoundingClientRect();
        const { scrollLeft, totalWidth } = getTimelineMetrics();
        if (totalWidth <= 0) return;
        const xPos = e.clientX - rect.left + scrollLeft;
        const clickTime = (xPos / totalWidth) * duration;
        const activeTrim = task.trimRange ?? { start: 0, end: duration };
        if (clickTime < activeTrim.start || clickTime > activeTrim.end) return;

        // Find closest boundary (excluding outer 0 and duration edges)
        // 15px threshold translated to time
        const timeThreshold = (15 / totalWidth) * duration;

        let closestIndex = -1;
        let minDiff = Infinity;

        // We check boundaries between i and i+1
        for (let i = 0; i < task.segments.length - 1; i++) {
            const boundaryObj = task.segments[i];
            const diff = Math.abs(boundaryObj.end - clickTime);
            if (diff < minDiff && diff < timeThreshold) {
                minDiff = diff;
                closestIndex = i;
            }
        }

        if (closestIndex !== -1) {
            // Merge segment[closestIndex] and segment[closestIndex + 1]
            const newSegments = [...task.segments];
            const leftSeg = newSegments[closestIndex];
            const rightSeg = newSegments[closestIndex + 1];

            // Inherit state from Left segment
            const mergedSeg: AudioSegment = {
                id: leftSeg.id,
                start: leftSeg.start,
                end: rightSeg.end,
                included: leftSeg.included
            };

            newSegments.splice(closestIndex, 2, mergedSeg);
            updateTask(taskId, { segments: newSegments });
        }
    };

    // 5. Custom Boundary Drag Handling State
    const [draggingBoundary, setDraggingBoundary] = useState<
        | { kind: 'segment'; index: number }
        | { kind: 'trim-start' }
        | { kind: 'trim-end' }
        | null
    >(null);
    const [dragTooltip, setDragTooltip] = useState<{ time: number; leftPx: number } | null>(null);

    const handleMouseMoveOverlay = useCallback((e: MouseEvent) => {
        if (!draggingBoundary || !wavesurferRef.current || !duration || !task?.segments) return;

        const rect = containerRef.current!.getBoundingClientRect();
        const { scrollLeft, totalWidth } = getTimelineMetrics();
        if (totalWidth <= 0) return;
        const xPos = e.clientX - rect.left + scrollLeft;

        // Clamp time between 0 and duration
        let newTime = (xPos / totalWidth) * duration;
        newTime = Math.max(0, Math.min(newTime, duration));

        if (draggingBoundary.kind === 'segment') {
            const newSegs = [...task.segments];
            const leftSeg = newSegs[draggingBoundary.index];
            const rightSeg = newSegs[draggingBoundary.index + 1];
            if (!leftSeg || !rightSeg) return;

            const minSegmentDuration = 0.1;
            const minBoundary = leftSeg.start + minSegmentDuration;
            const maxBoundary = rightSeg.end - minSegmentDuration;
            const clampedTime = Math.max(minBoundary, Math.min(newTime, maxBoundary));
            const tooltipLeftPx = (clampedTime / duration) * totalWidth;

            newSegs[draggingBoundary.index] = { ...leftSeg, end: clampedTime };
            newSegs[draggingBoundary.index + 1] = { ...rightSeg, start: clampedTime };
            setDragTooltip({ time: clampedTime, leftPx: tooltipLeftPx });
            updateTask(taskId, { segments: newSegs });
            return;
        }

        const existingTrim = task.trimRange ?? { start: 0, end: duration };
        const minTrimDuration = 0.1;
        let trimStart = existingTrim.start;
        let trimEnd = existingTrim.end;

        if (draggingBoundary.kind === 'trim-start') {
            trimStart = Math.max(0, Math.min(newTime, trimEnd - minTrimDuration));
        } else {
            trimEnd = Math.min(duration, Math.max(newTime, trimStart + minTrimDuration));
        }

        trimStart = Math.round(trimStart * 100) / 100;
        trimEnd = Math.round(trimEnd * 100) / 100;

        const nextTrim = { start: trimStart, end: trimEnd };
        const tooltipTime = draggingBoundary.kind === 'trim-start' ? trimStart : trimEnd;
        const tooltipLeftPx = (tooltipTime / duration) * totalWidth;

        setDragTooltip({ time: tooltipTime, leftPx: tooltipLeftPx });
        updateTask(taskId, {
            trimRange: nextTrim,
        });
    }, [draggingBoundary, duration, getTimelineMetrics, task?.segments, task?.trimRange, taskId, updateTask]);

    const handleMouseUpOverlay = useCallback(() => {
        setDraggingBoundary(null);
        setDragTooltip(null);
    }, []);

    useEffect(() => {
        if (draggingBoundary !== null) {
            window.addEventListener('mousemove', handleMouseMoveOverlay);
            window.addEventListener('mouseup', handleMouseUpOverlay);
        } else {
            window.removeEventListener('mousemove', handleMouseMoveOverlay);
            window.removeEventListener('mouseup', handleMouseUpOverlay);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMoveOverlay);
            window.removeEventListener('mouseup', handleMouseUpOverlay);
        };
    }, [draggingBoundary, handleMouseMoveOverlay, handleMouseUpOverlay]);

    // Helpers formats
    // 6. Global Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't trigger if user is typing in an input field (e.g. rename, search)
            if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

            if (!wavesurferRef.current) return;
            const ws = wavesurferRef.current;

            switch (e.key) {
                case ' ': // Spacebar
                    e.preventDefault();
                    ws.playPause();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    ws.skip(-5);
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    ws.skip(5);
                    break;
                case ',':
                case '<':
                    e.preventDefault();
                    ws.skip(-1);
                    break;
                case '.':
                case '>':
                    e.preventDefault();
                    ws.skip(1);
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const formatTime = (seconds: number) => {
        const totalSeconds = Math.floor(seconds);
        const hours = Math.floor(totalSeconds / 3600);
        const mins = Math.floor((totalSeconds % 3600) / 60);
        const secs = totalSeconds % 60;
        const ms = Math.floor((seconds % 1) * 100);

        if (hours > 0) {
            return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
        }

        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    };

    const pickTimelineStep = (pixelsPerSecond: number) => {
        const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
        for (const step of steps) {
            if (step * pixelsPerSecond >= 56) return step;
        }
        return 3600;
    };

    if (!task) return null;

    return (
        <motion.div
            className="flex-1 flex flex-col h-full relative min-w-0 min-h-0 bg-transparent"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
        >
            {/* Top Toolbar */}
            <motion.div
                className="h-20 flex items-center justify-between px-8 shrink-0 z-10 w-full relative"
                initial={{ y: -30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ type: "spring", damping: 20, stiffness: 100 }}
            >
                <div className="flex items-center gap-5 min-w-0 group cursor-default">
                    <motion.div
                        className="w-1.5 h-8 bg-primary rounded-full shadow-[0_0_15px_rgba(250,204,21,0.8)]"
                        whileHover={{ scaleY: 1.2, filter: "brightness(1.2)" }}
                    />
                    <Tooltip content={task.name} side="top" delay={0.2} className="min-w-0 overflow-hidden">
                        <h3 className="text-2xl font-black tracking-tight text-white/90 truncate group-hover:text-white transition-colors duration-300 drop-shadow-[0_2px_10px_rgba(255,255,255,0.1)]">
                            {task.name}
                        </h3>
                    </Tooltip>
                </div>

                {/* Animated Segmented Control */}
                <div className="flex bg-surface-active/30 rounded-[1.25rem] p-1.5 border border-white/[0.04] shrink-0 ml-4 backdrop-blur-2xl shadow-[0_8px_30px_-10px_rgba(0,0,0,0.5)]">
                    <ToolButton
                        id="split"
                        activeId={activeToolRef}
                        onClick={() => setActiveTool('split')}
                        icon={<Scissors size={18} />}
                        label="Split"
                        color="text-primary group-hover:drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]"
                    />
                    <ToolButton
                        id="include"
                        activeId={activeToolRef}
                        onClick={() => setActiveTool('include')}
                        icon={<CheckSquare size={18} />}
                        label="Include"
                        color="text-primary group-hover:drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]"
                    />
                    <ToolButton
                        id="exclude"
                        activeId={activeToolRef}
                        onClick={() => setActiveTool('exclude')}
                        icon={<XSquare size={18} />}
                        label="Exclude"
                        color="text-primary group-hover:drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]"
                    />
                </div>
            </motion.div>

            {/* Editor Main Canvas Area */}
            <motion.div
                className="flex-1 relative flex flex-col w-full px-8 pb-48 pt-2 select-none min-h-0 min-w-0 z-0"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
            >
                <div className="w-full h-full relative">
                    <div ref={glassCardRef} className="absolute inset-0 rounded-[2.5rem] border border-white/[0.04] overflow-hidden glass-card group/canvas flex flex-col shadow-[0_20px_80px_rgba(0,0,0,0.8)] bg-gradient-to-b from-white/[0.02] to-transparent backdrop-blur-3xl">
                        {/* Inner Edge Highlight */}
                        <div className="absolute inset-0 rounded-[2.5rem] border border-white/[0.08] pointer-events-none mix-blend-overlay z-10" />

                        {/* Main Waveform Container */}
                        <div
                            className="w-full flex-1 cursor-crosshair relative overflow-hidden flex items-center"
                            onClick={handleWaveformClick}
                            onContextMenu={handleContextMenu}
                        >
                            <div ref={containerRef} className="w-full" />
                            {/* Custom React Overlay for Regions */}
                            {task?.segments && duration > 0 && wavesurferRef.current && wavesurferRef.current.getWrapper() && (
                                <div
                                    className="absolute inset-0 z-30 pointer-events-none"
                                >
                                    {(() => {
                                        const { totalWidth, viewportWidth } = getTimelineMetrics();
                                        const activeTrim = task.trimRange ?? { start: 0, end: duration };
                                        const trimStartRawPx = (activeTrim.start / duration) * totalWidth;
                                        const trimEndRawPx = (activeTrim.end / duration) * totalWidth;
                                        const trimStartPx = trimStartRawPx - scrollOffset;
                                        const trimEndPx = trimEndRawPx - scrollOffset;
                                        const visibleSegments = task.segments
                                            .map((seg, originalIndex) => ({ seg, originalIndex }))
                                            .filter(({ seg }) => seg.end > activeTrim.start && seg.start < activeTrim.end);

                                        return (
                                            <>
                                                {/* Trim Out of Bounds Areas */}
                                                <div
                                                    className="absolute top-0 bottom-0 pointer-events-none bg-background-base/80 backdrop-blur-[6px] transition-all duration-300"
                                                    style={{ left: 0, width: `${Math.max(0, trimStartPx)}px` }}
                                                />
                                                <div
                                                    className="absolute top-0 bottom-0 pointer-events-none bg-background-base/80 backdrop-blur-[6px] transition-all duration-300"
                                                    style={{ left: `${trimEndPx}px`, width: `${Math.max(0, viewportWidth - trimEndPx)}px` }}
                                                />

                                                {/* Trim Start Handle */}
                                                <div
                                                    className="absolute top-0 bottom-0 z-30 flex items-center justify-center cursor-col-resize pointer-events-auto group/handle"
                                                    style={{ left: `${trimStartPx}px`, transform: 'translateX(-50%)', width: '24px' }}
                                                    onMouseDown={(e) => {
                                                        e.stopPropagation();
                                                        e.preventDefault();
                                                        setDraggingBoundary({ kind: 'trim-start' });
                                                        setDragTooltip({ time: activeTrim.start, leftPx: trimStartRawPx });
                                                    }}
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <motion.div
                                                        className="w-[3px] h-[90%] bg-primary rounded-full shadow-[0_0_15px_rgba(250,204,21,0.6)] relative flex items-center justify-center"
                                                        whileHover={{ width: 6, backgroundColor: "#facc15", height: "95%", boxShadow: "0 0 25px rgba(250,204,21,0.9)" }}
                                                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                                                    >
                                                        <div className="flex flex-col gap-[2px] opacity-0 group-hover/handle:opacity-100 transition-opacity duration-300">
                                                            <div className="w-[2px] h-[3px] bg-black/60 rounded-full" />
                                                            <div className="w-[2px] h-[3px] bg-black/60 rounded-full" />
                                                            <div className="w-[2px] h-[3px] bg-black/60 rounded-full" />
                                                        </div>
                                                    </motion.div>
                                                </div>

                                                {/* Trim End Handle */}
                                                <div
                                                    className="absolute top-0 bottom-0 z-30 flex items-center justify-center cursor-col-resize pointer-events-auto group/handle"
                                                    style={{ left: `${trimEndPx}px`, transform: 'translateX(-50%)', width: '24px' }}
                                                    onMouseDown={(e) => {
                                                        e.stopPropagation();
                                                        e.preventDefault();
                                                        setDraggingBoundary({ kind: 'trim-end' });
                                                        setDragTooltip({ time: activeTrim.end, leftPx: trimEndRawPx });
                                                    }}
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <motion.div
                                                        className="w-[3px] h-[90%] bg-primary rounded-full shadow-[0_0_15px_rgba(250,204,21,0.6)] relative flex items-center justify-center"
                                                        whileHover={{ width: 6, backgroundColor: "#facc15", height: "95%", boxShadow: "0 0 25px rgba(250,204,21,0.9)" }}
                                                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                                                    >
                                                        <div className="flex flex-col gap-[2px] opacity-0 group-hover/handle:opacity-100 transition-opacity duration-300">
                                                            <div className="w-[2px] h-[3px] bg-black/60 rounded-full" />
                                                            <div className="w-[2px] h-[3px] bg-black/60 rounded-full" />
                                                            <div className="w-[2px] h-[3px] bg-black/60 rounded-full" />
                                                        </div>
                                                    </motion.div>
                                                </div>

                                                {/* Segments */}
                                                {visibleSegments.map(({ seg, originalIndex }, i) => {
                                                    const renderStart = Math.max(seg.start, activeTrim.start);
                                                    const renderEnd = Math.min(seg.end, activeTrim.end);
                                                    const leftPx = (renderStart / duration) * totalWidth - scrollOffset;
                                                    const widthPx = ((renderEnd - renderStart) / duration) * totalWidth;

                                                    const isFirst = i === 0;
                                                    const isLast = i === visibleSegments.length - 1;

                                                    return (
                                                        <div
                                                            key={seg.id}
                                                            className="absolute top-0 bottom-0 pointer-events-auto group/seg transition-colors duration-300"
                                                            style={{
                                                                left: `${leftPx}px`,
                                                                width: `${widthPx}px`,
                                                                backgroundColor: seg.included ? 'transparent' : 'rgba(15, 15, 19, 0.75)',
                                                                backdropFilter: seg.included ? 'none' : 'blur(8px)',
                                                            }}
                                                        >
                                                            {/* Segment Hover Outline */}
                                                            <div className="absolute inset-0 border-[1.5px] border-white/0 group-hover/seg:border-white/10 transition-colors duration-300 pointer-events-none rounded-sm" />

                                                            {/* Left Boundary Handle (Split) */}
                                                            {!isFirst && (
                                                                <div
                                                                    className="absolute top-0 bottom-0 -left-[12px] w-[24px] z-20 flex items-center justify-center cursor-col-resize pointer-events-auto group/split"
                                                                    onMouseDown={(e) => {
                                                                        e.stopPropagation();
                                                                        e.preventDefault();
                                                                        const boundaryTime = visibleSegments[i - 1].seg.end;
                                                                        const tooltipLeftPx = (boundaryTime / duration) * totalWidth;
                                                                        setDraggingBoundary({ kind: 'segment', index: visibleSegments[i - 1].originalIndex });
                                                                        setDragTooltip({ time: boundaryTime, leftPx: tooltipLeftPx });
                                                                    }}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                >
                                                                    <motion.div
                                                                        className="w-[2px] h-[80%] bg-white/40 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.2)]"
                                                                        whileHover={{ width: 5, backgroundColor: "#fff", height: "80%", boxShadow: "0 0 15px rgba(255,255,255,0.8)" }}
                                                                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                                                                    />
                                                                </div>
                                                            )}

                                                            {/* Right Boundary Handle (Split) */}
                                                            {!isLast && (
                                                                <div
                                                                    className="absolute top-0 bottom-0 -right-[12px] w-[24px] z-20 flex items-center justify-center cursor-col-resize pointer-events-auto group/split"
                                                                    onMouseDown={(e) => {
                                                                        e.stopPropagation();
                                                                        e.preventDefault();
                                                                        const boundaryTime = seg.end;
                                                                        const tooltipLeftPx = (boundaryTime / duration) * totalWidth;
                                                                        setDraggingBoundary({ kind: 'segment', index: originalIndex });
                                                                        setDragTooltip({ time: boundaryTime, leftPx: tooltipLeftPx });
                                                                    }}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                >
                                                                    <motion.div
                                                                        className="w-[2px] h-[80%] bg-white/40 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.2)]"
                                                                        whileHover={{ width: 5, backgroundColor: "#fff", height: "80%", boxShadow: "0 0 15px rgba(255,255,255,0.8)" }}
                                                                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                                                                    />
                                                                </div>
                                                            )}
                                                        </div>
                                                    )
                                                })}
                                            </>
                                        );
                                    })()}
                                </div>
                            )}
                        </div>

                        {/* Timeline Container */}
                        <div
                            className="timeline-container w-full h-10 absolute bottom-0 left-0 bg-background-base/50 backdrop-blur-2xl border-t border-white/[0.04] cursor-ew-resize overflow-hidden z-40"
                        >
                            {(() => {
                                const { viewportWidth, totalWidth } = getTimelineMetrics();
                                if (!duration || totalWidth <= 0 || viewportWidth <= 0) return null;

                                const pxPerSec = totalWidth / duration;
                                const stepSec = pickTimelineStep(pxPerSec);
                                const visibleStart = (scrollOffset / totalWidth) * duration;
                                const visibleEnd = ((scrollOffset + viewportWidth) / totalWidth) * duration;

                                const startTick = Math.floor(visibleStart / stepSec) * stepSec;
                                const ticks: number[] = [];
                                for (let tick = startTick; tick <= visibleEnd + stepSec; tick += stepSec) {
                                    if (tick >= 0 && tick <= duration) {
                                        ticks.push(tick);
                                    }
                                }

                                return (
                                    <>
                                        {ticks.map((tick) => {
                                            const x = (tick / duration) * totalWidth - scrollOffset;
                                            return (
                                                <div
                                                    key={tick}
                                                    className="absolute bottom-0 h-full flex flex-col items-center justify-end pb-1.5"
                                                    style={{ left: `${x}px`, transform: 'translateX(-50%)' }}
                                                >
                                                    <div className="w-px h-2.5 bg-white/30" />
                                                    <div className="text-[10px] uppercase font-mono tracking-widest leading-none text-foreground-muted/70 mt-1.5 whitespace-nowrap">
                                                        {stepSec >= 1
                                                            ? formatTime(tick).split('.')[0]
                                                            : formatTime(tick)
                                                        }
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </>
                                );
                            })()}
                        </div>

                    </div>

                    {/* Unclipped Overlay Area */}
                    <div className="absolute inset-0 pointer-events-none z-[60]">
                        <AnimatePresence>
                            {dragTooltip && draggingBoundary !== null && (
                                <motion.div
                                    className="absolute pointer-events-none z-[100]"
                                    style={{
                                        top: '0px',
                                        left: `${dragTooltip.leftPx - scrollOffset}px`,
                                    }}
                                    initial={{ opacity: 0, y: -10, x: "-50%", scale: 0.9 }}
                                    animate={{ opacity: 1, y: 0, x: "-50%", scale: 1 }}
                                    exit={{ opacity: 0, y: -10, x: "-50%", scale: 0.9 }}
                                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                >
                                    <div className="rounded-xl border border-white/20 bg-background-base/95 px-3 py-1.5 text-[11px] font-mono font-bold tracking-wider text-primary shadow-[0_15px_30px_rgba(0,0,0,0.8)] backdrop-blur-2xl max-w-full min-w-0">
                                        {formatTime(dragTooltip.time)}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </motion.div>

            {/* Player Dashboard Bottom - Floating Dock Console */}
            <motion.div
                className="absolute bottom-6 left-1/2 w-[95%] max-w-[1000px] bg-background-base/90 backdrop-blur-3xl border border-white/[0.08] rounded-[2rem] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.1)] flex flex-col z-50 overflow-hidden px-10 py-5 gap-3"
                initial={{ y: 80, opacity: 0, x: '-50%' }}
                animate={{ y: 0, opacity: 1, x: '-50%' }}
                transition={{ type: "spring", damping: 25, stiffness: 200, delay: 0.2 }}
                whileHover={{ y: -2, transition: { duration: 0.3, ease: "easeOut" }, boxShadow: "0 30px 60px -20px rgba(0,0,0,1), 0 0 40px rgba(250,204,21,0.06), inset 0 1px 0 rgba(255,255,255,0.15)" }}
            >
                {/* Top Row: Progress Bar + Time */}
                <div className="flex items-center gap-4 w-full">
                    <span className="text-[13px] font-mono font-bold tracking-wider text-primary text-glow drop-shadow-[0_0_8px_rgba(250,204,21,0.5)] w-16 text-right shrink-0">
                        {formatTime(currentTime)}
                    </span>

                    <div className="group/slider relative h-5 flex items-center flex-1 cursor-pointer">
                        <input
                            type="range"
                            min={0}
                            max={duration || 100}
                            value={currentTime}
                            step={0.01}
                            onChange={(e) => {
                                const newTime = parseFloat(e.target.value);
                                wavesurferRef.current?.setTime(newTime);
                            }}
                            className="w-full h-full rounded-full appearance-none bg-transparent cursor-pointer outline-none absolute inset-0 z-10 opacity-0"
                        />
                        <div className="absolute left-0 right-0 h-1.5 bg-surface-active rounded-full overflow-hidden pointer-events-none transition-all duration-300 group-hover/slider:h-2.5">
                            <div
                                className="h-full bg-primary rounded-full relative shadow-[0_0_15px_rgba(250,204,21,0.6)]"
                                style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                            >
                                <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-r from-transparent to-white/40" />
                            </div>
                        </div>
                        <motion.div
                            className="absolute h-3.5 w-3.5 bg-white rounded-full shadow-[0_2px_10px_rgba(0,0,0,0.5),0_0_15px_rgba(250,204,21,0.8)] pointer-events-none"
                            style={{ left: `calc(${duration > 0 ? (currentTime / duration) * 100 : 0}% - 7px)` }}
                            initial={false}
                            animate={{ scale: 1 }}
                            whileHover={{ scale: 1.4 }}
                        />
                    </div>

                    <span className="text-[13px] font-mono font-medium tracking-wider text-foreground-muted w-16 text-left shrink-0">
                        {formatTime(duration)}
                    </span>
                </div>

                {/* Bottom Row: Controls */}
                <div className="flex items-center justify-between w-full mt-1">
                    {/* Left: Empty for balance */}
                    <div className="w-[180px] flex items-center">
                    </div>

                    {/* Center: Transport */}
                    <div className="flex items-center justify-center gap-4 flex-1 relative z-10">
                        <motion.button
                            onClick={() => { wavesurferRef.current?.skip(-5) }}
                            className="w-10 h-10 flex items-center justify-center rounded-full text-foreground-muted hover:text-white hover:bg-white/[0.06] transition-colors"
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                        >
                            <ChevronsLeft size={28} />
                        </motion.button>

                        <motion.button
                            onClick={() => { wavesurferRef.current?.skip(-1) }}
                            className="w-10 h-10 flex items-center justify-center rounded-full text-foreground-muted hover:text-white hover:bg-white/[0.06] transition-colors"
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                        >
                            <ChevronLeft size={28} />
                        </motion.button>

                        <motion.button
                            onClick={() => { wavesurferRef.current?.playPause() }}
                            className="w-14 h-14 flex items-center justify-center rounded-full bg-primary text-black shadow-[0_5px_20px_rgba(250,204,21,0.4)] mx-2"
                            whileHover={{ scale: 1.05, boxShadow: "0 8px 30px rgba(250,204,21,0.6)" }}
                            whileTap={{ scale: 0.95, boxShadow: "0 2px 10px rgba(250,204,21,0.3)" }}
                        >
                            {isPlaying ? <Pause size={26} className="fill-current" /> : <Play size={26} className="fill-current translate-x-0.5" />}
                        </motion.button>

                        <motion.button
                            onClick={() => { wavesurferRef.current?.skip(1) }}
                            className="w-10 h-10 flex items-center justify-center rounded-full text-foreground-muted hover:text-white hover:bg-white/[0.06] transition-colors"
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                        >
                            <ChevronRight size={28} />
                        </motion.button>

                        <motion.button
                            onClick={() => { wavesurferRef.current?.skip(5) }}
                            className="w-10 h-10 flex items-center justify-center rounded-full text-foreground-muted hover:text-white hover:bg-white/[0.06] transition-colors"
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                        >
                            <ChevronsRight size={28} />
                        </motion.button>
                    </div>

                    {/* Right: Volume */}
                    <div className="w-[180px] flex items-center gap-4 justify-end">
                        <div
                            className="group/vol relative h-5 flex items-center w-28 cursor-pointer"
                            onMouseEnter={() => setVolHovered(true)}
                            onMouseLeave={() => setVolHovered(false)}
                        >
                            <input
                                type="range"
                                min={0}
                                max={1}
                                value={volume}
                                step={0.01}
                                onChange={(e) => {
                                    const newVolume = parseFloat(e.target.value);
                                    setVolume(newVolume);
                                    wavesurferRef.current?.setVolume(newVolume);
                                }}
                                className="w-full h-full rounded-full appearance-none bg-transparent cursor-pointer outline-none absolute inset-0 z-10 opacity-0"
                            />
                            <div className="absolute left-0 right-0 h-1.5 bg-surface-active rounded-full overflow-hidden pointer-events-none transition-all duration-300 group-hover/vol:h-2">
                                <div
                                    className="h-full bg-white/80 rounded-full"
                                    style={{ width: `${volume * 100}%` }}
                                />
                            </div>
                            <Tooltip
                                content={`${Math.round(volume * 100)}%`}
                                side="top"
                                className="absolute h-3 w-3 pointer-events-none"
                                style={{ left: `calc(${volume * 100}% - 6px)` }}
                                offset={12}
                                isOpen={volHovered}
                            >
                                <div className="w-full h-full bg-white rounded-full shadow-md" />
                            </Tooltip>
                        </div>
                        <div className="text-foreground-muted/80 shrink-0 w-5 flex justify-center">
                            <Volume2 size={18} className="text-white/80" />
                        </div>
                    </div>
                </div>

            </motion.div>
        </motion.div>
    );
}

// Helper Sub-component with Framer Motion Layout
function ToolButton({ id, activeId, onClick, icon, label, color }: { id: string, activeId: string, onClick: () => void, icon: React.ReactNode, label: string, color?: string }) {
    const isActive = activeId === id;

    return (
        <button
            onClick={onClick}
            className={cn(
                "relative flex items-center gap-2.5 px-6 py-2.5 rounded-[1rem] text-sm font-bold transition-colors duration-300 tracking-wide z-10 group outline-none",
                isActive
                    ? `text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]`
                    : "text-foreground-muted/70 hover:text-foreground hover:bg-white/[0.02]"
            )}
        >
            {isActive && (
                <motion.div
                    layoutId="activeToolBubble"
                    className="absolute inset-0 bg-white/[0.08] border border-white/20 rounded-[1rem] shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_20px_rgba(255,255,255,0.05)]"
                    initial={false}
                    transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                />
            )}
            <span className={cn("relative z-10 transition-colors duration-300", isActive ? color : "text-foreground-muted group-hover:text-white")}>
                {icon}
            </span>
            <span className="relative z-10">{label}</span>
        </button>
    );
}
