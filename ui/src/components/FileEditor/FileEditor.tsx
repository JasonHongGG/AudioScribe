import { useEffect, useRef, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.esm.js';
import { useStore, AudioSegment } from '../../store';
import { Scissors, CheckSquare, XSquare, Play, Pause, SkipBack, SkipForward } from 'lucide-react';
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
    const timelineRef = useRef<HTMLDivElement>(null);
    const wavesurferRef = useRef<WaveSurfer | null>(null);

    const currentToolRef = useActiveTool();

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [zoom, setZoom] = useState(50); // initial zoom pixels per second
    const [scrollOffset, setScrollOffset] = useState(0); // For syncing custom overlays

    // 1. Initialize WaveSurfer
    useEffect(() => {
        if (!containerRef.current || !timelineRef.current || !task) return;

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

        const timeline = TimelinePlugin.create({
            container: timelineRef.current,
            height: 24,
            timeInterval: 5,
            primaryLabelInterval: 10,
            style: {
                fontSize: '11px',
                color: '#a1a1aa',
            },
        });

        ws.registerPlugin(timeline);
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

            // Listen to scroll events to sync our custom overlay later
            const scrollWrapper = ws.getWrapper();
            if (scrollWrapper) {
                // Initialize offset
                setScrollOffset(scrollWrapper.scrollLeft);

                scrollWrapper.addEventListener('scroll', () => {
                    setScrollOffset(scrollWrapper.scrollLeft);
                });
            }

            // Initialize default single segment if empty
            if (!task.segments || task.segments.length === 0) {
                const initialSegment: AudioSegment = {
                    id: Math.random().toString(36).substring(7),
                    start: 0,
                    end: audioDuration,
                    included: true
                };
                updateTask(task.id, { segments: [initialSegment] });
            }
        });

        ws.on('audioprocess', () => setCurrentTime(ws.getCurrentTime()));
        ws.on('seeking', () => setCurrentTime(ws.getCurrentTime()));
        ws.on('play', () => setIsPlaying(true));
        ws.on('pause', () => setIsPlaying(false));
        // Update scroll position when zooming
        ws.on('zoom', () => {
            const wrapper = ws.getWrapper();
            if (wrapper) setScrollOffset(wrapper.scrollLeft);
        });

        return () => {
            ws.destroy();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [task?.id]); // Re-init on file switch

    // 3. Zoom Handling (Wheel on waveform and timeline)
    const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
        if (!wavesurferRef.current) return;

        // Check if ctrl/cmd key is pressed or if just scrolling timeline
        const isTimelineHover = (e.target as HTMLElement).closest('.timeline-container');

        if (isTimelineHover) {
            e.preventDefault();
            const newZoom = Math.max(10, Math.min(1000, zoom - e.deltaY * 0.1));
            setZoom(newZoom);
            wavesurferRef.current.zoom(newZoom);
        } else {
            // Only pan horizontally if inside main area
            if (Math.abs(e.deltaX) > 0) {
                e.preventDefault();
                const scrollWrapper = containerRef.current?.shadowRoot?.querySelector('div[style*="overflow-x: auto"]') || containerRef.current?.querySelector('div');
                if (scrollWrapper) {
                    scrollWrapper.scrollLeft += e.deltaX;
                }
            }
        }
    };

    // 4. Interaction Handlers (Split & Mute)
    const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!wavesurferRef.current || !task?.segments || !duration) return;

        const ws = wavesurferRef.current;
        const rect = containerRef.current!.getBoundingClientRect();
        // Accommodate for scroll Left position
        // Removed scrollWrapper since it's unused
        let scrollOffset = 0;
        if (ws.getWrapper()) {
            scrollOffset = ws.getWrapper().scrollLeft;
        }

        const xPos = e.clientX - rect.left + scrollOffset;
        const totalWidth = ws.getWrapper().scrollWidth;
        const clickTime = (xPos / totalWidth) * duration;

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
        const ws = wavesurferRef.current;
        const rect = containerRef.current!.getBoundingClientRect();
        // const scrollWrapper = ws.getWrapper().scrollLeft; // Used directly below
        const scrollOffset = ws.getWrapper().scrollLeft;
        const xPos = e.clientX - rect.left + scrollOffset;
        const totalWidth = ws.getWrapper().scrollWidth;
        const clickTime = (xPos / totalWidth) * duration;

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
    // boundaryIndex means the boundary between segments[boundaryIndex] and segments[boundaryIndex + 1]
    const [draggingBoundaryIndex, setDraggingBoundaryIndex] = useState<number | null>(null);
    const [dragTooltip, setDragTooltip] = useState<{ time: number; leftPx: number } | null>(null);

    const handleMouseMoveOverlay = useCallback((e: MouseEvent) => {
        if (draggingBoundaryIndex === null || !wavesurferRef.current || !duration || !task?.segments) return;

        const ws = wavesurferRef.current;
        const rect = containerRef.current!.getBoundingClientRect();
        const scrollWrapper = ws.getWrapper();
        if (!scrollWrapper) return;

        const scrollOffset = scrollWrapper.scrollLeft;
        const xPos = e.clientX - rect.left + scrollOffset;
        const totalWidth = scrollWrapper.scrollWidth;

        // Clamp time between 0 and duration
        let newTime = (xPos / totalWidth) * duration;
        newTime = Math.max(0, Math.min(newTime, duration));

        const newSegs = [...task.segments];
        const leftSeg = newSegs[draggingBoundaryIndex];
        const rightSeg = newSegs[draggingBoundaryIndex + 1];
        if (!leftSeg || !rightSeg) return;

        const minSegmentDuration = 0.1;
        const minBoundary = leftSeg.start + minSegmentDuration;
        const maxBoundary = rightSeg.end - minSegmentDuration;
        const clampedTime = Math.max(minBoundary, Math.min(newTime, maxBoundary));
        const tooltipLeftPx = (clampedTime / duration) * totalWidth;

        newSegs[draggingBoundaryIndex] = { ...leftSeg, end: clampedTime };
        newSegs[draggingBoundaryIndex + 1] = { ...rightSeg, start: clampedTime };
        setDragTooltip({ time: clampedTime, leftPx: tooltipLeftPx });
        updateTask(taskId, { segments: newSegs });
    }, [draggingBoundaryIndex, duration, task?.segments, taskId, updateTask]);

    const handleMouseUpOverlay = useCallback(() => {
        setDraggingBoundaryIndex(null);
        setDragTooltip(null);
    }, []);

    useEffect(() => {
        if (draggingBoundaryIndex !== null) {
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
    }, [draggingBoundaryIndex, handleMouseMoveOverlay, handleMouseUpOverlay]);

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

    if (!task) return null;

    return (
        <div className="flex-1 flex flex-col h-full bg-background relative min-w-0 min-h-0 overflow-hidden">
            {/* Top Toolbar */}
            <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 shrink-0 z-10 bg-background/50 backdrop-blur-md">
                <h3 className="font-medium text-foreground truncate min-w-0 pr-4" title={task.name}>
                    {task.name}
                </h3>

                {/* Tools */}
                <div className="flex bg-surface rounded-lg p-1 border border-white/5 shrink-0 ml-4">
                    <ToolButton
                        active={activeToolRef === 'split'}
                        onClick={() => setActiveTool('split')}
                        icon={<Scissors size={18} />}
                        label="Split"
                    />
                    <ToolButton
                        active={activeToolRef === 'include'}
                        onClick={() => setActiveTool('include')}
                        icon={<CheckSquare size={18} className="text-primary" />}
                        label="Include"
                    />
                    <ToolButton
                        active={activeToolRef === 'exclude'}
                        onClick={() => setActiveTool('exclude')}
                        icon={<XSquare size={18} className="text-foreground-muted" />}
                        label="Exclude"
                    />
                </div>
            </div>

            {/* Editor Main Canvas Area */}
            <div
                className="flex-1 relative flex flex-col w-full px-6 py-8 select-none min-h-0 min-w-0"
                onWheel={handleWheel}
            >
                <div className="w-full flex-1 relative rounded-xl border border-white/5 overflow-hidden bg-surface-hover/30 backdrop-blur-sm shadow-inner group">

                    {/* Main Waveform Container */}
                    <div
                        ref={containerRef}
                        className="w-full h-[200px] mt-10 cursor-crosshair relative overflow-hidden"
                        onClick={handleWaveformClick}
                        onContextMenu={handleContextMenu}
                    >
                        {/* Custom React Overlay for Regions */}
                        {task?.segments && duration > 0 && wavesurferRef.current && wavesurferRef.current.getWrapper() && (
                            <div
                                className="absolute inset-0 z-30 pointer-events-none"
                                style={{ transform: `translateX(${-scrollOffset}px)` }}
                            >
                                {task.segments.map((seg, i) => {
                                    const totalWidth = wavesurferRef.current!.getWrapper().scrollWidth;
                                    const leftPx = (seg.start / duration) * totalWidth;
                                    const widthPx = ((seg.end - seg.start) / duration) * totalWidth;

                                    const isFirst = i === 0;
                                    const isLast = i === task.segments!.length - 1;

                                    return (
                                        <div
                                            key={seg.id}
                                            className="absolute top-0 bottom-0 pointer-events-auto"
                                            style={{
                                                left: `${leftPx}px`,
                                                width: `${widthPx}px`,
                                                backgroundColor: seg.included ? 'transparent' : 'rgba(24, 24, 27, 0.75)',
                                            }}
                                        >
                                            {/* Left Boundary Handle */}
                                            <div
                                                className={cn(
                                                    "absolute top-0 bottom-0 z-20 cursor-col-resize select-none",
                                                    isFirst ? "left-0 w-[12px] bg-primary rounded-l-md shadow-[0_0_15px_rgba(250,204,21,0.4)] hover:bg-white hover:w-[16px]"
                                                        : "-left-[2px] w-[4px] bg-white rounded-[2px] shadow-[0_0_5px_rgba(0,0,0,0.8),inset_0_0_1px_rgba(0,0,0,0.5)] hover:w-[8px] hover:-left-[4px]"
                                                )}
                                                onMouseDown={(e) => {
                                                    e.stopPropagation();
                                                    e.preventDefault();
                                                    if (!isFirst) {
                                                        const boundaryTime = task.segments![i - 1].end;
                                                        const tooltipLeftPx = (boundaryTime / duration) * totalWidth;
                                                        setDraggingBoundaryIndex(i - 1);
                                                        setDragTooltip({ time: boundaryTime, leftPx: tooltipLeftPx });
                                                    }
                                                }}
                                                onClick={(e) => e.stopPropagation()}
                                            />

                                            {/* Right Boundary Handle */}
                                            <div
                                                className={cn(
                                                    "absolute top-0 bottom-0 z-20 cursor-col-resize select-none",
                                                    isLast ? "right-0 w-[12px] bg-primary rounded-r-md shadow-[0_0_15px_rgba(250,204,21,0.4)] hover:bg-white hover:w-[16px]"
                                                        : "-right-[2px] w-[4px] bg-white rounded-[2px] shadow-[0_0_5px_rgba(0,0,0,0.8),inset_0_0_1px_rgba(0,0,0,0.5)] hover:w-[8px] hover:-right-[4px]"
                                                )}
                                                onMouseDown={(e) => {
                                                    e.stopPropagation();
                                                    e.preventDefault();
                                                    if (!isLast) {
                                                        const boundaryTime = seg.end;
                                                        const tooltipLeftPx = (boundaryTime / duration) * totalWidth;
                                                        setDraggingBoundaryIndex(i);
                                                        setDragTooltip({ time: boundaryTime, leftPx: tooltipLeftPx });
                                                    }
                                                }}
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        </div>
                                    )
                                })}

                                {dragTooltip && draggingBoundaryIndex !== null && (
                                    <div
                                        className="absolute top-2 z-40 pointer-events-none"
                                        style={{
                                            left: `${dragTooltip.leftPx}px`,
                                            transform: 'translateX(-50%)',
                                        }}
                                    >
                                        <div className="rounded-md border border-white/10 bg-background-dark/95 px-2 py-1 text-xs font-mono text-primary shadow-lg backdrop-blur-sm">
                                            {formatTime(dragTooltip.time)}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Timeline Container */}
                    <div
                        ref={timelineRef}
                        className="timeline-container w-full absolute bottom-0 left-0 bg-background-dark/50 border-t border-white/5 cursor-ew-resize"
                    />

                    {/* Center Playhead Overlay (Visual Only) */}
                    <div className="absolute top-0 bottom-0 left-1/2 w-[1px] bg-white/20 pointer-events-none z-20 shadow-[0_0_10px_rgba(255,255,255,0.5)]" />
                </div>
            </div>

            {/* Player Dashboard Bottom */}
            <div className="h-24 border-t border-white/5 bg-background shrink-0 px-8 flex items-center gap-6 overflow-hidden w-full">

                {/* Time Display */}
                <div className="w-32 flex flex-col items-center justify-center font-mono bg-surface py-2 rounded-xl border border-white/5 shrink-0">
                    <span className="text-xl font-medium text-primary tracking-wider">{formatTime(currentTime)}</span>
                    <span className="text-xs text-foreground-muted">{formatTime(duration)}</span>
                </div>

                {/* Transport Controls */}
                <div className="flex items-center justify-center gap-4 flex-1">
                    <button
                        onClick={() => { wavesurferRef.current?.skip(-5) }}
                        className="w-10 h-10 flex items-center justify-center rounded-full text-foreground-muted hover:text-white hover:bg-surface transition-colors"
                    >
                        <SkipBack size={20} />
                    </button>

                    <button
                        onClick={() => { wavesurferRef.current?.playPause() }}
                        className="w-14 h-14 flex items-center justify-center rounded-full bg-primary text-background-dark hover:bg-primary-hover hover:scale-105 transition-all shadow-[0_0_20px_rgba(250,204,21,0.3)]"
                    >
                        {isPlaying ? <Pause size={28} className="fill-current" /> : <Play size={28} className="fill-current translate-x-1" />}
                    </button>

                    <button
                        onClick={() => { wavesurferRef.current?.skip(5) }}
                        className="w-10 h-10 flex items-center justify-center rounded-full text-foreground-muted hover:text-white hover:bg-surface transition-colors"
                    >
                        <SkipForward size={20} />
                    </button>
                </div>

                {/* Seek Bar (Optional duplicate control) */}
                <div className="w-64 flex items-center">
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
                        className="w-full h-2 rounded-lg appearance-none bg-surface-active cursor-pointer outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
                    />
                </div>

            </div>
        </div>
    );
}

// Helper Sub-component
function ToolButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                active
                    ? "bg-background-dark shadow-sm text-foreground border border-white/5"
                    : "text-foreground-muted hover:text-foreground hover:bg-surface-hover border border-transparent"
            )}
        >
            {icon}
            {label}
        </button>
    );
}
