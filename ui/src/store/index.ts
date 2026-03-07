import { create } from 'zustand';
import type { ActiveTool, FileTask, ProviderId } from '../features/tasks/types';
import { getDefaultModelId } from '../features/settings/providerCatalog';

export type { ActiveTool, AudioSegment, FileTask, ProviderId, TrimRange } from '../features/tasks/types';

type TaskUpdater = FileTask | ((task: FileTask) => FileTask);

type AppState = {
    tasks: FileTask[];
    globalProviderId: ProviderId;
    globalModelId: string;
    isGlobalSettingsOpen: boolean;
    selectedTaskId: string | null;
    activeToolRef: ActiveTool;

    // Actions
    addTask: (task: FileTask) => void;
    removeTask: (id: string) => void;
    resetTask: (id: string) => void;
    updateTask: (id: string, updater: TaskUpdater) => void;
    setGlobalProviderId: (providerId: ProviderId) => void;
    setGlobalModelId: (modelId: string) => void;
    setIsGlobalSettingsOpen: (isOpen: boolean) => void;
    selectTask: (id: string | null) => void;
    setActiveTool: (tool: ActiveTool) => void;
};

export const useStore = create<AppState>((set) => ({
    tasks: [],
    globalProviderId: 'faster-whisper',
    globalModelId: getDefaultModelId('faster-whisper'),
    isGlobalSettingsOpen: false,
    selectedTaskId: null,
    activeToolRef: 'split',

    addTask: (task) => set((state) => ({ tasks: [...state.tasks, task] })),

    removeTask: (id) => set((state) => ({
        tasks: state.tasks.filter(t => t.id !== id),
        selectedTaskId: state.selectedTaskId === id ? null : state.selectedTaskId
    })),

    resetTask: (id) => set((state) => ({
        tasks: state.tasks.map(t =>
            t.id === id
                ? {
                    ...t,
                    runtime: {
                        phase: t.media.playbackPath ? 'ready' : 'preparing-media',
                        progress: 0,
                        errorMessage: null,
                    },
                    result: null,
                }
                : t
        )
    })),

    updateTask: (id, updater) => set((state) => ({
        tasks: state.tasks.map(t => {
            if (t.id !== id) {
                return t;
            }
            return typeof updater === 'function' ? updater(t) : updater;
        })
    })),

    setGlobalProviderId: (providerId) => set({ globalProviderId: providerId, globalModelId: getDefaultModelId(providerId) }),
    setGlobalModelId: (modelId) => set({ globalModelId: modelId }),
    setIsGlobalSettingsOpen: (isOpen) => set({ isGlobalSettingsOpen: isOpen }),
    selectTask: (id) => set({ selectedTaskId: id }),
    setActiveTool: (tool) => set({ activeToolRef: tool }),
}));
