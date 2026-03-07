// AudioScribe Frontend-Backend API Integration Layer

import { fetch } from '@tauri-apps/plugin-http';
import { FileTask } from '../store';

const API_BASE_URL = 'http://127.0.0.1:8000';
const MAX_POLL_MS = 30 * 60 * 1000;

type StartTranscribeResponse = {
    status: 'accepted' | 'error';
    job_id?: string;
    file?: string;
    message?: string;
    error?: string;
};

type JobStatusResponse = {
    status: 'running' | 'success' | 'error';
    job_id?: string;
    file?: string;
    progress?: number;
    message?: string;
    error?: string;
};

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getPollIntervalMs(elapsedMs: number): number {
    if (elapsedMs < 60_000) return 3000;
    return 5000;
}

export interface TranscribeResponse {
    status: 'success' | 'error';
    file?: string;
    progress?: number;
    message?: string;
    error?: string;
}

export const api = {
    /**
     * Check if the Python backend is running
     */
    async checkHealth(): Promise<boolean> {
        try {
            const res = await fetch(`${API_BASE_URL}/health`, {
                method: 'GET',
                signal: AbortSignal.timeout(2000)
            });
            return res.ok;
        } catch (e) {
            return false;
        }
    },

    /**
     * Start transcription for a single file
     */
    async transcribeFile(
        filePath: string,
        provider: 'faster-whisper' | 'qwen3-asr',
        modelSize: string,
        trimRange: FileTask['trimRange'],
        segments: FileTask['segments'],
        onProgress?: (progress: number) => void
    ): Promise<TranscribeResponse> {
        try {
            // Build dynamic regions config
            // We pass the trimRange and any excluded segments to the backend
            let regions = null;
            if (trimRange || (segments && segments.some(s => !s.included))) {
                const excludes = [];
                if (segments) {
                    for (const seg of segments) {
                        if (!seg.included) {
                            excludes.push([seg.start, seg.end]);
                        }
                    }
                }

                regions = {
                    trim: trimRange ? [trimRange.start, trimRange.end] : null,
                    excludes: excludes.length > 0 ? excludes : null
                };
            }

            const response = await fetch(`${API_BASE_URL}/transcribe`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    file_path: filePath,
                    provider,
                    model_size: modelSize,
                    regions
                }),
            });

            if (!response.ok) {
                return { status: 'error', error: `HTTP Error: ${response.status}` };
            }

            const startData = await response.json() as StartTranscribeResponse;
            if (startData.status !== 'accepted' || !startData.job_id) {
                return {
                    status: 'error',
                    error: startData.error ?? startData.message ?? 'Failed to start transcription job'
                };
            }

            const startedAt = Date.now();
            while (Date.now() - startedAt < MAX_POLL_MS) {
                const elapsedMs = Date.now() - startedAt;
                await sleep(getPollIntervalMs(elapsedMs));

                const statusRes = await fetch(`${API_BASE_URL}/jobs/${startData.job_id}`, {
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
                        file: statusData.file ?? startData.file,
                        progress: 100,
                    };
                }

                return {
                    status: 'error',
                    error: statusData.error ?? statusData.message ?? 'Transcription job failed',
                };
            }

            return { status: 'error', error: 'Transcription polling timed out' };

        } catch (error) {
            console.error("API error during transcribe request:", error);
            return {
                status: 'error',
                error: error instanceof Error ? error.message : String(error)
            };
        }
    },

    /**
     * Extract audio from a video file (mp4, mkv, etc.) via FFmpeg on backend.
     * Returns the path to the extracted MP3 file.
     */
    async extractAudio(filePath: string): Promise<{ status: 'success' | 'error'; audio_path?: string; error?: string }> {
        try {
            const response = await fetch(`${API_BASE_URL}/extract-audio`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_path: filePath }),
            });

            if (!response.ok) {
                return { status: 'error', error: `HTTP Error: ${response.status}` };
            }

            return await response.json() as { status: 'success' | 'error'; audio_path?: string; error?: string };
        } catch (error) {
            console.error("API error during extract-audio request:", error);
            return {
                status: 'error',
                error: error instanceof Error ? error.message : String(error),
            };
        }
    },
};
