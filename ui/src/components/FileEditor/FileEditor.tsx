import { useEffect, useRef, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { useStore, AudioSegment, TrimRange } from '../../store';
import { Scissors, CheckSquare, XSquare, Play, Pause, SkipBack, SkipForward, Volume2 } from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

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
    const wavesurferRef = useRef<WaveSurfer | null>(null);

    const currentToolRef = useActiveTool();

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [zoom, setZoom] = useState(50); // pixels per second
    const [minZoom, setMinZoom] = useState(1);
    const [scrollOffset, setScrollOffset] = useState(0); // For syncing custom overlays

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
            waveColor: '#facc15', // Base waveform color yellow
            progressColor: '#ca8a04', // Darker yellow for progress
            cursorColor: '#ffffff',
            cursorWidth: 2,
            barWidth: 3,
            barGap: 2,
            barRadius: 3,
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
                    ws.load(url);
                } else if (task.file_path) {
                    // Tauri Absolute Path
                    const assetUrl = convertFileSrc(task.file_path);
                    ws.load(assetUrl);
                }
            } catch (err) {
                console.error("Failed to load audio source:", err);
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

    useEffect(() => {
        wavesurferRef.current?.setVolume(volume);
    }, [volume]);

    // 3. Zoom Handling (Wheel on waveform and timeline)
    const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
        if (!wavesurferRef.current) return;

        // Check if ctrl/cmd key is pressed or if just scrolling timeline
        const isTimelineHover = (e.target as HTMLElement).closest('.timeline-container');

        if (isTimelineHover) {
            e.preventDefault();
            const newZoom = Math.max(minZoom, Math.min(MAX_ZOOM, zoom - e.deltaY * 0.08));
            setZoom(newZoom);
            wavesurferRef.current.zoom(newZoom);
        } else {
            // Waveform area wheel moves the visible timeline position (horizontal pan)
            const panDelta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
            if (Math.abs(panDelta) > 0) {
                e.preventDefault();
                const ws = wavesurferRef.current;
                const nextScroll = ws.getScroll() + panDelta;
                ws.setScroll(nextScroll);
                setScrollOffset(ws.getScroll());
            }
        }
    };

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
        <div className="flex-1 flex flex-col h-full relative min-w-0 min-h-0 overflow-hidden bg-transparent">
            {/* Top Toolbar */}
            <div className="h-16 flex items-center justify-between px-6 shrink-0 z-10 w-full relative">
                <div className="flex items-center gap-4 min-w-0">
                    <div className="w-1.5 h-6 bg-primary rounded-full shadow-[0_0_10px_rgba(250,204,21,0.6)]" />
                    <h3 className="text-xl font-bold tracking-tight text-white truncate min-w-0 pr-4" title={task.name}>
                        {task.name}
                    </h3>
                </div>

                {/* Tools */}
                <div className="flex bg-surface-active/50 rounded-xl p-1.5 border border-white/[0.05] shrink-0 ml-4 backdrop-blur-md shadow-lg">
                    <ToolButton
                        active={activeToolRef === 'split'}
                        onClick={() => setActiveTool('split')}
                        icon={<Scissors size={18} />}
                        label="Split"
                        color="text-primary"
                    />
                    <ToolButton
                        active={activeToolRef === 'include'}
                        onClick={() => setActiveTool('include')}
                        icon={<CheckSquare size={18} />}
                        label="Include"
                        color="text-green-400"
                    />
                    <ToolButton
                        active={activeToolRef === 'exclude'}
                        onClick={() => setActiveTool('exclude')}
                        icon={<XSquare size={18} />}
                        label="Exclude"
                        color="text-danger-light"
                    />
                </div>
            </div>

            {/* Editor Main Canvas Area */}
            <div
                className="flex-1 relative flex flex-col w-full px-6 pb-28 pt-4 select-none min-h-0 min-w-0 z-0"
                onWheel={handleWheel}
            >
                <div className="w-full h-full relative rounded-[2rem] border border-white/[0.05] overflow-hidden glass-card group flex flex-col shadow-2xl bg-gradient-to-b from-white/[0.02] to-transparent">
                    {/* Inner Edge Highlight */}
                    <div className="absolute inset-0 rounded-[2rem] border-[1.5px] border-white/10 pointer-events-none mix-blend-overlay" />

                    {/* Main Waveform Container */}
                    <div
                        ref={containerRef}
                        className="w-full flex-1 cursor-crosshair relative overflow-hidden mt-6"
                        onClick={handleWaveformClick}
                        onContextMenu={handleContextMenu}
                    >
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
                                                className="absolute top-0 bottom-0 pointer-events-none bg-background-base/80 backdrop-blur-[2px]"
                                                style={{ left: 0, width: `${Math.max(0, trimStartPx)}px` }}
                                            />
                                            <div
                                                className="absolute top-0 bottom-0 pointer-events-none bg-background-base/80 backdrop-blur-[2px]"
                                                style={{ left: `${trimEndPx}px`, width: `${Math.max(0, viewportWidth - trimEndPx)}px` }}
                                            />

                                            {/* Trim Start Handle */}
                                            <div
                                                className="absolute top-0 bottom-0 z-30 cursor-col-resize pointer-events-auto flex items-center justify-center group/handle"
                                                style={{ left: `${trimStartPx}px`, transform: 'translateX(-50%)', width: '20px' }}
                                                onMouseDown={(e) => {
                                                    e.stopPropagation();
                                                    e.preventDefault();
                                                    setDraggingBoundary({ kind: 'trim-start' });
                                                    setDragTooltip({ time: activeTrim.start, leftPx: trimStartRawPx });
                                                }}
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <div className="w-[4px] h-[60%] bg-primary rounded-full shadow-[0_0_15px_rgba(250,204,21,0.8)] group-hover/handle:w-[6px] transition-all duration-200 group-hover/handle:h-[70%]" />
                                            </div>

                                            {/* Trim End Handle */}
                                            <div
                                                className="absolute top-0 bottom-0 z-30 cursor-col-resize pointer-events-auto flex items-center justify-center group/handle"
                                                style={{ left: `${trimEndPx}px`, transform: 'translateX(-50%)', width: '20px' }}
                                                onMouseDown={(e) => {
                                                    e.stopPropagation();
                                                    e.preventDefault();
                                                    setDraggingBoundary({ kind: 'trim-end' });
                                                    setDragTooltip({ time: activeTrim.end, leftPx: trimEndRawPx });
                                                }}
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <div className="w-[4px] h-[60%] bg-primary rounded-full shadow-[0_0_15px_rgba(250,204,21,0.8)] group-hover/handle:w-[6px] transition-all duration-200 group-hover/handle:h-[70%]" />
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
                                                        className="absolute top-0 bottom-0 pointer-events-auto group/seg"
                                                        style={{
                                                            left: `${leftPx}px`,
                                                            width: `${widthPx}px`,
                                                            backgroundColor: seg.included ? 'transparent' : 'rgba(15, 15, 19, 0.85)',
                                                            backdropFilter: seg.included ? 'none' : 'blur(4px)',
                                                        }}
                                                    >
                                                        {/* Segment Hover Outline */}
                                                        <div className="absolute inset-0 border border-white/0 group-hover/seg:border-white/20 transition-colors pointer-events-none" />

                                                        {/* Left Boundary Handle (Split) */}
                                                        {!isFirst && (
                                                            <div
                                                                className="absolute top-0 bottom-0 -left-[10px] w-[20px] z-20 flex items-center justify-center cursor-col-resize pointer-events-auto group/split"
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
                                                                <div className="w-[2px] h-[80%] bg-white/50 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.4)] group-hover/split:w-[4px] group-hover/split:bg-white group-hover/split:h-full transition-all duration-200" />
                                                            </div>
                                                        )}

                                                        {/* Right Boundary Handle (Split) */}
                                                        {!isLast && (
                                                            <div
                                                                className="absolute top-0 bottom-0 -right-[10px] w-[20px] z-20 flex items-center justify-center cursor-col-resize pointer-events-auto group/split"
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
                                                                <div className="w-[2px] h-[80%] bg-white/50 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.4)] group-hover/split:w-[4px] group-hover/split:bg-white group-hover/split:h-full transition-all duration-200" />
                                                            </div>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                        </>
                                    );
                                })()}

                                {dragTooltip && draggingBoundary !== null && (
                                    <div
                                        className="absolute top-4 z-40 pointer-events-none"
                                        style={{
                                            left: `${dragTooltip.leftPx - scrollOffset}px`,
                                            transform: 'translateX(-50%)',
                                        }}
                                    >
                                        <div className="rounded-xl border border-white/20 bg-background-base/90 px-3 py-1.5 text-xs font-mono font-bold tracking-wider text-primary shadow-2xl backdrop-blur-xl">
                                            {formatTime(dragTooltip.time)}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Timeline Container */}
                    <div
                        className="timeline-container w-full h-8 absolute bottom-0 left-0 bg-background-base/80 backdrop-blur-md border-t border-white/[0.05] cursor-ew-resize overflow-hidden z-10"
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
                                                className="absolute bottom-0 h-full flex flex-col justify-end pb-1"
                                                style={{ left: `${x}px`, transform: 'translateX(-0.5px)' }}
                                            >
                                                <div className="w-px h-2 bg-white/20 mx-auto" />
                                                <div className="text-[10px] uppercase font-mono tracking-widest leading-none text-foreground-muted/60 mt-1 -translate-x-1/2 whitespace-nowrap">
                                                    {formatTime(tick)}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </>
                            );
                        })()}
                    </div>

                    {/* Center Playhead Overlay (Visual Only) */}
                    <div className="absolute top-0 bottom-0 left-1/2 w-[2px] bg-white text-glow pointer-events-none z-40 shadow-[0_0_15px_rgba(255,255,255,0.8)] flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-white shadow-xl" />
                    </div>
                </div>
            </div>

            {/* Player Dashboard Bottom - Floating Dock Console */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 h-20 bg-background-base/80 backdrop-blur-3xl border border-white/[0.08] rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.6)] shrink-0 px-8 flex items-center justify-between gap-8 z-50 overflow-hidden w-[90%] max-w-[800px] group transition-all duration-500 hover:shadow-[0_10px_50px_rgba(250,204,21,0.1)] hover:border-white/[0.12]">

                {/* Subtile background glow inside dock */}
                <div className="absolute inset-0 bg-gradient-to-t from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                {/* Time Display */}
                <div className="w-32 flex flex-col items-center justify-center font-mono py-2 rounded-2xl shrink-0 relative">
                    <span className="text-xl font-bold tracking-widest text-primary text-glow drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]">{formatTime(currentTime)}</span>
                    <span className="text-[10px] text-foreground-muted/60 tracking-widest uppercase mt-0.5">{formatTime(duration)}</span>
                </div>

                {/* Transport Controls */}
                <div className="flex items-center justify-center gap-5 flex-1 relative z-10">
                    <button
                        onClick={() => { wavesurferRef.current?.skip(-5) }}
                        className="w-10 h-10 flex items-center justify-center rounded-full text-foreground-muted hover:text-white hover:bg-white/10 transition-all active:scale-95"
                    >
                        <SkipBack size={18} />
                    </button>

                    <button
                        onClick={() => { wavesurferRef.current?.playPause() }}
                        className="w-14 h-14 flex items-center justify-center rounded-full bg-gradient-to-tr from-primary-active to-primary text-background-base hover:scale-105 transition-all shadow-[0_0_20px_rgba(250,204,21,0.4)] hover:shadow-[0_0_30px_rgba(250,204,21,0.6)] active:scale-95"
                    >
                        {isPlaying ? <Pause size={24} className="fill-current" /> : <Play size={24} className="fill-current translate-x-0.5" />}
                    </button>

                    <button
                        onClick={() => { wavesurferRef.current?.skip(5) }}
                        className="w-10 h-10 flex items-center justify-center rounded-full text-foreground-muted hover:text-white hover:bg-white/10 transition-all active:scale-95"
                    >
                        <SkipForward size={18} />
                    </button>
                </div>

                {/* Playback Seek + Volume */}
                <div className="w-[300px] flex flex-col gap-3 relative z-10">
                    <div className="group/slider relative">
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
                            className="w-full h-1.5 rounded-full appearance-none bg-surface-active cursor-pointer outline-none transition-all [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(250,204,21,0.8)] [&::-webkit-slider-thumb]:transition-transform hover:[&::-webkit-slider-thumb]:scale-125"
                        />
                        <div
                            className="absolute left-0 top-0 h-full bg-primary rounded-full pointer-events-none opacity-50 shadow-[0_0_10px_rgba(250,204,21,0.5)]"
                            style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                        />
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 text-foreground-muted/80 shrink-0">
                            <Volume2 size={14} />
                            <span className="text-[10px] font-mono w-10 text-right tracking-widest">{Math.round(volume * 100)}%</span>
                        </div>
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
                            className="w-full h-1 rounded-full appearance-none bg-surface-active cursor-pointer outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary-light hover:[&::-webkit-slider-thumb]:scale-125 transition-transform"
                        />
                    </div>
                </div>

            </div>
        </div>
    );
}

// Helper Sub-component
function ToolButton({ active, onClick, icon, label, color }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, color?: string }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-300 tracking-wide",
                active
                    ? `bg-background-base shadow-sm border border-white/10 ${color} shadow-[0_0_15px_currentColor] opacity-100`
                    : "text-foreground-muted/70 hover:text-foreground hover:bg-white/[0.03] border border-transparent opacity-80"
            )}
        >
            {icon}
            {label}
        </button>
    );
}
