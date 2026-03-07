import type { ProviderId } from '../tasks/types';

export interface BackendRuntimeInfo {
    endpoint: string;
}

export interface HealthResponse {
    status: 'ok';
    message: string;
    endpoint: string;
}

export interface ExtractMediaResponse {
    status: 'ready' | 'error';
    media_path?: string | null;
    error?: string | null;
}

export interface EditorSegmentPayload {
    start: number;
    end: number;
    included: boolean;
}

export interface EditorSelectionPayload {
    trim_start: number | null;
    trim_end: number | null;
    segments: EditorSegmentPayload[];
}

export interface StartTranscriptionRequest {
    source_path: string;
    media_path: string | null;
    options: {
        provider_id: ProviderId;
        model_id: string;
    };
    editor: EditorSelectionPayload | null;
}

export interface JobAcceptedResponse {
    status: 'accepted';
    job_id: string;
    task_name: string;
}

export interface JobStatusResponse {
    status: 'running' | 'success' | 'error';
    job_id: string;
    task_name: string;
    progress?: number | null;
    transcript_path?: string | null;
    error?: string | null;
    details?: string | null;
}