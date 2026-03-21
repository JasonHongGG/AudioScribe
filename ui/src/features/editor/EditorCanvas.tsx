import { motion } from 'framer-motion';
import type { useSegmentEditor } from './useSegmentEditor';
import type { useWaveSurferController } from './useWaveSurferController';
import { EditorDragTooltip } from './EditorDragTooltip';
import { EditorTimeline } from './EditorTimeline';
import { EditorWaveformOverlay } from './EditorWaveformOverlay';
import type { WorkbenchEntry } from '../workbench/models';


interface EditorCanvasProps {
    entry: WorkbenchEntry;
    controller: ReturnType<typeof useWaveSurferController>;
    segmentEditor: ReturnType<typeof useSegmentEditor>;
}


export function EditorCanvas({ entry, controller, segmentEditor }: EditorCanvasProps) {
    const timelineMetrics = controller.getTimelineMetrics();
    const activeTrim = entry.editorSession.trimRange ?? { start: 0, end: controller.duration };
    const visibleSegments = entry.editorSession.segments
        .map((segment, originalIndex) => ({ segment, originalIndex }))
        .filter(({ segment }) => segment.end > activeTrim.start && segment.start < activeTrim.end);

    const startDrag = (
        boundary: { kind: 'segment'; index: number } | { kind: 'trim-start' } | { kind: 'trim-end' },
        time: number,
        leftPx: number,
    ) => {
        segmentEditor.setDraggingBoundary(boundary);
        segmentEditor.setDragTooltip({ time, leftPx });
    };

    return (
        <motion.div
            className="flex-1 relative flex flex-col w-full px-8 pb-48 pt-2 select-none min-h-0 min-w-0 z-0"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
        >
            <div className="w-full h-full relative">
                <div ref={controller.glassCardRef} className="absolute inset-0 rounded-[2.5rem] border border-white/[0.04] overflow-hidden glass-card group/canvas flex flex-col shadow-[0_20px_80px_rgba(0,0,0,0.8)] bg-gradient-to-b from-white/[0.02] to-transparent backdrop-blur-3xl">
                    <div className="absolute inset-0 rounded-[2.5rem] border border-white/[0.08] pointer-events-none mix-blend-overlay z-10" />

                    {controller.isWaveformLoading && (
                        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background-base/70 backdrop-blur-md pointer-events-none">
                            <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-black/30 px-6 py-5 shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
                                <div className="text-[11px] font-mono uppercase tracking-[0.28em] text-foreground-muted">Loading waveform</div>
                                <div className="h-1.5 w-52 overflow-hidden rounded-full bg-white/10">
                                    <div className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out" style={{ width: `${Math.max(8, controller.waveformLoadProgress ?? 18)}%` }} />
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="w-full flex-1 cursor-crosshair relative overflow-hidden flex items-center" onClick={segmentEditor.handleWaveformClick} onContextMenu={segmentEditor.handleContextMenu}>
                        <div ref={controller.containerRef} className="w-full" />
                        {entry.editorSession.segments.length > 0 && controller.duration > 0 && controller.wavesurferRef.current && controller.wavesurferRef.current.getWrapper() && (
                            <EditorWaveformOverlay
                                duration={controller.duration}
                                scrollOffset={controller.scrollOffset}
                                viewportWidth={timelineMetrics.viewportWidth}
                                totalWidth={timelineMetrics.totalWidth}
                                trimRange={activeTrim}
                                visibleSegments={visibleSegments}
                                onStartDrag={startDrag}
                            />
                        )}
                    </div>

                    <EditorTimeline
                        duration={controller.duration}
                        scrollOffset={controller.scrollOffset}
                        viewportWidth={timelineMetrics.viewportWidth}
                        totalWidth={timelineMetrics.totalWidth}
                    />
                </div>

                <EditorDragTooltip dragTooltip={segmentEditor.dragTooltip} isVisible={segmentEditor.draggingBoundary !== null} scrollOffset={controller.scrollOffset} />
            </div>
        </motion.div>
    );
}