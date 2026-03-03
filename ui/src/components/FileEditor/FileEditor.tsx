import { useEffect, useRef, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
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
    const { tasks, updateTask, activeToolRef, setActiveTool } = useStore();
    const task = tasks.find(t => t.id === taskId);

    const containerRef = useRef<HTMLDivElement>(null);
    const timelineRef = useRef<HTMLDivElement>(null);
    const wavesurferRef = useRef<WaveSurfer | null>(null);
    const regionsRef = useRef<RegionsPlugin | null>(null);

    const currentToolRef = useActiveTool();

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [zoom, setZoom] = useState(50); // initial zoom pixels per second

    // 1. Initialize WaveSurfer
    useEffect(() => {
        if (!containerRef.current || !timelineRef.current || !task) return;

        // Destroy previous instance
        if (wavesurferRef.current) {
            wavesurferRef.current.destroy();
        }

        const ws = WaveSurfer.create({
            container: containerRef.current,
            waveColor: '#4f4f5a', // Tmp fallback color
            progressColor: '#facc15', // Tmp fallback color
            cursorColor: '#facc15',
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

        const regions = RegionsPlugin.create();

        ws.registerPlugin(timeline);
        ws.registerPlugin(regions);

        wavesurferRef.current = ws;
        regionsRef.current = regions;

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

            // Initialize segments if not present
            if (!task.segments || task.segments.length === 0) {
                const initialSegment: AudioSegment = {
                    id: Math.random().toString(36).substring(7),
                    start: 0,
                    end: audioDuration,
                    included: true
                };
                updateTask(task.id, { segments: [initialSegment] });
            } else {
                renderRegionsAndGradient(); // Initial render if moving between files
            }
        });

        ws.on('audioprocess', () => setCurrentTime(ws.getCurrentTime()));
        ws.on('seeking', () => setCurrentTime(ws.getCurrentTime()));
        ws.on('play', () => setIsPlaying(true));
        ws.on('pause', () => setIsPlaying(false));

        return () => {
            ws.destroy();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [task?.id]); // Re-init on file switch

    // 2. Render Gradient & Regions whenever segments change
    const renderRegionsAndGradient = useCallback(() => {
        if (!wavesurferRef.current || !regionsRef.current || !task?.segments || !duration) return;
        const ws = wavesurferRef.current;
        const segments = task.segments;

        // Clear existing regions
        regionsRef.current.clearRegions();

        // Re-draw regions (just boundaries, no bg)
        segments.forEach((seg) => {
            // Don't draw region for the very last end boundary to avoid duplicate lines
            regionsRef.current?.addRegion({
                id: seg.id,
                start: seg.start,
                end: seg.end,
                color: 'transparent',
                drag: false, // Prevent dragging the whole region
                resize: true, // Allow resizing edges
            });
        });

        // Generate Canvas Gradient based on include/exclude
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Create broad gradient for colors based on segments percentages
        const waveGrad = ctx.createLinearGradient(0, 0, containerRef.current!.offsetWidth, 0);
        // const progressGrad = ctx.createLinearGradient(0, 0, containerRef.current!.offsetWidth, 0); // Currently unused

        // CSS variables
        const colorPrimary = '#facc15'; // yellow highlight
        const colorDark = '#3f3f46';    // dark gray excluded

        segments.forEach(seg => {
            const startPercent = Math.max(0, seg.start / duration);
            // Hack: create sharp color stops
            const color = seg.included ? colorPrimary : colorDark;
            waveGrad.addColorStop(startPercent, color);
            // Small offset to make sharp edges
            if (startPercent + 0.0001 <= 1) {
                waveGrad.addColorStop(startPercent + 0.0001, color);
            }
        });

        ws.setOptions({
            waveColor: waveGrad,
            progressColor: waveGrad // Or make progress slightly brighter
        });

    }, [task?.segments, duration]);

    useEffect(() => {
        renderRegionsAndGradient();
    }, [renderRegionsAndGradient]);

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

    // 5. Region Drag/Resize Handling
    useEffect(() => {
        if (!regionsRef.current || !task?.segments) return;

        const onRegionUpdate = (_region: any) => {
            // Prevent overlapping (simplified logic for now)
            // Real robust logic needs to bound `region.start` and `region.end` strictly against neighbors
        };

        const onRegionUpdateEnd = (region: any) => {
            // Save to Zustand
            const newSegs = task.segments!.map(s => {
                if (s.id === region.id) {
                    return { ...s, start: region.start, end: region.end };
                }
                return s;
            });
            updateTask(taskId, { segments: newSegs });
        };

        regionsRef.current.on('region-update', onRegionUpdate);
        regionsRef.current.on('region-updated', onRegionUpdateEnd);

        return () => {
            regionsRef.current?.un('region-update', onRegionUpdate);
            regionsRef.current?.un('region-updated', onRegionUpdateEnd);
        }
    }, [task?.segments, taskId, updateTask]);

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
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 100);
        return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    };

    if (!task) return null;

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
            {/* Top Toolbar */}
            <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 shrink-0 z-10 bg-background/50 backdrop-blur-md">
                <h3 className="font-medium text-foreground truncate max-w-sm" title={task.name}>
                    {task.name}
                </h3>

                {/* Tools */}
                <div className="flex bg-surface rounded-lg p-1 border border-white/5">
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
                className="flex-1 relative flex flex-col w-full px-6 py-8 select-none"
                onWheel={handleWheel}
            >
                <div className="w-full flex-1 relative rounded-xl border border-white/5 overflow-hidden bg-surface-hover/30 backdrop-blur-sm shadow-inner group">

                    {/* Main Waveform Container */}
                    <div
                        ref={containerRef}
                        className="w-full h-[200px] mt-10 cursor-crosshair"
                        onClick={handleWaveformClick}
                        onContextMenu={handleContextMenu}
                    />

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
            <div className="h-24 border-t border-white/5 bg-background shrink-0 px-8 flex items-center gap-6">

                {/* Time Display */}
                <div className="w-32 flex flex-col items-center justify-center font-mono bg-surface py-2 rounded-xl border border-white/5">
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
