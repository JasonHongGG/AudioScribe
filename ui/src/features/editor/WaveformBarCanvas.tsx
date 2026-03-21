import { useEffect, useMemo, useRef } from 'react';
import type { TrimRange, WaveformBarView } from '../workbench/models';


interface WaveformBarCanvasProps {
    bars: WaveformBarView[];
    duration: number;
    viewportWidth: number;
    viewportHeight: number;
    scrollOffset: number;
    totalWidth: number;
    trimRange: TrimRange;
    currentTime: number;
}


export function WaveformBarCanvas({
    bars,
    duration,
    viewportWidth,
    viewportHeight,
    scrollOffset,
    totalWidth,
    trimRange,
    currentTime,
}: WaveformBarCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const devicePixelRatio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
    const pxPerSecond = duration > 0 ? totalWidth / duration : 0;
    const visibleRange = useMemo(() => {
        if (pxPerSecond <= 0) {
            return { start: 0, end: 0 };
        }
        return {
            start: scrollOffset / pxPerSecond,
            end: (scrollOffset + viewportWidth) / pxPerSecond,
        };
    }, [pxPerSecond, scrollOffset, viewportWidth]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || viewportWidth <= 0 || viewportHeight <= 0) {
            return;
        }

        canvas.width = Math.floor(viewportWidth * devicePixelRatio);
        canvas.height = Math.floor(viewportHeight * devicePixelRatio);
        canvas.style.width = `${viewportWidth}px`;
        canvas.style.height = `${viewportHeight}px`;

        const context = canvas.getContext('2d');
        if (!context) {
            return;
        }

        context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
        context.clearRect(0, 0, viewportWidth, viewportHeight);

        const centerY = viewportHeight / 2;
        const maxBarHeight = Math.max(12, viewportHeight * 0.36);
        const trimStartX = pxPerSecond * trimRange.start - scrollOffset;
        const trimEndX = pxPerSecond * trimRange.end - scrollOffset;

        const gradient = context.createLinearGradient(0, 0, 0, viewportHeight);
        gradient.addColorStop(0, 'rgba(245, 197, 66, 0.9)');
        gradient.addColorStop(1, 'rgba(245, 197, 66, 0.35)');

        context.fillStyle = 'rgba(255,255,255,0.06)';
        context.fillRect(0, centerY - 0.5, viewportWidth, 1);

        for (const bar of bars) {
            if (bar.endTime < visibleRange.start || bar.startTime > visibleRange.end) {
                continue;
            }

            const startX = bar.startTime * pxPerSecond - scrollOffset;
            const endX = bar.endTime * pxPerSecond - scrollOffset;
            const width = Math.max(1.5, endX - startX - 0.8);
            const height = Math.max(4, bar.amplitude * maxBarHeight);
            const x = startX + 0.4;
            const y = centerY - height / 2;
            const isInsideTrim = endX >= trimStartX && startX <= trimEndX;

            context.fillStyle = isInsideTrim ? gradient : 'rgba(120, 120, 125, 0.45)';
            context.fillRect(x, y, width, height);
        }

        const playheadX = currentTime * pxPerSecond - scrollOffset;
        if (playheadX >= 0 && playheadX <= viewportWidth) {
            context.fillStyle = 'rgba(250, 204, 21, 1)';
            context.fillRect(playheadX - 1, 0, 2, viewportHeight);
        }
    }, [bars, currentTime, devicePixelRatio, pxPerSecond, scrollOffset, trimRange.end, trimRange.start, viewportHeight, viewportWidth, visibleRange.end, visibleRange.start]);

    return <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-10" />;
}