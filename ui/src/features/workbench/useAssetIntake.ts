import { useCallback } from 'react';
import type { AudioSegment, EditorSession, WaveformView, WorkbenchAsset, WorkflowDraft } from './models';
import { useWorkbenchStore } from './workbenchStore';
import { useSettingsStore } from './settingsStore';
import { importAsset as importAssetRequest } from '../../services/backendClient';
import { isSupportedMediaPath } from './fileSupport';


function mapWaveform(response: Awaited<ReturnType<typeof importAssetRequest>>['asset']['prepared_media']['waveform']): WaveformView | null {
    if (!response) {
        return null;
    }

    return {
        duration: response.duration,
        overviewBars: response.overview_bars.map((bar) => ({
            startTime: bar.start_time,
            endTime: bar.end_time,
            amplitude: bar.amplitude,
        })),
        levels: response.levels.map((level) => ({
            level: level.level,
            secondsPerBar: level.seconds_per_bar,
            barsPerTile: level.bars_per_tile,
            tileDuration: level.tile_duration,
        })),
    };
}


function mapImportedAsset(response: Awaited<ReturnType<typeof importAssetRequest>>['asset']): WorkbenchAsset {
    return {
        assetId: response.asset_id,
        name: response.source.name,
        importedAt: response.imported_at,
        source: {
            path: response.source.path,
            kind: response.source.kind,
        },
        media: {
            playbackPath: response.prepared_media.playback_path,
            extractionPath: response.prepared_media.extraction_path ?? null,
            waveform: mapWaveform(response.prepared_media.waveform),
        },
    };
}


function mapEditorSession(assetId: string, response: Awaited<ReturnType<typeof importAssetRequest>>['editor_session']): EditorSession {
    const segments: AudioSegment[] = response.segments.map((segment) => ({
        id: crypto.randomUUID(),
        start: segment.start,
        end: segment.end,
        included: segment.included,
    }));
    const trimRange = response.trim_start !== null && response.trim_end !== null
        ? { start: response.trim_start, end: response.trim_end }
        : null;
    return {
        assetId,
        trimRange,
        segments,
    };
}


function createDraft(assetId: string, providerId: WorkflowDraft['providerId'], modelId: string): WorkflowDraft {
    return {
        assetId,
        capability: 'transcription',
        providerId,
        modelId,
    };
}


export function useAssetIntake() {
    const registerImportedAsset = useWorkbenchStore((state) => state.registerImportedAsset);
    const globalProviderId = useSettingsStore((state) => state.globalProviderId);
    const globalModelId = useSettingsStore((state) => state.globalModelId);

    return useCallback(async (paths: string[]) => {
        const supportedPaths = paths.filter(isSupportedMediaPath);
        for (const path of supportedPaths) {
            const response = await importAssetRequest(path);
            const asset = mapImportedAsset(response.asset);
            const editorSession = mapEditorSession(asset.assetId, response.editor_session);
            const draft = createDraft(asset.assetId, globalProviderId, globalModelId);
            registerImportedAsset({ asset, editorSession, draft });
        }
    }, [globalModelId, globalProviderId, registerImportedAsset]);
}