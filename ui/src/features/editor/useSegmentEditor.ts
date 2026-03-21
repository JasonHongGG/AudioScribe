import { useCallback, useEffect, useState } from 'react';
import type { RefObject } from 'react';
import type { ActiveTool, AudioSegment, EditorSession, WorkbenchEntry } from '../workbench/models';


interface SegmentEditorOptions {
    entry: WorkbenchEntry | undefined;
    assetId: string;
    duration: number;
    currentTool: ActiveTool;
    containerRef: RefObject<HTMLDivElement | null>;
    getTimelineMetrics: () => { viewportWidth: number; scrollLeft: number; totalWidth: number };
    updateEditorSession: (assetId: string, updater: EditorSession | ((editor: EditorSession) => EditorSession)) => void;
}


export function useSegmentEditor({
    entry,
    assetId,
    duration,
    currentTool,
    containerRef,
    getTimelineMetrics,
    updateEditorSession,
}: SegmentEditorOptions) {
    const [draggingBoundary, setDraggingBoundary] = useState<
        | { kind: 'segment'; index: number }
        | { kind: 'trim-start' }
        | { kind: 'trim-end' }
        | null
    >(null);
    const [dragTooltip, setDragTooltip] = useState<{ time: number; leftPx: number } | null>(null);

    const handleWaveformClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        if (!duration || !containerRef.current) {
            return;
        }

        const segments = entry?.editorSession.segments ?? [];
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
        const activeTrim = entry?.editorSession.trimRange ?? { start: 0, end: duration };
        if (clickTime < activeTrim.start || clickTime > activeTrim.end) {
            return;
        }

        const clickedSegmentIndex = segments.findIndex((segment) => clickTime >= segment.start && clickTime <= segment.end);
        if (clickedSegmentIndex === -1) {
            return;
        }

        const segment = segments[clickedSegmentIndex];
        const newSegments = [...segments];

        if (currentTool === 'split') {
            const leftSegment: AudioSegment = { ...segment, end: clickTime };
            const rightSegment: AudioSegment = {
                id: crypto.randomUUID(),
                start: clickTime,
                end: segment.end,
                included: segment.included,
            };
            newSegments.splice(clickedSegmentIndex, 1, leftSegment, rightSegment);
            updateEditorSession(assetId, (editor) => ({ ...editor, segments: newSegments }));
            return;
        }

        if (currentTool === 'include') {
            newSegments[clickedSegmentIndex] = { ...segment, included: true };
            updateEditorSession(assetId, (editor) => ({ ...editor, segments: newSegments }));
            return;
        }

        newSegments[clickedSegmentIndex] = { ...segment, included: false };
        updateEditorSession(assetId, (editor) => ({ ...editor, segments: newSegments }));
    }, [assetId, containerRef, currentTool, duration, entry, getTimelineMetrics, updateEditorSession]);

    const handleContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        event.preventDefault();
        const segments = entry?.editorSession.segments ?? [];
        if (segments.length <= 1 || !containerRef.current) {
            return;
        }

        const rect = containerRef.current.getBoundingClientRect();
        const { scrollLeft, totalWidth } = getTimelineMetrics();
        if (totalWidth <= 0) {
            return;
        }

        const xPos = event.clientX - rect.left + scrollLeft;
        const clickTime = (xPos / totalWidth) * duration;
        const activeTrim = entry?.editorSession.trimRange ?? { start: 0, end: duration };
        if (clickTime < activeTrim.start || clickTime > activeTrim.end) {
            return;
        }

        const timeThreshold = (15 / totalWidth) * duration;
        let closestIndex = -1;
        let minDiff = Infinity;

        for (let index = 0; index < segments.length - 1; index += 1) {
            const diff = Math.abs(segments[index].end - clickTime);
            if (diff < minDiff && diff < timeThreshold) {
                minDiff = diff;
                closestIndex = index;
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
        updateEditorSession(assetId, (editor) => ({ ...editor, segments: newSegments }));
    }, [assetId, containerRef, duration, entry, getTimelineMetrics, updateEditorSession]);

    const handleMouseMoveOverlay = useCallback((event: MouseEvent) => {
        const segments = entry?.editorSession.segments ?? [];
        if (!draggingBoundary || !duration || segments.length === 0 || !containerRef.current) {
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
            updateEditorSession(assetId, (editor) => ({ ...editor, segments: newSegments }));
            return;
        }

        const existingTrim = entry?.editorSession.trimRange ?? { start: 0, end: duration };
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
        updateEditorSession(assetId, (editor) => ({ ...editor, trimRange: nextTrim }));
    }, [assetId, containerRef, draggingBoundary, duration, entry, getTimelineMetrics, updateEditorSession]);

    const handleMouseUpOverlay = useCallback(() => {
        setDraggingBoundary(null);
        setDragTooltip(null);
    }, []);

    useEffect(() => {
        setDraggingBoundary(null);
        setDragTooltip(null);
    }, [assetId]);

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