
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, Loader2, Sparkles, X, Scissors, Check, Ban, ChevronLeft, ChevronsLeft, ChevronRight, ChevronsRight } from 'lucide-react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.esm.js';
import { useStore, AudioSegment, FileTask } from '../store';
import { convertFileSrc } from '@tauri-apps/api/core';
import clsx from 'clsx';


const UI_COLORS = {
    includeWave: '#facc15',                 // Bright Yellow for the actual waveform
    includeBorder: 'rgba(234, 179, 8, 0.8)',
    excludeWave: '#555555',                 // Dim Gray for the actual waveform
    excludeBorder: 'transparent',
};

export const FileEditor: React.FC = () => {
    const { selectedTaskId, tasks, updateTask, selectTask } = useStore();
    const task = tasks.find((t) => t.id === selectedTaskId) as FileTask | undefined;

    const containerRef = useRef<HTMLDivElement>(null);
    const timelineRef = useRef<HTMLDivElement>(null);
    const wsRef = useRef<WaveSurfer | null>(null);
    const wsRegionsRef = useRef<RegionsPlugin | null>(null);

    const [isPlaying, setIsPlaying] = useState(false);
    const [zoom, setZoom] = useState(1);
    const [isReady, setIsReady] = useState(false);

    // UI States
    const [activeTool, setActiveTool] = useState<'cut' | 'include' | 'exclude'>('cut');
    const [hoverX, setHoverX] = useState<number | null>(null);

    // IsPlaying Mutex Ref
    const isPlayingRef = useRef(false);

    // Seek Bar Refs
    const progressRef = useRef<HTMLInputElement>(null);
    const timeDisplayRef = useRef<HTMLSpanElement>(null);
    const durationDisplayRef = useRef<HTMLSpanElement>(null);
    const isScrubbingRef = useRef(false);

    useEffect(() => {
        isPlayingRef.current = isPlaying;
        if (wsRef.current) {
            // Natively enable interactions (seek and scrub playhead) ONLY when playing
            wsRef.current.setOptions({ interact: isPlaying });
        }
    }, [isPlaying]);

    // Keyboard listeners for scrubbing during playback
    useEffect(() => {
        if (!isReady || !wsRef.current || !isPlaying) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

            let skipTime = 0;
            if (e.key === 'ArrowLeft') skipTime = -5;
            else if (e.key === 'ArrowRight') skipTime = 5;
            else if (e.key === ',' || e.key === '<') skipTime = -1;
            else if (e.key === '.' || e.key === '>') skipTime = 1;

            if (skipTime !== 0) {
                e.preventDefault();
                const ws = wsRef.current;
                const newTime = Math.max(0, Math.min(ws.getDuration(), ws.getCurrentTime() + skipTime));
                ws.setTime(newTime);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isReady, isPlaying]);

    // Hard sync function for generating regions from state without destroying existing ones
    const syncRegionsToState = useCallback((wsRegions: RegionsPlugin, segments: AudioSegment[]) => {
        const existingRegions = wsRegions.getRegions();

        // Remove regions that are gone
        existingRegions.forEach(r => {
            if (!segments.find(s => s.id === r.id)) {
                r.remove();
            }
        });

        segments.forEach(seg => {
            let region = wsRegions.getRegions().find(r => r.id === seg.id);

            if (!region) {
                region = wsRegions.addRegion({
                    id: seg.id,
                    start: seg.start,
                    end: seg.end,
                    color: 'transparent',
                    drag: false,
                    resize: true,
                });
            } else {
                if (Math.abs(region.start - seg.start) > 0.05 || Math.abs(region.end - seg.end) > 0.05) {
                    region.setOptions({
                        start: seg.start,
                        end: seg.end,
                        color: 'transparent'
                    });
                }
            }

            // Style handles natively. Removed background blends.
            if (region.element) {
                // Remove all backgrounds and shadows, leaving ONLY the handles. Wait, handles are just borders on the region.
                region.element.style.backgroundColor = 'transparent';
                region.element.style.mixBlendMode = 'normal';

                // We only show borders for cuts to make them visible, though the wave color makes it obvious
                region.element.style.borderLeft = `1px solid ${UI_COLORS.includeBorder}`;
                region.element.style.borderRight = `1px solid ${UI_COLORS.includeBorder}`;
                region.element.style.boxShadow = 'none';

                // Make the grab handles a bit wider and more obvious for dragging
                const handles = region.element.querySelectorAll('div');
                handles.forEach(h => {
                    if (h.style.cursor === 'col-resize') {
                        h.style.width = '6px';
                        h.style.backgroundColor = 'rgba(255,255,255,0.1)';
                    }
                });
            }
        });

        // --- DYNAMIC CANVAS GRADIENT GENERATION (TRUE WAVEFORM COLOR) ---
        // This physically paints the WaveSurfer canvas bars exactly based on time segments
        if (wsRef.current && wsRef.current.getWrapper()) {
            const duration = wsRef.current.getDuration();
            if (duration > 0 && segments.length > 0) {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    // We create a linear gradient horizontally
                    const gradient = ctx.createLinearGradient(0, 0, 1000, 0); // 1000 is an arbitrary normalized width

                    // Sort segments by time to ensure ordered color stops
                    const sortedSegs = [...segments].sort((a, b) => a.start - b.start);

                    sortedSegs.forEach((seg) => {
                        // Clamp values between 0.0 and 1.0 to prevent CanvasGradient crash on edge drag overshoots
                        let startPct = Math.max(0, Math.min(1, seg.start / duration));
                        let endPct = Math.max(0, Math.min(1, seg.end / duration));

                        // Fix floating point sorting issues for exact sharp color cuts
                        if (startPct > endPct) startPct = endPct;

                        const color = seg.included ? UI_COLORS.includeWave : UI_COLORS.excludeWave;

                        // Create a hard stop to prevent blending between segments
                        gradient.addColorStop(startPct, color);
                        gradient.addColorStop(endPct, color);
                    });

                    wsRef.current.setOptions({
                        waveColor: gradient,
                        progressColor: gradient
                    });
                }
            }
        }
    }, []);

    // Effect: Initialize WaveSurfer
    useEffect(() => {
        if (!task || !containerRef.current || !timelineRef.current) return;

        let ws: WaveSurfer | null = null;
        let wsRegions: RegionsPlugin | null = null;
        let objectUrl: string = '';
        setIsReady(false);

        if (wsRef.current) {
            wsRef.current.destroy();
        }

        ws = WaveSurfer.create({
            container: containerRef.current,
            waveColor: UI_COLORS.excludeWave, // Default everything to exclude color
            progressColor: UI_COLORS.excludeWave,
            cursorColor: '#ffffff',
            cursorWidth: 2,
            barWidth: 2,
            barGap: 2,
            barRadius: 2,
            height: 200,
            normalize: true,
            interact: false, // Disables native WS click/drag to prevent playhead scrubbing, giving our custom drag pan priority
            hideScrollbar: true, // Natively disable the internal shadow DOM scrollbar
            minPxPerSec: 50 * zoom,
            plugins: [
                TimelinePlugin.create({
                    container: timelineRef.current,
                    height: 24,
                    timeInterval: 0.2, // Adjust temporal density
                    primaryLabelInterval: 5,
                    style: {
                        color: '#ffffff80',
                    }
                })
            ]
        });
        wsRef.current = ws;

        wsRegions = ws.registerPlugin(RegionsPlugin.create());
        wsRegionsRef.current = wsRegions;

        try {
            objectUrl = task.file ? URL.createObjectURL(task.file) : convertFileSrc(task.file_path!);
            ws.load(objectUrl);
        } catch (err) {
            console.error("Failed to load object URL:", err);
        }

        ws.on('ready', () => {
            setIsReady(true);
            const duration = ws!.getDuration();

            if (durationDisplayRef.current) {
                const mins = Math.floor(duration / 60);
                const secs = Math.floor(duration % 60);
                durationDisplayRef.current.innerText = `${mins}:${secs.toString().padStart(2, '0')}`;
            }
            if (progressRef.current) {
                progressRef.current.max = duration.toString();
            }

            // Initialize default segment if none exist
            if (!task.segments || task.segments.length === 0) {
                const initSeg: AudioSegment = { id: `seg-${Date.now()}`, start: 0, end: duration, included: true };
                updateTask(task.id, { segments: [initSeg] });
            } else {
                syncRegionsToState(wsRegions!, task.segments);
            }
        });

        ws.on('timeupdate', (time) => {
            if (progressRef.current && !isScrubbingRef.current) {
                progressRef.current.value = time.toString();
                const percent = (time / ws!.getDuration()) * 100;
                progressRef.current.style.background = `linear-gradient(to right, #eab308 ${percent}%, rgba(255,255,255,0.1) ${percent}%)`;
            }
            if (timeDisplayRef.current) {
                const mins = Math.floor(time / 60);
                const secs = Math.floor(time % 60);
                timeDisplayRef.current.innerText = `${mins}:${secs.toString().padStart(2, '0')}`;
            }
        });

        // Smooth mouse wheel zooming via container event
        const handleWheel = (e: WheelEvent) => {
            e.preventDefault(); // Prevent page scroll
            const isScrollingDown = e.deltaY > 0;
            setZoom(z => Math.max(0.5, Math.min(10, isScrollingDown ? z - 0.2 : z + 0.2)));
        };
        // Use capture phase to ensure WaveSurfer doesn't eat the wheel event entirely if it tries
        // Use capture phase to ensure WaveSurfer doesn't eat the wheel event entirely if it tries
        // Handle Base Tool Actions (Clicks that hit the waveform directly are handled manually below in onMouseUp since interact: false)

        // Handle Extended Tool Actions (Clicks that hit an existing Region DOM overlay)
        wsRegions.on('region-clicked', (region, e) => {
            if (isPlayingRef.current) return; // Mutex: Disable edits while playing
            const currentTool = useStore.getState().activeToolRef || 'cut';

            // For include/exclude modes, stop propagation to prevent simultaneous native actions if any
            e.stopPropagation();

            if (currentTool === 'include' || currentTool === 'exclude') {
                const isIncluded = currentTool === 'include';

                const segments = useStore.getState().tasks.find(t => t.id === task.id)?.segments || [];
                const newSegs = [...segments];
                const segIndex = newSegs.findIndex(s => s.id === region.id);

                if (segIndex !== -1) {
                    newSegs[segIndex] = { ...newSegs[segIndex], included: isIncluded };

                    // Smart Merge immediately if neighbors match colors, to keep regions clean
                    let mergedSegments: AudioSegment[] = [];
                    for (let i = 0; i < newSegs.length; i++) {
                        const current = newSegs[i];
                        const prev = mergedSegments[mergedSegments.length - 1];

                        if (prev && prev.included === current.included) {
                            prev.end = current.end;
                        } else {
                            mergedSegments.push({ ...current });
                        }
                    }

                    updateTask(task.id, { segments: mergedSegments });
                }
            } else if (currentTool === 'cut') {
                if (!region.element) return;
                // Calculate precise cut time relative to the clicked region's bounds
                const rect = region.element.getBoundingClientRect();
                const relativeX = (e.clientX - rect.left) / rect.width;
                const clickTime = region.start + relativeX * (region.end - region.start);

                const segments = useStore.getState().tasks.find(t => t.id === task.id)?.segments || [];
                const clickedSegIndex = segments.findIndex(s => clickTime >= s.start && clickTime <= s.end);

                if (clickedSegIndex !== -1) {
                    const seg = segments[clickedSegIndex];
                    // Increase sensitivity for cutting vs dragging handles
                    if (clickTime - seg.start < 0.1 || seg.end - clickTime < 0.1) return;

                    const newSegs = [...segments];
                    const leftSeg: AudioSegment = { ...seg, end: clickTime };
                    const rightSeg: AudioSegment = { id: `seg-${Date.now()}`, start: clickTime, end: seg.end, included: seg.included };

                    newSegs.splice(clickedSegIndex, 1, leftSeg, rightSeg);
                    updateTask(task.id, { segments: newSegs });
                }
            }
        });

        wsRegions.on('region-update', (region) => {
            const sortedRegions = wsRegions!.getRegions().sort((a, b) => a.start - b.start);
            const idx = sortedRegions.findIndex(r => r.id === region.id);
            if (idx === -1) return;

            // Shift neighbors ONLY if they exist. No fixed 0 or duration snapping.
            if (idx > 0) {
                const prev = sortedRegions[idx - 1];
                if (region.start < prev.start + 0.1) region.start = prev.start + 0.1;
                if (Math.abs(prev.end - region.start) > 0.001) {
                    prev.setOptions({ end: region.start });
                }
            } else {
                // Free floating start, bounded only by 0
                if (region.start < 0) region.start = 0;
            }

            if (idx < sortedRegions.length - 1) {
                const next = sortedRegions[idx + 1];
                if (region.end > next.end - 0.1) region.end = next.end - 0.1;
                if (Math.abs(next.start - region.end) > 0.001) {
                    next.setOptions({ start: region.end });
                }
            } else {
                // Free floating end, bounded only by duration
                if (region.end > ws!.getDuration()) region.end = ws!.getDuration();
            }
        });

        // Save layout to store ONLY when drag finishes AND positions meaningfully changed (ignore window resizes!)
        wsRegions.on('region-updated', () => {
            const sortedRegions = wsRegions!.getRegions().sort((a, b) => a.start - b.start);
            const currentSegments = useStore.getState().tasks.find(t => t.id === task.id)?.segments || [];

            let hasChanges = false;
            if (sortedRegions.length !== currentSegments.length) {
                hasChanges = true;
            } else {
                for (let i = 0; i < sortedRegions.length; i++) {
                    const r = sortedRegions[i];
                    const s = currentSegments.find(x => x.id === r.id);
                    if (!s || Math.abs(s.start - r.start) > 0.05 || Math.abs(s.end - r.end) > 0.05) {
                        hasChanges = true;
                        break;
                    }
                }
            }

            if (!hasChanges) return;

            // Map the dragged visual layout back into our state
            const newSegs = sortedRegions.map(r => {
                const existing = currentSegments.find(s => s.id === r.id);
                return {
                    id: r.id,
                    start: r.start,
                    end: r.end,
                    included: existing ? existing.included : true
                };
            });
            updateTask(task.id, { segments: newSegs });
        });

        // Handle Right Click on Split Line to Delete (Context Menu)
        const handleContextMenu = (e: MouseEvent) => {
            e.preventDefault();
            if (!ws || isPlayingRef.current) return;
            const rect = containerRef.current!.getBoundingClientRect();
            const wrapper = ws.getWrapper();
            if (!wrapper) return;

            const clickTime = ((wrapper.scrollLeft + e.clientX - rect.left) / wrapper.scrollWidth) * ws.getDuration();
            const tolerance = (15 / wrapper.scrollWidth) * ws.getDuration(); // 15 pixels tolerance

            const segments = useStore.getState().tasks.find(t => t.id === task.id)?.segments || [];
            // Sort by start time to safely process adjacent nodes
            const sortedSegs = [...segments].sort((a, b) => a.start - b.start);

            for (let i = 0; i < sortedSegs.length - 1; i++) {
                const splitTime = sortedSegs[i].end; // Same as sortedSegs[i+1].start
                if (Math.abs(splitTime - clickTime) < Math.max(0.1, tolerance)) {
                    // Delete this split line by merging segment[i] and segment[i+1]
                    const newSegs = [...sortedSegs];
                    const leftSeg = newSegs[i];
                    const rightSeg = newSegs[i + 1];

                    // Merge into Left Seg, adopting its Include state
                    newSegs.splice(i, 2, { ...leftSeg, end: rightSeg.end });
                    updateTask(task.id, { segments: newSegs });
                    break;
                }
            }
        };
        containerRef.current.addEventListener('contextmenu', handleContextMenu);

        // --- MAIN WAVEFORM PANNING (Drag to Pan & Scroll to Pan) ---
        let isDragging = false;
        let didDrag = false;
        let startX: number;
        let scrollLeft: number;

        const onMouseDown = (e: MouseEvent) => {
            if (isPlayingRef.current) return; // Let WaveSurfer handle it natively for scrubbing during play
            // Let regions handle their own dragging if clicking on a split handle
            const target = (e.composedPath && e.composedPath()[0]) as HTMLElement || e.target;
            if (target && target.tagName && target.tagName.toLowerCase() === 'div' && target.style.cursor === 'col-resize') return;

            isDragging = true;
            didDrag = false;
            startX = e.pageX;
            if (wsRef.current) scrollLeft = wsRef.current.getScroll();
        };
        const onMouseUp = (e: MouseEvent) => {
            if (isPlayingRef.current) {
                isDragging = false;
                return;
            }
            if (isDragging && !didDrag && containerRef.current?.contains(e.target as Node)) {
                // This was a clean click without dragging, manually handle cut
                const currentTool = useStore.getState().activeToolRef || 'cut';
                if (currentTool === 'cut' && wsRef.current) {
                    const rect = containerRef.current.getBoundingClientRect();
                    const wrapper = wsRef.current.getWrapper();
                    if (wrapper) {
                        const time = ((wrapper.scrollLeft + e.clientX - rect.left) / wrapper.scrollWidth) * wsRef.current.getDuration();

                        const segments = useStore.getState().tasks.find(t => t.id === task.id)?.segments || [];
                        const clickedSegIndex = segments.findIndex(s => time >= s.start && time <= s.end);

                        if (clickedSegIndex !== -1) {
                            const seg = segments[clickedSegIndex];
                            if (time - seg.start > 0.1 && seg.end - time > 0.1) {
                                const newSegs = [...segments];
                                const leftSeg: AudioSegment = { ...seg, end: time };
                                const rightSeg: AudioSegment = { id: `seg-${Date.now()}`, start: time, end: seg.end, included: seg.included };

                                newSegs.splice(clickedSegIndex, 1, leftSeg, rightSeg);
                                updateTask(task.id, { segments: newSegs });
                            }
                        }
                    }
                }
            }
            isDragging = false;
        };
        const onMouseMove = (e: MouseEvent) => {
            if (!isDragging || isPlayingRef.current) return;
            // Prevent split action triggering on drag by marking didDrag
            if (Math.abs(e.pageX - startX) > 3) didDrag = true;

            e.preventDefault();
            if (!wsRef.current) return;
            const x = e.pageX;
            const walk = (x - startX) * 1.5; // Pan speed multiplier
            wsRef.current.setScroll(scrollLeft - walk);
        };

        const onWheelPan = (e: WheelEvent) => {
            // Only pan if the mouse is hovering over the container
            if (!containerRef.current?.contains(e.target as Node)) return;
            // if (isPlayingRef.current) return; // Keep wheel pan active during play if they want to scroll ahead
            e.preventDefault();
            if (!wsRef.current) return;
            // Scroll horizontally based on deltaY (vertical scroll wheel translates to horizontal pan)
            const currentScroll = wsRef.current.getScroll();
            wsRef.current.setScroll(currentScroll + e.deltaY);
        };

        if (containerRef.current) {
            containerRef.current.addEventListener('mousedown', onMouseDown, { capture: true });
            // Wheel event must be passive: false to preventDefault, and captured to beat WaveSurfer
            containerRef.current.addEventListener('wheel', onWheelPan, { passive: false, capture: true });
        }

        // --- TIMELINE ZOOMING (Scroll to Zoom) ---
        if (timelineRef.current) {
            timelineRef.current.addEventListener('wheel', handleWheel, { passive: false });
        }

        window.addEventListener('mouseup', onMouseUp);
        window.addEventListener('mousemove', onMouseMove);

        // --- TIMELINE SYNCING ---
        // Native WaveSurfer scrolling (or our manual setScroll) emits this event.
        // TimelinePlugin doesn't auto-scroll its external container if it uses Shadow DOM or an inner wrapper.
        ws.on('scroll', () => {
            if (timelineRef.current && wsRef.current) {
                const timelineWrapper = timelineRef.current.shadowRoot
                    ? timelineRef.current.shadowRoot.querySelector('div')
                    : timelineRef.current.firstElementChild as HTMLElement;

                if (timelineWrapper) {
                    timelineWrapper.scrollLeft = wsRef.current.getScroll();
                } else {
                    timelineRef.current.scrollLeft = wsRef.current.getScroll();
                }
            }
        });

        ws.on('error', (err) => {
            if (err && err.toString().includes('Failed to fetch')) return;
            console.error("WaveSurfer Error:", err);
        });

        ws.on('play', () => setIsPlaying(true));
        ws.on('pause', () => setIsPlaying(false));

        return () => {
            if (ws) ws.destroy();
            if (task.file && objectUrl) URL.revokeObjectURL(objectUrl);
            if (timelineRef.current) {
                timelineRef.current.removeEventListener('wheel', handleWheel);
            }
            if (containerRef.current) {
                containerRef.current.removeEventListener('contextmenu', handleContextMenu);
                containerRef.current.removeEventListener('mousedown', onMouseDown as EventListener, { capture: true });
                containerRef.current.removeEventListener('wheel', onWheelPan as EventListener);
            }
            window.removeEventListener('mouseup', onMouseUp);
            window.removeEventListener('mousemove', onMouseMove);
        };
    }, [task?.id]);

    // Sync the local activeTool state to the store briefly so event listeners can read it
    useEffect(() => {
        useStore.setState({ activeToolRef: activeTool });
    }, [activeTool]);

    // Apply zoom updates natively
    useEffect(() => {
        if (wsRef.current && isReady) {
            wsRef.current.zoom(50 * zoom);
        }
    }, [zoom, isReady]);

    // Re-sync regions purely when segments state changes from outside
    useEffect(() => {
        if (wsRegionsRef.current && isReady && task?.segments) {
            syncRegionsToState(wsRegionsRef.current, task.segments);
        }
    }, [task?.segments, isReady, syncRegionsToState]);

    // Handlers for Toolbar
    const togglePlay = () => wsRef.current?.playPause();

    if (!task) return null;

    return (
        <AnimatePresence mode="popLayout">
            <motion.div
                key={task.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
                className="flex flex-col flex-1 h-full bg-background relative min-w-0"
            >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] to-transparent pointer-events-none z-0" />

                {/* Header */}
                <div className="h-20 shrink-0 px-8 flex items-center justify-between border-b border-white/5 relative z-10 glass-panel">
                    <div className="flex flex-col">
                        <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60 tracking-tight">
                            {task.name}
                        </h2>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-white/5 text-white/40 uppercase tracking-widest border border-white/5">
                                {task.provider} / {task.modelSize}
                            </span>
                        </div>
                    </div>

                    <button
                        onClick={() => selectTask(null)}
                        className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-all shadow-inner border border-white/5"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Main Editor Center */}
                <div className="flex flex-col flex-1 overflow-y-auto px-8 relative z-10 py-6 space-y-6">

                    {/* Interactive Editor Container */}
                    <div className="flex flex-col gap-6">

                        {/* 3-Mode Unified Toolbar */}
                        <div className="flex flex-col items-center justify-center gap-2 relative z-10 w-full mb-2">
                            <div className={clsx(
                                "flex bg-[#1a1c23] border border-white/5 p-1 rounded-2xl gap-2 transition-all duration-300 shadow-xl",
                                isPlaying ? "opacity-50 pointer-events-none" : ""
                            )}>
                                <button
                                    onClick={() => setActiveTool('cut')}
                                    className={clsx(
                                        "flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-bold transition-all",
                                        activeTool === 'cut'
                                            ? "bg-white/10 text-white shadow-sm ring-1 ring-white/10"
                                            : "text-white/40 hover:text-white hover:bg-white/5"
                                    )}
                                >
                                    <Scissors className="w-4 h-4" /> 剪下
                                </button>

                                <button
                                    onClick={() => setActiveTool('include')}
                                    className={clsx(
                                        "flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-bold transition-all",
                                        activeTool === 'include'
                                            ? "bg-primary/20 text-primary shadow-sm ring-1 ring-primary/40"
                                            : "text-white/40 hover:text-white hover:bg-white/5"
                                    )}
                                >
                                    <Check className="w-4 h-4" /> 保留
                                </button>

                                <button
                                    onClick={() => setActiveTool('exclude')}
                                    className={clsx(
                                        "flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-bold transition-all",
                                        activeTool === 'exclude'
                                            ? "bg-white/10 text-white shadow-sm ring-1 ring-white/10"
                                            : "text-white/40 hover:text-white hover:bg-white/5"
                                    )}
                                >
                                    <Ban className="w-4 h-4" /> 排除
                                </button>
                            </div>

                            {/* Editor Interaction Hint text based on Active Tool */}
                            <div className={clsx("text-xs font-medium tracking-wide transition-all duration-300", isPlaying ? "text-primary/70 animate-pulse" : "text-white/30")}>
                                {isPlaying ? "播放中：編輯已鎖定，可拖拉下方進度條快轉" : activeTool === 'cut' ? "點擊波形進行分割，右鍵點擊分割線可刪除" : "點擊任一區段以套用保留或排除狀態"}
                            </div>
                        </div>

                        {/* Waveform Visualization Box */}
                        <div className="glass-panel border-white/5 pt-8 p-6 rounded-3xl relative shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden">

                            {/* Loading State Overlay */}
                            {!isReady && (
                                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm rounded-3xl">
                                    <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
                                    <span className="text-white/50 font-medium animate-pulse tracking-widest text-sm uppercase">Engine Decoding Audio...</span>
                                </div>
                            )}

                            {/* The WaveSurfer element */}
                            <div
                                ref={containerRef}
                                className="w-full relative cursor-crosshair min-h-[200px] hide-ws-scrollbar"
                                onMouseMove={(e) => {
                                    if (activeTool === 'cut' && containerRef.current) {
                                        const rect = containerRef.current.getBoundingClientRect();
                                        setHoverX(e.clientX - rect.left);
                                    }
                                }}
                                onMouseLeave={() => setHoverX(null)}
                            >
                                {hoverX !== null && activeTool === 'cut' && (
                                    <div
                                        className="absolute top-0 bottom-0 w-[2px] bg-red-500/80 pointer-events-none z-50 shadow-[0_0_10px_rgba(239,68,68,0.8)]"
                                        style={{ left: hoverX }}
                                    />
                                )}
                            </div>

                            {/* Timeline ruler (Interactive scroll zoom zone) */}
                            <div
                                ref={timelineRef}
                                title="Scroll wheel here to Zoom scale."
                                className="w-full mt-4 border-t border-white/5 pt-2 pb-2 opacity-50 overflow-hidden hide-ws-scrollbar hover:opacity-100 hover:bg-white/5 transition-all rounded-b-xl"
                            />
                        </div>
                    </div>

                    {/* Bottom Action Bar - Music Player Dashboard */}
                    <div className="flex flex-col items-center justify-center glass-panel p-6 rounded-3xl border border-white/5 shadow-2xl mt-auto relative overflow-hidden">
                        {isPlaying && (
                            <div className="absolute inset-0 bg-primary/5 pointer-events-none animate-pulse" />
                        )}

                        {/* Seek Bar + Times */}
                        <div className="flex items-center gap-4 w-full max-w-2xl mb-6 z-10 transition-opacity duration-300">
                            <span ref={timeDisplayRef} className="text-xs font-mono text-white/50 w-12 text-right">0:00</span>
                            <div className="flex-1 relative flex items-center h-4 group">
                                <input
                                    type="range"
                                    ref={progressRef}
                                    min={0}
                                    step={0.01}
                                    defaultValue={0}
                                    onMouseDown={(e) => {
                                        isScrubbingRef.current = true;
                                        if (wsRef.current) wsRef.current.setTime(Number(e.currentTarget.value));
                                    }}
                                    onMouseUp={() => { isScrubbingRef.current = false; }}
                                    onChange={(e) => {
                                        const t = Number(e.target.value);
                                        if (wsRef.current) {
                                            wsRef.current.setTime(t);
                                            // Look responsive visually while dragging rapidly
                                            const percent = (t / wsRef.current.getDuration()) * 100;
                                            e.target.style.background = `linear-gradient(to right, #eab308 ${percent}%, rgba(255,255,255,0.1) ${percent}%)`;
                                        }
                                        if (timeDisplayRef.current) {
                                            const mins = Math.floor(t / 60);
                                            const secs = Math.floor(t % 60);
                                            timeDisplayRef.current.innerText = `${mins}:${secs.toString().padStart(2, '0')}`;
                                        }
                                    }}
                                    className="absolute inset-0 w-full h-1.5 rounded-full appearance-none cursor-pointer hover:h-2 transition-all z-10"
                                    style={{ background: 'rgba(255,255,255,0.1)' }}
                                />
                                {/* Custom Seek Thumb implemented natively via index.css if needed, or webkit default */}
                            </div>
                            <span ref={durationDisplayRef} className="text-xs font-mono text-white/50 w-12 text-left">0:00</span>
                        </div>

                        <div className="flex items-center gap-4 relative z-10">
                            {/* -5s */}
                            <button onClick={() => { if (wsRef.current) wsRef.current.setTime(Math.max(0, wsRef.current.getCurrentTime() - 5)); }} className="w-12 h-12 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-all shadow-inner border border-white/5 active:scale-95">
                                <ChevronsLeft className="w-5 h-5" />
                            </button>
                            {/* -1s */}
                            <button onClick={() => { if (wsRef.current) wsRef.current.setTime(Math.max(0, wsRef.current.getCurrentTime() - 1)); }} className="w-12 h-12 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-all shadow-inner border border-white/5 active:scale-95">
                                <ChevronLeft className="w-5 h-5" />
                            </button>

                            {/* Play/Pause */}
                            <button
                                onClick={togglePlay}
                                disabled={!isReady}
                                className={clsx(
                                    "shrink-0 w-20 h-20 flex items-center justify-center rounded-[2rem] transition-all shadow-lg mx-4",
                                    isReady
                                        ? "bg-primary text-black hover:bg-primary-hover hover:scale-[1.03] active:scale-95 shadow-[0_4px_25px_rgba(234,179,8,0.4)]"
                                        : "bg-white/5 text-white/30 cursor-not-allowed border border-white/10 shadow-none"
                                )}
                            >
                                {isPlaying ? <Pause className="fill-current w-8 h-8" /> : <Play className="fill-current w-8 h-8 ml-1" />}
                            </button>

                            {/* +1s */}
                            <button onClick={() => { if (wsRef.current) wsRef.current.setTime(Math.min(wsRef.current.getDuration(), wsRef.current.getCurrentTime() + 1)); }} className="w-12 h-12 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-all shadow-inner border border-white/5 active:scale-95">
                                <ChevronRight className="w-5 h-5" />
                            </button>
                            {/* +5s */}
                            <button onClick={() => { if (wsRef.current) wsRef.current.setTime(Math.min(wsRef.current.getDuration(), wsRef.current.getCurrentTime() + 5)); }} className="w-12 h-12 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-all shadow-inner border border-white/5 active:scale-95">
                                <ChevronsRight className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="text-[10px] font-mono text-white/30 mt-4 uppercase tracking-widest flex gap-6">
                            <span className="flex items-center gap-1.5 opacity-70 hover:opacity-100 transition-opacity">
                                Skip 1s:
                                <kbd className="px-1.5 py-0.5 bg-black/30 rounded border border-white/10 shadow-inner">&lt;</kbd>
                                <kbd className="px-1.5 py-0.5 bg-black/30 rounded border border-white/10 shadow-inner">&gt;</kbd>
                            </span>
                            <span className="w-px h-4 bg-white/10" />
                            <span className="flex items-center gap-1.5 opacity-70 hover:opacity-100 transition-opacity">
                                Skip 5s:
                                <kbd className="px-1.5 py-0.5 bg-black/30 rounded border border-white/10 shadow-inner">←</kbd>
                                <kbd className="px-1.5 py-0.5 bg-black/30 rounded border border-white/10 shadow-inner">→</kbd>
                            </span>
                        </div>
                    </div>

                </div>
            </motion.div>
        </AnimatePresence>
    );
};
