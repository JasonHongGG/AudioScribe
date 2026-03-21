import { useCallback } from 'react';
import type { AudioSegment, EditorSession, WorkbenchAsset, WorkflowDraft } from './models';
import { useWorkbenchStore } from './workbenchStore';
import { useSettingsStore } from './settingsStore';
import { importAsset as importAssetRequest } from '../../services/backendClient';
import { isSupportedMediaPath } from './fileSupport';


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
            waveform: response.prepared_media.waveform ? {
                duration: response.prepared_media.waveform.duration,
                peaks: response.prepared_media.waveform.peaks,
            } : null,
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