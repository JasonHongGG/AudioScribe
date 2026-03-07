import { formatTime, pickTimelineStep } from './utils.ts';

interface EditorTimelineProps {
    duration: number;
    scrollOffset: number;
    viewportWidth: number;
    totalWidth: number;
}

export function EditorTimeline({ duration, scrollOffset, viewportWidth, totalWidth }: EditorTimelineProps) {
    if (!duration || totalWidth <= 0 || viewportWidth <= 0) {
        return null;
    }

    const pxPerSec = totalWidth / duration;
    const stepSec = pickTimelineStep(pxPerSec);
    const visibleStart = (scrollOffset / totalWidth) * duration;
    const visibleEnd = ((scrollOffset + viewportWidth) / totalWidth) * duration;
    const startTick = Math.floor(visibleStart / stepSec) * stepSec;
    const ticks: number[] = [];

    for (let tick = startTick; tick <= visibleEnd + stepSec; tick += stepSec) {
        if (tick >= 0 && tick <= duration) {
            ticks.push(tick);
        }
    }

    return (
        <div className="timeline-container w-full h-10 absolute bottom-0 left-0 bg-background-base/50 backdrop-blur-2xl border-t border-white/[0.04] cursor-ew-resize overflow-hidden z-40">
            {ticks.map((tick) => {
                const x = (tick / duration) * totalWidth - scrollOffset;
                return (
                    <div
                        key={tick}
                        className="absolute bottom-0 h-full flex flex-col items-center justify-end pb-1.5"
                        style={{ left: `${x}px`, transform: 'translateX(-50%)' }}
                    >
                        <div className="w-px h-2.5 bg-white/30" />
                        <div className="text-[10px] uppercase font-mono tracking-widest leading-none text-foreground-muted/70 mt-1.5 whitespace-nowrap">
                            {stepSec >= 1 ? formatTime(tick).split('.')[0] : formatTime(tick)}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}