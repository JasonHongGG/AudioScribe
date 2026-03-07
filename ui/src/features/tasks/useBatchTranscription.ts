import { useCallback, useRef } from 'react';
import { api } from '../../services/api';
import { useStore } from '../../store';

export function useBatchTranscription() {
    const updateTask = useStore((state) => state.updateTask);
    const runningRef = useRef(false);

    const startBatchTranscription = useCallback(async () => {
        if (runningRef.current) {
            return;
        }

        const pendingTasks = useStore.getState().tasks.filter((task) => task.runtime.phase === 'ready');
        if (pendingTasks.length === 0) {
            return;
        }

        runningRef.current = true;
        try {
            for (const task of pendingTasks) {
                updateTask(task.id, (currentTask) => ({
                    ...currentTask,
                    runtime: {
                        phase: 'processing',
                        progress: 0,
                        errorMessage: null,
                    },
                    result: null,
                }));

                try {
                    const response = await api.transcribeTask(
                        task,
                        (progress) => {
                            updateTask(task.id, (currentTask) => ({
                                ...currentTask,
                                runtime: {
                                    ...currentTask.runtime,
                                    progress,
                                },
                            }));
                        }
                    );

                    updateTask(task.id, (currentTask) => ({
                        ...currentTask,
                        runtime: {
                            phase: response.status === 'success' ? 'completed' : 'failed',
                            progress: response.status === 'success' ? 100 : 0,
                            errorMessage: response.status === 'success' ? null : (response.error ?? 'Transcription failed'),
                        },
                        result: response.status === 'success'
                            ? { transcriptPath: response.transcriptPath ?? null }
                            : null,
                    }));
                } catch {
                    updateTask(task.id, (currentTask) => ({
                        ...currentTask,
                        runtime: {
                            phase: 'failed',
                            progress: 0,
                            errorMessage: 'Transcription failed',
                        },
                    }));
                }
            }
        } finally {
            runningRef.current = false;
        }
    }, [updateTask]);

    return { startBatchTranscription };
}
