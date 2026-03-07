import { motion } from 'framer-motion';
import { useStore } from '../../store';
import { PlayerDock } from '../../features/editor/PlayerDock';
import { EditorCanvas } from '../../features/editor/EditorCanvas';
import { EditorHeader } from '../../features/editor/EditorHeader';
import { useActiveToolRef } from '../../features/editor/useActiveToolRef';
import { useWaveSurferController } from '../../features/editor/useWaveSurferController';
import { useSegmentEditor } from '../../features/editor/useSegmentEditor';

export function FileEditor({ taskId }: { taskId: string }) {
    const task = useStore((state) => state.tasks.find((item) => item.id === taskId));
    const updateTask = useStore((state) => state.updateTask);
    const activeTool = useStore((state) => state.activeToolRef);
    const setActiveTool = useStore((state) => state.setActiveTool);

    const currentToolRef = useActiveToolRef();
    const controller = useWaveSurferController(task, updateTask);
    const segmentEditor = useSegmentEditor({
        task,
        taskId,
        duration: controller.duration,
        currentToolRef,
        containerRef: controller.containerRef,
        wavesurferRef: controller.wavesurferRef,
        getTimelineMetrics: controller.getTimelineMetrics,
        updateTask,
    });

    if (!task) {
        return null;
    }

    return (
        <motion.div
            className="flex-1 flex flex-col h-full relative min-w-0 min-h-0 bg-transparent"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
        >
            <EditorHeader title={task.name} activeTool={activeTool} onSelectTool={setActiveTool} />
            <EditorCanvas task={task} controller={controller} segmentEditor={segmentEditor} />

            <PlayerDock
                currentTime={controller.currentTime}
                duration={controller.duration}
                volume={controller.volume}
                isPlaying={controller.isPlaying}
                onSeek={controller.seekTo}
                onTogglePlay={controller.togglePlay}
                onSkip={controller.skipBy}
                onVolumeChange={controller.setVolume}
            />
        </motion.div>
    );
}
