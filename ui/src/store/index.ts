import { create } from 'zustand';
import { api } from '../services/api';

export type AudioSegment = {
    id: string;
    start: number;
    end: number;
    included: boolean;
};

export type TrimRange = {
    start: number;
    end: number;
};

export type FileTask = {
    id: string;
    file: File | null;
    file_path: string | null;
    name: string;
    status: 'ready' | 'extracting' | 'transcribing' | 'done' | 'error';
    progress: number;
    provider: 'faster-whisper' | 'qwen3-asr';
    modelSize: string;
    segments: AudioSegment[] | null;
    trimRange: TrimRange | null;
};

export type ActiveTool = 'split' | 'include' | 'exclude';

type AppState = {
    tasks: FileTask[];
    globalProvider: 'faster-whisper' | 'qwen3-asr';
    globalModelSize: string;
    isGlobalSettingsOpen: boolean;
    selectedTaskId: string | null;
    activeToolRef: ActiveTool;

    // Actions
    addTask: (task: FileTask) => void;
    removeTask: (id: string) => void;
    updateTask: (id: string, updates: Partial<FileTask>) => void;
    setGlobalProvider: (provider: 'faster-whisper' | 'qwen3-asr') => void;
    setGlobalModelSize: (size: string) => void;
    setIsGlobalSettingsOpen: (isOpen: boolean) => void;
    selectTask: (id: string | null) => void;
    setActiveTool: (tool: ActiveTool) => void;
    startBatchTranscription: () => Promise<void>;
};

export const useStore = create<AppState>((set, get) => ({
    tasks: [],
    globalProvider: 'faster-whisper',
    globalModelSize: 'base',
    isGlobalSettingsOpen: false,
    selectedTaskId: null,
    activeToolRef: 'split',

    addTask: (task) => set((state) => ({ tasks: [...state.tasks, task] })),

    removeTask: (id) => set((state) => ({
        tasks: state.tasks.filter(t => t.id !== id),
        selectedTaskId: state.selectedTaskId === id ? null : state.selectedTaskId
    })),

    updateTask: (id, updates) => set((state) => ({
        tasks: state.tasks.map(t => t.id === id ? { ...t, ...updates } : t)
    })),

    setGlobalProvider: (provider) => set({ globalProvider: provider }),
    setGlobalModelSize: (size) => set({ globalModelSize: size }),
    setIsGlobalSettingsOpen: (isOpen) => set({ isGlobalSettingsOpen: isOpen }),
    selectTask: (id) => set({ selectedTaskId: id }),
    setActiveTool: (tool) => set({ activeToolRef: tool }),

    startBatchTranscription: async () => {
        const state = get();
        const pendingTasks = state.tasks.filter(t => t.status === 'ready');

        if (pendingTasks.length === 0) return;

        // Using sequential processing to avoid overwhelming backend/system resources
        for (const task of pendingTasks) {
            // Update to extracting/transcribing
            set((state) => ({
                tasks: state.tasks.map(t =>
                    t.id === task.id ? { ...t, status: 'transcribing' } : t
                )
            }));

            try {
                const response = await api.transcribeFile(
                    task.file_path!,
                    task.provider,
                    task.modelSize,
                    task.trimRange,
                    task.segments
                );

                // Update based on outcome
                set((state) => ({
                    tasks: state.tasks.map(t =>
                        t.id === task.id ? {
                            ...t,
                            status: response.status === 'success' ? 'done' : 'error',
                            progress: response.status === 'success' ? 100 : t.progress
                        } : t
                    )
                }));
            } catch (err) {
                set((state) => ({
                    tasks: state.tasks.map(t =>
                        t.id === task.id ? { ...t, status: 'error' } : t
                    )
                }));
            }
        }
    }
}));
