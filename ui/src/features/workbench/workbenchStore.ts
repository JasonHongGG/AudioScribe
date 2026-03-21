import { create } from 'zustand';
import type { EditorSession, WorkbenchAsset, WorkbenchEntry, WorkflowDraft, WorkflowRunView } from './models';


type EditorUpdater = EditorSession | ((editor: EditorSession) => EditorSession);

type WorkbenchState = {
    order: string[];
    selectedAssetId: string | null;
    isBatchRunning: boolean;
    assetsById: Record<string, WorkbenchAsset>;
    editorsByAssetId: Record<string, EditorSession>;
    draftsByAssetId: Record<string, WorkflowDraft>;
    runsByAssetId: Record<string, WorkflowRunView | null>;
    registerImportedAsset: (payload: { asset: WorkbenchAsset; editorSession: EditorSession; draft: WorkflowDraft }) => void;
    removeAsset: (assetId: string) => void;
    resetAsset: (assetId: string) => void;
    selectAsset: (assetId: string | null) => void;
    updateEditorSession: (assetId: string, updater: EditorUpdater) => void;
    applyRunSnapshot: (assetId: string, snapshot: WorkflowRunView) => void;
    setBatchRunning: (value: boolean) => void;
};


function nextSelectedAsset(order: string[], removedAssetId: string, currentSelectedAssetId: string | null): string | null {
    if (currentSelectedAssetId !== removedAssetId) {
        return currentSelectedAssetId;
    }
    const nextOrder = order.filter((assetId) => assetId !== removedAssetId);
    return nextOrder[0] ?? null;
}


export function buildWorkbenchEntry(state: Pick<WorkbenchState, 'assetsById' | 'editorsByAssetId' | 'draftsByAssetId' | 'runsByAssetId'>, assetId: string): WorkbenchEntry | null {
    const asset = state.assetsById[assetId];
    const editorSession = state.editorsByAssetId[assetId];
    const draft = state.draftsByAssetId[assetId];
    if (!asset || !editorSession || !draft) {
        return null;
    }
    return {
        asset,
        editorSession,
        draft,
        latestRun: state.runsByAssetId[assetId] ?? null,
    };
}


export const useWorkbenchStore = create<WorkbenchState>((set) => ({
    order: [],
    selectedAssetId: null,
    isBatchRunning: false,
    assetsById: {},
    editorsByAssetId: {},
    draftsByAssetId: {},
    runsByAssetId: {},
    registerImportedAsset: ({ asset, editorSession, draft }) => set((state) => ({
        order: state.order.includes(asset.assetId) ? state.order : [...state.order, asset.assetId],
        selectedAssetId: state.selectedAssetId ?? asset.assetId,
        assetsById: { ...state.assetsById, [asset.assetId]: asset },
        editorsByAssetId: { ...state.editorsByAssetId, [asset.assetId]: editorSession },
        draftsByAssetId: { ...state.draftsByAssetId, [asset.assetId]: draft },
        runsByAssetId: { ...state.runsByAssetId, [asset.assetId]: null },
    })),
    removeAsset: (assetId) => set((state) => {
        const assetsById = { ...state.assetsById };
        const editorsByAssetId = { ...state.editorsByAssetId };
        const draftsByAssetId = { ...state.draftsByAssetId };
        const runsByAssetId = { ...state.runsByAssetId };
        delete assetsById[assetId];
        delete editorsByAssetId[assetId];
        delete draftsByAssetId[assetId];
        delete runsByAssetId[assetId];

        return {
            order: state.order.filter((id) => id !== assetId),
            selectedAssetId: nextSelectedAsset(state.order, assetId, state.selectedAssetId),
            assetsById,
            editorsByAssetId,
            draftsByAssetId,
            runsByAssetId,
        };
    }),
    resetAsset: (assetId) => set((state) => ({
        runsByAssetId: { ...state.runsByAssetId, [assetId]: null },
    })),
    selectAsset: (assetId) => set({ selectedAssetId: assetId }),
    updateEditorSession: (assetId, updater) => set((state) => {
        const current = state.editorsByAssetId[assetId];
        if (!current) {
            return state;
        }
        return {
            editorsByAssetId: {
                ...state.editorsByAssetId,
                [assetId]: typeof updater === 'function' ? updater(current) : updater,
            },
        };
    }),
    applyRunSnapshot: (assetId, snapshot) => set((state) => ({
        runsByAssetId: { ...state.runsByAssetId, [assetId]: snapshot },
    })),
    setBatchRunning: (value) => set({ isBatchRunning: value }),
}));