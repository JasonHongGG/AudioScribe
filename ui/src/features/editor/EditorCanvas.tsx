import { motion } from 'framer-motion';
import type { FileTask } from '../tasks/types';
import type { useSegmentEditor } from './useSegmentEditor';
import type { useWaveSurferController } from './useWaveSurferController';
import { EditorDragTooltip } from './EditorDragTooltip';
import { EditorTimeline } from './EditorTimeline';
import { EditorWaveformOverlay } from './EditorWaveformOverlay';

interface EditorCanvasProps {
    task: FileTask;
    controller: ReturnType<typeof useWaveSurferController>;
    segmentEditor: ReturnType<typeof useSegmentEditor>;
}

export function EditorCanvas({ task, controller, segmentEditor }: EditorCanvasProps) {
    const timelineMetrics = controller.getTimelineMetrics();
    const activeTrim = task.editor.trimRange ?? { start: 0, end: controller.duration };
    const visibleSegments = task.editor.segments
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

                    <div
                        className="w-full flex-1 cursor-crosshair relative overflow-hidden flex items-center"
                        onClick={segmentEditor.handleWaveformClick}
                        onContextMenu={segmentEditor.handleContextMenu}
                    >
                        <div ref={controller.containerRef} className="w-full" />
                        {task.editor.segments.length > 0 && controller.duration > 0 && controller.wavesurferRef.current && controller.wavesurferRef.current.getWrapper() && (
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

                <EditorDragTooltip
                    dragTooltip={segmentEditor.dragTooltip}
                    isVisible={segmentEditor.draggingBoundary !== null}
                    scrollOffset={controller.scrollOffset}
                />
            </div>
        </motion.div>
    );
}