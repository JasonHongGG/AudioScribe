import { useCallback } from 'react';
import { api } from '../../services/api';
import { useStore } from '../../store';
import { createTaskFromPath, isSupportedMediaPath } from './taskFactory';

export function useTaskIngestion() {
    const addTask = useStore((state) => state.addTask);
    const selectTask = useStore((state) => state.selectTask);
    const updateTask = useStore((state) => state.updateTask);
    const globalProviderId = useStore((state) => state.globalProviderId);
    const globalModelId = useStore((state) => state.globalModelId);

    return useCallback(async (paths: string[]) => {
        const supportedPaths = paths.filter(isSupportedMediaPath);
        if (supportedPaths.length === 0) {
            return;
        }

        let hasSelectedTask = false;
        const currentSelectedTaskId = useStore.getState().selectedTaskId;
        if (currentSelectedTaskId !== null) {
            hasSelectedTask = true;
        }

        for (const path of supportedPaths) {
            const task = createTaskFromPath(path, {
                providerId: globalProviderId,
                modelId: globalModelId,
            });
            addTask(task);

            const result = await api.extractMedia(path);
            if (result.status === 'ready' && result.media_path) {
                updateTask(task.id, (currentTask) => ({
                    ...currentTask,
                    media: {
                        playbackPath: result.media_path ?? currentTask.media.playbackPath,
                        extractionPath: result.media_path ?? currentTask.media.extractionPath,
                        waveform: result.waveform
                            ? {
                                duration: result.waveform.duration,
                                peaks: result.waveform.peaks,
                            }
                            : currentTask.media.waveform,
                    },
                    runtime: {
                        phase: 'ready',
                        progress: 0,
                        errorMessage: null,
                    },
                }));

                if (!hasSelectedTask) {
                    selectTask(task.id);
                    hasSelectedTask = true;
                }
                continue;
            }

            updateTask(task.id, (currentTask) => ({
                ...currentTask,
                runtime: {
                    phase: 'failed',
                    progress: 0,
                    errorMessage: result.error ?? 'Failed to prepare media',
                },
            }));
        }
    }, [addTask, globalModelId, globalProviderId, selectTask, updateTask]);
}
