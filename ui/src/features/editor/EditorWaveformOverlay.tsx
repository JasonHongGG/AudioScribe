import { motion } from 'framer-motion';
import type { AudioSegment, TrimRange } from '../tasks/types';

type DragBoundary =
    | { kind: 'segment'; index: number }
    | { kind: 'trim-start' }
    | { kind: 'trim-end' };

interface VisibleSegment {
    segment: AudioSegment;
    originalIndex: number;
}

interface EditorWaveformOverlayProps {
    duration: number;
    scrollOffset: number;
    viewportWidth: number;
    totalWidth: number;
    trimRange: TrimRange;
    visibleSegments: VisibleSegment[];
    onStartDrag: (boundary: DragBoundary, time: number, leftPx: number) => void;
}

export function EditorWaveformOverlay({
    duration,
    scrollOffset,
    viewportWidth,
    totalWidth,
    trimRange,
    visibleSegments,
    onStartDrag,
}: EditorWaveformOverlayProps) {
    const trimStartRawPx = (trimRange.start / duration) * totalWidth;
    const trimEndRawPx = (trimRange.end / duration) * totalWidth;
    const trimStartPx = trimStartRawPx - scrollOffset;
    const trimEndPx = trimEndRawPx - scrollOffset;

    return (
        <div className="absolute inset-0 z-30 pointer-events-none">
            <div
                className="absolute top-0 bottom-0 pointer-events-none bg-background-base/80 backdrop-blur-[6px]"
                style={{ left: 0, width: `${Math.max(0, trimStartPx)}px` }}
            />
            <div
                className="absolute top-0 bottom-0 pointer-events-none bg-background-base/80 backdrop-blur-[6px]"
                style={{ left: `${trimEndPx}px`, width: `${Math.max(0, viewportWidth - trimEndPx)}px` }}
            />

            <div
                className="absolute top-0 bottom-0 z-30 flex items-center justify-center cursor-col-resize pointer-events-auto group/handle"
                style={{ left: `${trimStartPx}px`, transform: 'translateX(-50%)', width: '24px' }}
                onMouseDown={(event) => {
                    event.stopPropagation();
                    event.preventDefault();
                    onStartDrag({ kind: 'trim-start' }, trimRange.start, trimStartRawPx);
                }}
                onClick={(event) => event.stopPropagation()}
            >
                <motion.div
                    className="w-[3px] h-[90%] bg-primary rounded-full shadow-[0_0_15px_rgba(250,204,21,0.6)] relative flex items-center justify-center"
                    whileHover={{ width: 6, backgroundColor: '#facc15', height: '95%', boxShadow: '0 0 25px rgba(250,204,21,0.9)' }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                >
                    <div className="flex flex-col gap-[2px] opacity-0 group-hover/handle:opacity-100 transition-opacity duration-300">
                        <div className="w-[2px] h-[3px] bg-black/60 rounded-full" />
                        <div className="w-[2px] h-[3px] bg-black/60 rounded-full" />
                        <div className="w-[2px] h-[3px] bg-black/60 rounded-full" />
                    </div>
                </motion.div>
            </div>

            <div
                className="absolute top-0 bottom-0 z-30 flex items-center justify-center cursor-col-resize pointer-events-auto group/handle"
                style={{ left: `${trimEndPx}px`, transform: 'translateX(-50%)', width: '24px' }}
                onMouseDown={(event) => {
                    event.stopPropagation();
                    event.preventDefault();
                    onStartDrag({ kind: 'trim-end' }, trimRange.end, trimEndRawPx);
                }}
                onClick={(event) => event.stopPropagation()}
            >
                <motion.div
                    className="w-[3px] h-[90%] bg-primary rounded-full shadow-[0_0_15px_rgba(250,204,21,0.6)] relative flex items-center justify-center"
                    whileHover={{ width: 6, backgroundColor: '#facc15', height: '95%', boxShadow: '0 0 25px rgba(250,204,21,0.9)' }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                >
                    <div className="flex flex-col gap-[2px] opacity-0 group-hover/handle:opacity-100 transition-opacity duration-300">
                        <div className="w-[2px] h-[3px] bg-black/60 rounded-full" />
                        <div className="w-[2px] h-[3px] bg-black/60 rounded-full" />
                        <div className="w-[2px] h-[3px] bg-black/60 rounded-full" />
                    </div>
                </motion.div>
            </div>

            {visibleSegments.map(({ segment, originalIndex }, index) => {
                const renderStart = Math.max(segment.start, trimRange.start);
                const renderEnd = Math.min(segment.end, trimRange.end);
                const leftPx = (renderStart / duration) * totalWidth - scrollOffset;
                const widthPx = ((renderEnd - renderStart) / duration) * totalWidth;
                const isFirst = index === 0;
                const isLast = index === visibleSegments.length - 1;

                return (
                    <div
                        key={segment.id}
                        className="absolute top-0 bottom-0 pointer-events-auto group/seg transition-colors duration-300"
                        style={{
                            left: `${leftPx}px`,
                            width: `${widthPx}px`,
                            backgroundColor: segment.included ? 'transparent' : 'rgba(15, 15, 19, 0.75)',
                            backdropFilter: segment.included ? 'none' : 'blur(8px)',
                        }}
                    >
                        <div className="absolute inset-0 border-[1.5px] border-white/0 group-hover/seg:border-white/10 transition-colors duration-300 pointer-events-none rounded-sm" />

                        {!isFirst && (
                            <div
                                className="absolute top-0 bottom-0 -left-[12px] w-[24px] z-20 flex items-center justify-center cursor-col-resize pointer-events-auto group/split"
                                onMouseDown={(event) => {
                                    event.stopPropagation();
                                    event.preventDefault();
                                    const boundaryTime = visibleSegments[index - 1].segment.end;
                                    const tooltipLeftPx = (boundaryTime / duration) * totalWidth;
                                    onStartDrag({ kind: 'segment', index: visibleSegments[index - 1].originalIndex }, boundaryTime, tooltipLeftPx);
                                }}
                                onClick={(event) => event.stopPropagation()}
                            >
                                <motion.div
                                    className="w-[2px] h-[80%] bg-white/40 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.2)]"
                                    whileHover={{ width: 5, backgroundColor: '#fff', height: '80%', boxShadow: '0 0 15px rgba(255,255,255,0.8)' }}
                                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                                />
                            </div>
                        )}

                        {!isLast && (
                            <div
                                className="absolute top-0 bottom-0 -right-[12px] w-[24px] z-20 flex items-center justify-center cursor-col-resize pointer-events-auto group/split"
                                onMouseDown={(event) => {
                                    event.stopPropagation();
                                    event.preventDefault();
                                    const boundaryTime = segment.end;
                                    const tooltipLeftPx = (boundaryTime / duration) * totalWidth;
                                    onStartDrag({ kind: 'segment', index: originalIndex }, boundaryTime, tooltipLeftPx);
                                }}
                                onClick={(event) => event.stopPropagation()}
                            >
                                <motion.div
                                    className="w-[2px] h-[80%] bg-white/40 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.2)]"
                                    whileHover={{ width: 5, backgroundColor: '#fff', height: '80%', boxShadow: '0 0 15px rgba(255,255,255,0.8)' }}
                                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                                />
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}