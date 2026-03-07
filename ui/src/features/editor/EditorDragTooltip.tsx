import { AnimatePresence, motion } from 'framer-motion';
import { formatTime } from './utils.ts';

interface EditorDragTooltipProps {
    dragTooltip: { time: number; leftPx: number } | null;
    isVisible: boolean;
    scrollOffset: number;
}

export function EditorDragTooltip({ dragTooltip, isVisible, scrollOffset }: EditorDragTooltipProps) {
    return (
        <div className="absolute inset-0 pointer-events-none z-[60]">
            <AnimatePresence>
                {dragTooltip && isVisible && (
                    <motion.div
                        className="absolute pointer-events-none z-[100]"
                        style={{
                            top: '0px',
                            left: `${dragTooltip.leftPx - scrollOffset}px`,
                        }}
                        initial={{ opacity: 0, y: -10, x: '-50%', scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, x: '-50%', scale: 1 }}
                        exit={{ opacity: 0, y: -10, x: '-50%', scale: 0.9 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    >
                        <div className="rounded-xl border border-white/20 bg-background-base/95 px-3 py-1.5 text-[11px] font-mono font-bold tracking-wider text-primary shadow-[0_15px_30px_rgba(0,0,0,0.8)] backdrop-blur-2xl max-w-full min-w-0">
                            {formatTime(dragTooltip.time)}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}