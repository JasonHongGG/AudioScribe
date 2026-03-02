import { create } from 'zustand';

export interface AudioSegment {
    id: string;
    start: number;
    end: number;
    included: boolean;
}

export interface FileTask {
    id: string;
    file: File | null;
    file_path: string | null;
    name: string;
    status: 'ready' | 'extracting' | 'transcribing' | 'done' | 'error';
    progress: number;
    provider: 'faster-whisper' | 'qwen3-asr';
    modelSize: string;
    language: string | null;
    segments: AudioSegment[] | null;
}

interface AppState {
    tasks: FileTask[];
    globalProvider: 'faster-whisper' | 'qwen3-asr';
    globalModelSize: string;
    addTask: (taskInfo: { file: File | null, path: string | null, name: string }) => void;
    removeTask: (id: string) => void;
    updateTask: (id: string, updates: Partial<FileTask>) => void;
    startTranscription: (id: string, fileTask: FileTask) => Promise<void>;

    // Global Settings Modal State
    isGlobalSettingsOpen: boolean;
    openGlobalSettings: () => void;
    closeGlobalSettings: () => void;
    setGlobalProvider: (v: 'faster-whisper' | 'qwen3-asr') => void;
    setGlobalModelSize: (v: string) => void;

    // Batch Transcription State
    isBatchTranscribing: boolean;
    startBatchTranscription: () => Promise<void>;

    // Selected Task State
    selectedTaskId: string | null;
    selectTask: (id: string | null) => void;

    // Transient UI State (Allows event listeners in FileEditor to read current tool without re-binding)
    activeToolRef?: 'cut' | 'include' | 'exclude';
}

export const useStore = create<AppState>((set) => ({
    tasks: [],
    globalProvider: 'faster-whisper',
    globalModelSize: 'large-v3',

    isGlobalSettingsOpen: false,
    openGlobalSettings: () => set({ isGlobalSettingsOpen: true }),
    closeGlobalSettings: () => set({ isGlobalSettingsOpen: false }),
    setGlobalProvider: (v) => set({ globalProvider: v }),
    setGlobalModelSize: (v) => set({ globalModelSize: v }),

    selectedTaskId: null,
    selectTask: (id: string | null) => set({ selectedTaskId: id }),

    isBatchTranscribing: false,
    startBatchTranscription: async () => {
        const { tasks, startTranscription } = useStore.getState();
        set({ isBatchTranscribing: true });

        // Iterate through tasks sequentially that are ready or errored
        for (const task of tasks) {
            if (task.status === 'ready' || task.status === 'error') {
                await startTranscription(task.id, task);
            }
        }

        set({ isBatchTranscribing: false });
    },

    addTask: (taskInfo) => set((state) => ({
        tasks: [
            ...state.tasks,
            {
                id: Math.random().toString(36).substring(2, 9),
                file: taskInfo.file,
                file_path: taskInfo.path,
                name: taskInfo.name,
                status: 'ready',
                progress: 0,
                provider: state.globalProvider,
                modelSize: state.globalModelSize,
                language: null,
                segments: null,
            }
        ]
    })),

    removeTask: (id: string) => set((state) => ({
        tasks: state.tasks.filter((t) => t.id !== id)
    })),

    updateTask: (id: string, updates: Partial<FileTask>) => set((state) => ({
        tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t))
    })),

    startTranscription: async (id: string, fileTask: FileTask) => {
        // 1. Mark as transcribing
        set((state) => ({
            tasks: state.tasks.map((t) => (t.id === id ? { ...t, status: 'transcribing', progress: 10 } : t))
        }));

        try {
            // 2. We use the real file path if available from Tauri native drop, else mock it
            const targetPath = fileTask.file_path || `audio/${fileTask.name}`;

            const result = await fetch("http://127.0.0.1:8000/transcribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    file_path: targetPath,
                    provider: fileTask.provider,
                    model_size: fileTask.modelSize,
                    segments: fileTask.segments
                })
            });

            const data = await result.json();

            // 3. Complete
            if (data.status === 'success') {
                set((state) => ({
                    tasks: state.tasks.map((t) => (t.id === id ? { ...t, status: 'done', progress: 100 } : t))
                }));
            } else {
                throw new Error(data.message || data.error);
            }

        } catch (err: any) {
            set((state) => ({
                tasks: state.tasks.map((t) => (t.id === id ? { ...t, status: 'error', progress: 0 } : t))
            }));
            console.error("Transcription Error:", err);
        }
    },
}));
