import { create } from 'zustand';

export type AudioSegment = {
    id: string;
    start: number;
    end: number;
    included: boolean;
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
        // Placeholder for batch transcription logic
        console.log("Starting batch transcription with provider:", get().globalProvider);
        // Real implementation will likely involve iterating through tasks and sending IPC calls to Tauri backend
    }
}));
