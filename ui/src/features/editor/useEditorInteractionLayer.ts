import { useEffect, useRef } from 'react';


interface EditorInteractionLayerOptions {
    duration: number;
    panBy: (delta: number) => void;
    stepZoomAtClientX: (clientX: number, direction: -1 | 1) => boolean;
    togglePlay: () => void;
    skipBy: (seconds: number) => void;
}


export function useEditorInteractionLayer({
    duration,
    panBy,
    stepZoomAtClientX,
    togglePlay,
    skipBy,
}: EditorInteractionLayerOptions) {
    const waveformInteractionRef = useRef<HTMLDivElement>(null);
    const timelineInteractionRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const timelineElement = timelineInteractionRef.current;
        if (!timelineElement) {
            return;
        }

        const handleTimelineWheel = (event: WheelEvent) => {
            event.preventDefault();
            if (!duration) {
                return;
            }

            const zoomDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
            if (Math.abs(zoomDelta) < 0.01) {
                return;
            }

            stepZoomAtClientX(event.clientX, zoomDelta < 0 ? 1 : -1);
        };

        timelineElement.addEventListener('wheel', handleTimelineWheel, { passive: false });
        return () => timelineElement.removeEventListener('wheel', handleTimelineWheel);
    }, [duration, stepZoomAtClientX]);

    useEffect(() => {
        const waveformElement = waveformInteractionRef.current;
        if (!waveformElement) {
            return;
        }

        const handleWaveformWheel = (event: WheelEvent) => {
            event.preventDefault();
            if (!duration) {
                return;
            }

            const panDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
            if (Math.abs(panDelta) < 0.01) {
                return;
            }

            panBy(panDelta);
        };

        waveformElement.addEventListener('wheel', handleWaveformWheel, { passive: false });
        return () => waveformElement.removeEventListener('wheel', handleWaveformWheel);
    }, [duration, panBy]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) {
                return;
            }

            switch (event.key) {
                case ' ':
                    event.preventDefault();
                    togglePlay();
                    break;
                case 'ArrowLeft':
                    event.preventDefault();
                    skipBy(-5);
                    break;
                case 'ArrowRight':
                    event.preventDefault();
                    skipBy(5);
                    break;
                default:
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [skipBy, togglePlay]);

    return {
        waveformInteractionRef,
        timelineInteractionRef,
    };
}