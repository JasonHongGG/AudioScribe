// AudioScribe Frontend-Backend API Integration Layer

import { FileTask } from '../store';

const API_BASE_URL = 'http://127.0.0.1:8000';

export interface TranscribeResponse {
    status: 'success' | 'error';
    file?: string;
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
        segments: FileTask['segments']
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

            const data = await response.json();
            return data as TranscribeResponse;

        } catch (error) {
            console.error("API error during transcribe request:", error);
            return {
                status: 'error',
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
};
