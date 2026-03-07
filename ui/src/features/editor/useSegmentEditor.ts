import { useCallback, useEffect, useState } from 'react';
import type { RefObject } from 'react';
import type WaveSurfer from 'wavesurfer.js';
import type { AudioSegment, FileTask } from '../tasks/types';

interface SegmentEditorOptions {
    task: FileTask | undefined;
    taskId: string;
    duration: number;
    currentToolRef: RefObject<'split' | 'include' | 'exclude'>;
    containerRef: RefObject<HTMLDivElement | null>;
    wavesurferRef: RefObject<WaveSurfer | null>;
    getTimelineMetrics: () => { viewportWidth: number; scrollLeft: number; totalWidth: number };
    updateTask: (id: string, updater: FileTask | ((task: FileTask) => FileTask)) => void;
}

export function useSegmentEditor({
    task,
    taskId,
    duration,
    currentToolRef,
    containerRef,
    wavesurferRef,
    getTimelineMetrics,
    updateTask,
}: SegmentEditorOptions) {
    const [draggingBoundary, setDraggingBoundary] = useState<
        | { kind: 'segment'; index: number }
        | { kind: 'trim-start' }
        | { kind: 'trim-end' }
        | null
    >(null);
    const [dragTooltip, setDragTooltip] = useState<{ time: number; leftPx: number } | null>(null);

    const handleWaveformClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        if (!wavesurferRef.current || !duration || !containerRef.current) {
            return;
        }

        const segments = task?.editor.segments ?? [];
        if (segments.length === 0) {
            return;
        }

        const rect = containerRef.current.getBoundingClientRect();
        const { scrollLeft, totalWidth } = getTimelineMetrics();
        if (totalWidth <= 0) {
            return;
        }

        const xPos = event.clientX - rect.left + scrollLeft;
        const clickTime = (xPos / totalWidth) * duration;
        const activeTrim = task?.editor.trimRange ?? { start: 0, end: duration };
        if (clickTime < activeTrim.start || clickTime > activeTrim.end) {
            return;
        }

        const clickedSegmentIndex = segments.findIndex((segment) => clickTime >= segment.start && clickTime <= segment.end);
        if (clickedSegmentIndex === -1) {
            return;
        }

        const segment = segments[clickedSegmentIndex];
        const newSegments = [...segments];

        if (currentToolRef.current === 'split') {
            const leftSegment: AudioSegment = { ...segment, end: clickTime };
            const rightSegment: AudioSegment = {
                id: crypto.randomUUID(),
                start: clickTime,
                end: segment.end,
                included: segment.included,
            };
            newSegments.splice(clickedSegmentIndex, 1, leftSegment, rightSegment);
            updateTask(taskId, (currentTask) => ({ ...currentTask, editor: { ...currentTask.editor, segments: newSegments } }));
            return;
        }

        if (currentToolRef.current === 'include') {
            newSegments[clickedSegmentIndex] = { ...segment, included: true };
            updateTask(taskId, (currentTask) => ({ ...currentTask, editor: { ...currentTask.editor, segments: newSegments } }));
            return;
        }

        newSegments[clickedSegmentIndex] = { ...segment, included: false };
        updateTask(taskId, (currentTask) => ({ ...currentTask, editor: { ...currentTask.editor, segments: newSegments } }));
    }, [containerRef, currentToolRef, duration, getTimelineMetrics, task, taskId, updateTask, wavesurferRef]);

    const handleContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        event.preventDefault();
        const segments = task?.editor.segments ?? [];
        if (!wavesurferRef.current || segments.length <= 1 || !containerRef.current) {
            return;
        }

        const rect = containerRef.current.getBoundingClientRect();
        const { scrollLeft, totalWidth } = getTimelineMetrics();
        if (totalWidth <= 0) {
            return;
        }

        const xPos = event.clientX - rect.left + scrollLeft;
        const clickTime = (xPos / totalWidth) * duration;
        const activeTrim = task?.editor.trimRange ?? { start: 0, end: duration };
        if (clickTime < activeTrim.start || clickTime > activeTrim.end) {
            return;
        }

        const timeThreshold = (15 / totalWidth) * duration;
        let closestIndex = -1;
        let minDiff = Infinity;

        for (let i = 0; i < segments.length - 1; i += 1) {
            const diff = Math.abs(segments[i].end - clickTime);
            if (diff < minDiff && diff < timeThreshold) {
                minDiff = diff;
                closestIndex = i;
            }
        }

        if (closestIndex === -1) {
            return;
        }

        const newSegments = [...segments];
        const leftSegment = newSegments[closestIndex];
        const rightSegment = newSegments[closestIndex + 1];
        const mergedSegment: AudioSegment = {
            id: leftSegment.id,
            start: leftSegment.start,
            end: rightSegment.end,
            included: leftSegment.included,
        };
        newSegments.splice(closestIndex, 2, mergedSegment);
        updateTask(taskId, (currentTask) => ({ ...currentTask, editor: { ...currentTask.editor, segments: newSegments } }));
    }, [containerRef, duration, getTimelineMetrics, task, taskId, updateTask, wavesurferRef]);

    const handleMouseMoveOverlay = useCallback((event: MouseEvent) => {
        const segments = task?.editor.segments ?? [];
        if (!draggingBoundary || !wavesurferRef.current || !duration || segments.length === 0 || !containerRef.current) {
            return;
        }

        const rect = containerRef.current.getBoundingClientRect();
        const { scrollLeft, totalWidth } = getTimelineMetrics();
        if (totalWidth <= 0) {
            return;
        }

        const xPos = event.clientX - rect.left + scrollLeft;
        let newTime = (xPos / totalWidth) * duration;
        newTime = Math.max(0, Math.min(newTime, duration));

        if (draggingBoundary.kind === 'segment') {
            const newSegments = [...segments];
            const leftSegment = newSegments[draggingBoundary.index];
            const rightSegment = newSegments[draggingBoundary.index + 1];
            if (!leftSegment || !rightSegment) {
                return;
            }

            const minSegmentDuration = 0.1;
            const minBoundary = leftSegment.start + minSegmentDuration;
            const maxBoundary = rightSegment.end - minSegmentDuration;
            const clampedTime = Math.max(minBoundary, Math.min(newTime, maxBoundary));
            const tooltipLeftPx = (clampedTime / duration) * totalWidth;

            newSegments[draggingBoundary.index] = { ...leftSegment, end: clampedTime };
            newSegments[draggingBoundary.index + 1] = { ...rightSegment, start: clampedTime };
            setDragTooltip({ time: clampedTime, leftPx: tooltipLeftPx });
            updateTask(taskId, (currentTask) => ({ ...currentTask, editor: { ...currentTask.editor, segments: newSegments } }));
            return;
        }

        const existingTrim = task?.editor.trimRange ?? { start: 0, end: duration };
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
        updateTask(taskId, (currentTask) => ({ ...currentTask, editor: { ...currentTask.editor, trimRange: nextTrim } }));
    }, [containerRef, draggingBoundary, duration, getTimelineMetrics, task, taskId, updateTask, wavesurferRef]);

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

    return {
        draggingBoundary,
        dragTooltip,
        handleWaveformClick,
        handleContextMenu,
        setDraggingBoundary,
        setDragTooltip,
    };
}
