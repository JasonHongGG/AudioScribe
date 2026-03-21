import type { WorkbenchEntry } from '../workbench/models';
import { useEditorInteractionLayer } from './useEditorInteractionLayer';
import { useEditorViewportModel } from './useEditorViewportModel';
import { usePlaybackService } from './usePlaybackService';
import { useWaveformQuery } from './useWaveformQuery';


type UpdateEditorSession = Parameters<typeof usePlaybackService>[1];


export function useEditorPlaybackController(entry: WorkbenchEntry | undefined, updateEditorSession: UpdateEditorSession) {
    const initialWaveformDuration = entry?.asset.media.waveform?.duration ?? null;
    const playback = usePlaybackService(entry, updateEditorSession, initialWaveformDuration);
    const viewport = useEditorViewportModel(playback.duration || initialWaveformDuration || 0);
    const waveform = useWaveformQuery(entry, viewport.visibleRange, viewport.pxPerSecond, playback.duration);
    const interactionLayer = useEditorInteractionLayer({
        duration: playback.duration || waveform.waveform?.duration || 0,
        panBy: viewport.panBy,
        stepZoomAtClientX: viewport.stepZoomAtClientX,
        togglePlay: playback.togglePlay,
        skipBy: playback.skipBy,
    });

    return {
        containerRef: viewport.containerRef,
        waveformInteractionRef: interactionLayer.waveformInteractionRef,
        timelineInteractionRef: interactionLayer.timelineInteractionRef,
        currentTime: playback.currentTime,
        duration: playback.duration || waveform.waveform?.duration || 0,
        volume: playback.volume,
        playbackRate: playback.playbackRate,
        isPlaying: playback.isPlaying,
        scrollOffset: viewport.scrollOffset,
        isWaveformLoading: waveform.isWaveformLoading,
        waveformLoadProgress: waveform.waveformLoadProgress,
        viewportWidth: viewport.viewportWidth,
        viewportHeight: viewport.viewportHeight,
        totalWidth: viewport.totalWidth,
        renderBars: waveform.renderBars,
        handleViewportScroll: viewport.handleViewportScroll,
        seekTo: playback.seekTo,
        togglePlay: playback.togglePlay,
        skipBy: playback.skipBy,
        setVolume: playback.setVolume,
        setPlaybackRate: playback.setPlaybackRate,
        getTimelineMetrics: viewport.getTimelineMetrics,
    };
}