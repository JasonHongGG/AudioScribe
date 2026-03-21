import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { PlayerDock } from '../../features/editor/PlayerDock';
import { EditorCanvas } from '../../features/editor/EditorCanvas';
import { EditorHeader } from '../../features/editor/EditorHeader';
import { TranscriptResultPanel } from '../../features/results/TranscriptResultPanel';
import { useTranscriptPanelState } from '../../features/results/useTranscriptPanelState';
import { useEditorPlaybackController } from '../../features/editor/useEditorPlaybackController';
import { useSegmentEditor } from '../../features/editor/useSegmentEditor';
import { useToolStore } from '../../features/workbench/toolStore';
import { useWorkbenchStore } from '../../features/workbench/workbenchStore';


export function FileEditor({ assetId }: { assetId: string }) {
    const asset = useWorkbenchStore((state) => state.assetsById[assetId]);
    const editorSession = useWorkbenchStore((state) => state.editorsByAssetId[assetId]);
    const draft = useWorkbenchStore((state) => state.draftsByAssetId[assetId]);
    const latestRun = useWorkbenchStore((state) => state.runsByAssetId[assetId] ?? null);
    const updateEditorSession = useWorkbenchStore((state) => state.updateEditorSession);
    const activeTool = useToolStore((state) => state.activeTool);
    const setActiveTool = useToolStore((state) => state.setActiveTool);

    const entry = useMemo(() => {
        if (!asset || !editorSession || !draft) {
            return null;
        }
        return {
            asset,
            editorSession,
            draft,
            latestRun,
        };
    }, [asset, editorSession, draft, latestRun]);
    const resolvedEntry = entry ?? undefined;

    const transcriptPanel = useTranscriptPanelState({ resetKey: assetId });
    const controller = useEditorPlaybackController(resolvedEntry, updateEditorSession);
    const segmentEditor = useSegmentEditor({
        entry: resolvedEntry,
        assetId,
        duration: controller.duration,
        currentTool: activeTool,
        containerRef: controller.containerRef,
        getTimelineMetrics: controller.getTimelineMetrics,
        updateEditorSession,
    });

    if (!entry) {
        return null;
    }

    const transcriptState = entry.latestRun?.status === 'completed' && entry.latestRun.artifact
        ? 'ready'
        : entry.latestRun?.status === 'failed' || entry.latestRun?.status === 'cancelled'
            ? 'failed'
            : 'idle';

    return (
        <motion.div
            className="flex-1 flex flex-col h-full relative min-w-0 min-h-0 bg-transparent"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
        >
            <EditorHeader title={entry.asset.name} activeTool={activeTool} onSelectTool={setActiveTool} />

            <EditorCanvas entry={entry} controller={controller} segmentEditor={segmentEditor} />

            <TranscriptResultPanel
                entry={entry}
                isOpen={transcriptPanel.isOpen}
                height={transcriptPanel.height}
                currentTime={controller.currentTime}
                onSeekToTime={controller.seekTo}
                onClose={transcriptPanel.closePanel}
                onResizeStart={transcriptPanel.startResize}
            />

            <PlayerDock
                currentTime={controller.currentTime}
                duration={controller.duration}
                volume={controller.volume}
                playbackRate={controller.playbackRate}
                isPlaying={controller.isPlaying}
                onSeek={controller.seekTo}
                onTogglePlay={controller.togglePlay}
                onSkip={controller.skipBy}
                onVolumeChange={controller.setVolume}
                onPlaybackRateChange={controller.setPlaybackRate}
                transcriptState={transcriptState}
                isTranscriptPanelOpen={transcriptPanel.isOpen}
                onToggleTranscriptPanel={transcriptPanel.togglePanel}
            />
        </motion.div>
    );
}