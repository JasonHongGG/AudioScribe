import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';


const ZOOM_LADDER = [1, 1.125, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32] as const;

interface PendingZoomAnchor {
    anchorTime: number;
    pointerX: number;
}


export function useEditorViewportModel(duration: number) {
    const containerRef = useRef<HTMLDivElement>(null);

    const [scrollOffset, setScrollOffset] = useState(0);
    const [viewportWidth, setViewportWidth] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(0);
    const [zoomStepIndex, setZoomStepIndex] = useState(0);
    const pendingZoomAnchorRef = useRef<PendingZoomAnchor | null>(null);

    useEffect(() => {
        const element = containerRef.current;
        if (!element) {
            return;
        }

        const observer = new ResizeObserver(() => {
            setViewportWidth(element.clientWidth);
            setViewportHeight(element.clientHeight);
        });
        observer.observe(element);
        setViewportWidth(element.clientWidth);
        setViewportHeight(element.clientHeight);
        return () => observer.disconnect();
    }, []);

    const fitPxPerSecond = useMemo(() => {
        if (!duration || !viewportWidth) {
            return 0;
        }
        return viewportWidth / duration;
    }, [duration, viewportWidth]);

    const pxPerSecond = fitPxPerSecond > 0 ? fitPxPerSecond * ZOOM_LADDER[zoomStepIndex] : 0;
    const totalWidth = duration > 0 && pxPerSecond > 0 ? Math.max(viewportWidth, duration * pxPerSecond) : viewportWidth;

    const visibleRange = useMemo(() => {
        if (pxPerSecond <= 0) {
            return { start: 0, end: 0 };
        }
        return {
            start: scrollOffset / pxPerSecond,
            end: (scrollOffset + viewportWidth) / pxPerSecond,
        };
    }, [pxPerSecond, scrollOffset, viewportWidth]);

    const writeScrollOffset = useCallback((nextScroll: number, maxScrollOverride?: number) => {
        const element = containerRef.current;
        if (!element) {
            return;
        }

        const maxScroll = maxScrollOverride ?? Math.max(0, totalWidth - element.clientWidth);
        const resolvedScroll = Math.max(0, Math.min(maxScroll, nextScroll));
        element.scrollLeft = resolvedScroll;
        setScrollOffset(resolvedScroll);
    }, [totalWidth]);

    useLayoutEffect(() => {
        const pendingAnchor = pendingZoomAnchorRef.current;
        if (!pendingAnchor || !duration || pxPerSecond <= 0 || viewportWidth <= 0) {
            return;
        }

        const maxScroll = Math.max(0, totalWidth - viewportWidth);
        const nextScroll = (pendingAnchor.anchorTime * pxPerSecond) - pendingAnchor.pointerX;
        writeScrollOffset(nextScroll, maxScroll);
        pendingZoomAnchorRef.current = null;
    }, [duration, pxPerSecond, totalWidth, viewportWidth, writeScrollOffset]);

    const handleViewportScroll = useCallback(() => {
        const element = containerRef.current;
        if (!element) {
            return;
        }
        setScrollOffset(element.scrollLeft);
    }, []);

    const syncScrollOffset = useCallback((nextScroll: number) => {
        writeScrollOffset(nextScroll);
    }, [writeScrollOffset]);

    const panBy = useCallback((delta: number) => {
        const element = containerRef.current;
        if (!element) {
            return;
        }
        writeScrollOffset(element.scrollLeft + delta);
    }, [writeScrollOffset]);

    const applyZoomAtClientX = useCallback((clientX: number, nextZoomStepIndex: number) => {
        const element = containerRef.current;
        if (!element || !duration || fitPxPerSecond <= 0 || pxPerSecond <= 0) {
            return false;
        }

        const clampedZoomStepIndex = Math.max(0, Math.min(ZOOM_LADDER.length - 1, nextZoomStepIndex));
        if (clampedZoomStepIndex === zoomStepIndex) {
            return false;
        }

        const rect = element.getBoundingClientRect();
        const pointerX = Math.max(0, Math.min(rect.width, clientX - rect.left));
        const anchorTime = (element.scrollLeft + pointerX) / pxPerSecond;

        pendingZoomAnchorRef.current = { anchorTime, pointerX };
        setZoomStepIndex(clampedZoomStepIndex);
        return true;
    }, [duration, pxPerSecond, zoomStepIndex]);

    const stepZoomAtClientX = useCallback((clientX: number, direction: -1 | 1) => {
        return applyZoomAtClientX(clientX, zoomStepIndex + direction);
    }, [applyZoomAtClientX, zoomStepIndex]);

    const getTimelineMetrics = useCallback(() => ({
        viewportWidth,
        scrollLeft: scrollOffset,
        totalWidth,
    }), [scrollOffset, totalWidth, viewportWidth]);

    return {
        containerRef,
        scrollOffset,
        viewportWidth,
        viewportHeight,
        totalWidth,
        pxPerSecond,
        visibleRange,
        handleViewportScroll,
        syncScrollOffset,
        panBy,
        stepZoomAtClientX,
        getTimelineMetrics,
    };
}