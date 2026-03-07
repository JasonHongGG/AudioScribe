import { fetch } from '@tauri-apps/plugin-http';
import type {
    BackendRuntimeInfo,
    EditorSelectionPayload,
    ExtractMediaResponse,
    HealthResponse,
    JobAcceptedResponse,
    JobStatusResponse,
    StartTranscriptionRequest,
} from '../features/backend/contracts';
import type { FileTask } from '../features/tasks/types';

const MAX_POLL_MS = 30 * 60 * 1000;

let apiBaseUrl: string | null = null;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getPollIntervalMs(elapsedMs: number): number {
    if (elapsedMs < 60_000) return 3000;
    return 5000;
}

export interface TranscribeResponse {
    status: 'success' | 'error';
    transcriptPath?: string;
    error?: string;
}

export interface HealthProbeResult {
    ok: boolean;
    error?: string;
}

export function configureApiClient(runtime: BackendRuntimeInfo | string): void {
    apiBaseUrl = typeof runtime === 'string' ? runtime.replace(/\/$/, '') : runtime.endpoint.replace(/\/$/, '');
}

function requireApiBaseUrl(): string {
    if (!apiBaseUrl) {
        throw new Error('Backend endpoint is not configured.');
    }
    return apiBaseUrl;
}

function buildEditorPayload(task: FileTask): EditorSelectionPayload | null {
    const trimRange = task.editor.trimRange;
    const segments = task.editor.segments;
    if (!trimRange && segments.every((segment) => segment.included)) {
        return null;
    }

    return {
        trim_start: trimRange?.start ?? null,
        trim_end: trimRange?.end ?? null,
        segments: segments.map((segment) => ({
            start: segment.start,
            end: segment.end,
            included: segment.included,
        })),
    };
}

export const api = {
    async checkHealth(endpointOverride?: string): Promise<HealthProbeResult> {
        try {
            const baseUrl = endpointOverride ?? requireApiBaseUrl();
            const res = await fetch(`${baseUrl}/health`, {
                method: 'GET',
                signal: AbortSignal.timeout(2000),
            });
            if (!res.ok) {
                return { ok: false, error: `Health check returned HTTP ${res.status}` };
            }
            await res.json() as HealthResponse;
            return { ok: true };
        } catch (error) {
            return {
                ok: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    },

    async transcribeTask(
        task: FileTask,
        onProgress?: (progress: number) => void
    ): Promise<TranscribeResponse> {
        try {
            const response = await fetch(`${requireApiBaseUrl()}/transcriptions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    source_path: task.source.path,
                    media_path: task.media.playbackPath,
                    options: {
                        provider_id: task.transcription.providerId,
                        model_id: task.transcription.modelId,
                    },
                    editor: buildEditorPayload(task),
                } satisfies StartTranscriptionRequest),
            });

            if (!response.ok) {
                return { status: 'error', error: `HTTP Error: ${response.status}` };
            }

            const startData = await response.json() as JobAcceptedResponse;

            const startedAt = Date.now();
            while (Date.now() - startedAt < MAX_POLL_MS) {
                const elapsedMs = Date.now() - startedAt;
                await sleep(getPollIntervalMs(elapsedMs));

                const statusRes = await fetch(`${requireApiBaseUrl()}/jobs/${startData.job_id}`, {
                    method: 'GET',
                });

                if (!statusRes.ok) {
                    return { status: 'error', error: `Job polling HTTP Error: ${statusRes.status}` };
                }

                const statusData = await statusRes.json() as JobStatusResponse;
                if (statusData.status === 'running') {
                    if (typeof statusData.progress === 'number') {
                        onProgress?.(Math.max(0, Math.min(99, Math.floor(statusData.progress))));
                    }
                    continue;
                }
                if (statusData.status === 'success') {
                    onProgress?.(100);
                    return {
                        status: 'success',
                        transcriptPath: statusData.transcript_path ?? undefined,
                    };
                }

                return {
                    status: 'error',
                    error: statusData.error ?? statusData.details ?? 'Transcription job failed',
                };
            }

            return { status: 'error', error: 'Transcription polling timed out' };

        } catch (error) {
            console.error('API error during transcription request:', error);
            return {
                status: 'error',
                error: error instanceof Error ? error.message : String(error),
            };
        }
    },

    async extractMedia(sourcePath: string): Promise<ExtractMediaResponse> {
        try {
            const response = await fetch(`${requireApiBaseUrl()}/extract-media`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source_path: sourcePath }),
                signal: AbortSignal.timeout(30 * 60 * 1000),
            });

            if (!response.ok) {
                return { status: 'error', error: `HTTP Error: ${response.status}` };
            }

            return await response.json() as ExtractMediaResponse;
        } catch (error) {
            console.error('API error during extract-media request:', error);
            return {
                status: 'error',
                error: error instanceof Error ? error.message : String(error),
            };
        }
    },
};
