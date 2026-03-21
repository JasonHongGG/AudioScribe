import { useCallback } from 'react';
import type { AudioSegment, WorkbenchEntry, WorkflowRunView } from './models';
import { useWorkbenchStore, buildWorkbenchEntry } from './workbenchStore';
import { fetchWorkflowRun, startWorkflowRun } from '../../services/backendClient';
import type { StartWorkflowRunRequest, WorkflowRunSnapshotResponse } from '../backend/contracts';


const MAX_POLL_MS = 30 * 60 * 1000;


function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}


function getPollIntervalMs(elapsedMs: number): number {
    if (elapsedMs < 60_000) {
        return 3000;
    }
    return 5000;
}


function mapRunSnapshot(snapshot: WorkflowRunSnapshotResponse): WorkflowRunView {
    return {
        runId: snapshot.run_id,
        assetId: snapshot.asset_id,
        assetName: snapshot.asset_name,
        capability: snapshot.capability,
        status: snapshot.status,
        progress: snapshot.progress,
        createdAt: snapshot.created_at,
        updatedAt: snapshot.updated_at,
        errorMessage: snapshot.error_message ?? null,
        artifact: snapshot.artifact ? {
            artifactId: snapshot.artifact.artifact_id,
            kind: snapshot.artifact.kind,
            path: snapshot.artifact.path,
            createdAt: snapshot.artifact.created_at,
        } : null,
    };
}


function buildDraftRequest(entry: WorkbenchEntry): StartWorkflowRunRequest {
    return {
        asset_id: entry.asset.assetId,
        draft: {
            asset_id: entry.asset.assetId,
            selection: {
                trim_start: entry.editorSession.trimRange?.start ?? null,
                trim_end: entry.editorSession.trimRange?.end ?? null,
                segments: entry.editorSession.segments.map((segment: AudioSegment) => ({
                    start: segment.start,
                    end: segment.end,
                    included: segment.included,
                })),
            },
            profile: {
                capability: entry.draft.capability,
                provider_id: entry.draft.providerId,
                model_id: entry.draft.modelId,
            },
        },
    };
}


async function waitForWorkflowCompletion(runId: string, onSnapshot: (snapshot: WorkflowRunView) => void): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < MAX_POLL_MS) {
        const elapsedMs = Date.now() - startedAt;
        await sleep(getPollIntervalMs(elapsedMs));
        const snapshot = mapRunSnapshot(await fetchWorkflowRun(runId));
        onSnapshot(snapshot);
        if (snapshot.status === 'completed' || snapshot.status === 'failed' || snapshot.status === 'cancelled') {
            return;
        }
    }
    throw new Error('Workflow polling timed out.');
}


export function useWorkflowQueue() {
    const setBatchRunning = useWorkbenchStore((state) => state.setBatchRunning);
    const applyRunSnapshot = useWorkbenchStore((state) => state.applyRunSnapshot);

    return useCallback(async () => {
        const state = useWorkbenchStore.getState();
        if (state.isBatchRunning) {
            return;
        }

        setBatchRunning(true);
        try {
            const entries = state.order
                .map((assetId) => buildWorkbenchEntry(useWorkbenchStore.getState(), assetId))
                .filter((entry): entry is WorkbenchEntry => entry !== null)
                .filter((entry) => entry.latestRun === null);

            for (const entry of entries) {
                const accepted = await startWorkflowRun(buildDraftRequest(entry));
                const initialSnapshot = mapRunSnapshot(accepted.snapshot);
                applyRunSnapshot(entry.asset.assetId, initialSnapshot);
                await waitForWorkflowCompletion(initialSnapshot.runId, (snapshot) => {
                    applyRunSnapshot(entry.asset.assetId, snapshot);
                });
            }
        } finally {
            setBatchRunning(false);
        }
    }, [applyRunSnapshot, setBatchRunning]);
}