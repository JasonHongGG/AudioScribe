import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';


const DEFAULT_HEIGHT = 320;
const MIN_HEIGHT = 176;
const CLOSE_THRESHOLD = 56;
const VIEWPORT_MARGIN = 180;
const MAX_VIEWPORT_RATIO = 0.72;


function clampHeight(height: number): number {
    const maxHeight = Math.max(MIN_HEIGHT, Math.min(window.innerHeight * MAX_VIEWPORT_RATIO, window.innerHeight - VIEWPORT_MARGIN));
    return Math.max(0, Math.min(height, maxHeight));
}


interface UseTranscriptPanelStateOptions {
    resetKey: string;
}


export function useTranscriptPanelState({ resetKey }: UseTranscriptPanelStateOptions) {
    const [isOpen, setIsOpen] = useState(false);
    const [height, setHeight] = useState(DEFAULT_HEIGHT);
    const [isResizing, setIsResizing] = useState(false);
    const heightRef = useRef(height);

    useEffect(() => {
        heightRef.current = height;
    }, [height]);

    const resetPanel = useCallback(() => {
        setIsOpen(false);
        setIsResizing(false);
        setHeight(DEFAULT_HEIGHT);
    }, []);

    useEffect(() => {
        resetPanel();
    }, [resetKey, resetPanel]);

    const closePanel = useCallback(() => {
        resetPanel();
    }, [resetPanel]);

    const openPanel = useCallback(() => {
        setHeight((current) => {
            const nextHeight = current <= CLOSE_THRESHOLD ? DEFAULT_HEIGHT : current;
            return clampHeight(nextHeight);
        });
        setIsOpen(true);
    }, []);

    const togglePanel = useCallback(() => {
        setIsOpen((current) => {
            const nextIsOpen = !current;
            if (nextIsOpen) {
                setHeight((existingHeight) => clampHeight(existingHeight <= CLOSE_THRESHOLD ? DEFAULT_HEIGHT : existingHeight));
            } else {
                setIsResizing(false);
                setHeight(DEFAULT_HEIGHT);
            }
            return nextIsOpen;
        });
    }, []);

    const startResize = useCallback((event: ReactPointerEvent<HTMLElement>) => {
        if (!isOpen) {
            return;
        }

        event.preventDefault();
        const pointerId = event.pointerId;
        const startY = event.clientY;
        const startHeight = heightRef.current;

        setIsResizing(true);

        const handlePointerMove = (moveEvent: PointerEvent) => {
            const delta = startY - moveEvent.clientY;
            const nextHeight = clampHeight(startHeight + delta);
            setHeight(nextHeight);
        };

        const handlePointerUp = () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            window.removeEventListener('pointercancel', handlePointerUp);
            setIsResizing(false);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';

            if (heightRef.current <= CLOSE_THRESHOLD) {
                resetPanel();
                return;
            }

            setHeight((current) => Math.max(MIN_HEIGHT, clampHeight(current)));
        };

        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', handlePointerUp);

        const target = event.currentTarget;
        if (target.hasPointerCapture(pointerId)) {
            target.releasePointerCapture(pointerId);
        }
    }, [isOpen, resetPanel]);

    return {
        isOpen,
        height,
        isResizing,
        openPanel,
        closePanel,
        togglePanel,
        startResize,
    };
}