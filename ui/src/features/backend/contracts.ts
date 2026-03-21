import type { ProviderId } from '../workbench/models';

export interface BackendRuntimeInfo {
    endpoint: string;
    log_path: string;
}

export interface HealthResponse {
    status: 'ok';
    message: string;
    endpoint: string;
}

export interface SourceAssetPayload {
    path: string;
    name: string;
    kind: 'audio' | 'video';
}

export interface WaveformPayload {
    duration: number;
    peaks: number[][];
}

export interface PreparedMediaPayload {
    playback_path: string;
    extraction_path?: string | null;
    waveform?: WaveformPayload | null;
}

export interface AssetRecordPayload {
    asset_id: string;
    source: SourceAssetPayload;
    prepared_media: PreparedMediaPayload;
    imported_at: string;
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

export interface WorkflowProfilePayload {
    capability: 'transcription';
    provider_id: ProviderId;
    model_id: string;
}

export interface WorkflowDraftPayload {
    asset_id: string;
    selection: EditorSelectionPayload;
    profile: WorkflowProfilePayload;
}

export interface ArtifactRecordPayload {
    artifact_id: string;
    kind: 'transcript';
    path: string;
    created_at: string;
}

export interface ImportAssetResponse {
    asset: AssetRecordPayload;
    editor_session: EditorSelectionPayload;
}

export interface StartWorkflowRunRequest {
    asset_id: string;
    draft: WorkflowDraftPayload;
}

export interface WorkflowRunSnapshotResponse {
    run_id: string;
    asset_id: string;
    asset_name: string;
    capability: 'transcription';
    status: 'draft' | 'prepared' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
    progress: number;
    created_at: string;
    updated_at: string;
    error_message?: string | null;
    artifact?: ArtifactRecordPayload | null;
}

export interface WorkflowRunAcceptedResponse {
    status: 'accepted';
    snapshot: WorkflowRunSnapshotResponse;
}

export interface TranscriptDocumentResponse {
    run_id: string;
    path: string;
    content: string;
}

export interface ExportTranscriptResponse {
    path: string;
}