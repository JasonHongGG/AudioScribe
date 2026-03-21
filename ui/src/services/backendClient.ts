import type {
    BackendRuntimeInfo,
    ExportTranscriptResponse,
    HealthResponse,
    ImportAssetResponse,
    StartWorkflowRunRequest,
    TranscriptDocumentResponse,
    WaveformMetadataResponse,
    WaveformTileResponse,
    WorkflowRunAcceptedResponse,
    WorkflowRunSnapshotResponse,
} from '../features/backend/contracts';


let apiBaseUrl: string | null = null;


function requireApiBaseUrl(): string {
    if (!apiBaseUrl) {
        throw new Error('Backend endpoint is not configured.');
    }
    return apiBaseUrl;
}


async function requestJson<T>(path: string, init: Parameters<typeof fetch>[1]): Promise<T> {
    const response = await fetch(`${requireApiBaseUrl()}${path}`, init);
    if (!response.ok) {
        const fallback = `HTTP ${response.status}`;
        try {
            const payload = await response.json() as { detail?: string };
            throw new Error(payload.detail ?? fallback);
        } catch {
            throw new Error(fallback);
        }
    }
    return await response.json() as T;
}


export function configureBackendClient(runtime: BackendRuntimeInfo | string): void {
    apiBaseUrl = typeof runtime === 'string' ? runtime.replace(/\/$/, '') : runtime.endpoint.replace(/\/$/, '');
}


export async function checkHealth(endpointOverride?: string): Promise<{ ok: boolean; error?: string }> {
    try {
        const baseUrl = endpointOverride ?? requireApiBaseUrl();
        const response = await fetch(`${baseUrl}/health`, {
            method: 'GET',
            signal: AbortSignal.timeout(2000),
        });
        if (!response.ok) {
            return { ok: false, error: `Health check returned HTTP ${response.status}` };
        }
        await response.json() as HealthResponse;
        return { ok: true };
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
}


export async function importAsset(sourcePath: string): Promise<ImportAssetResponse> {
    return requestJson<ImportAssetResponse>('/assets/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_path: sourcePath }),
        signal: AbortSignal.timeout(30 * 60 * 1000),
    });
}


export async function startWorkflowRun(request: StartWorkflowRunRequest): Promise<WorkflowRunAcceptedResponse> {
    return requestJson<WorkflowRunAcceptedResponse>('/workflow-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
    });
}


export async function fetchWorkflowRun(runId: string): Promise<WorkflowRunSnapshotResponse> {
    return requestJson<WorkflowRunSnapshotResponse>(`/workflow-runs/${runId}`, { method: 'GET' });
}


export async function loadTranscriptDocument(runId: string): Promise<TranscriptDocumentResponse> {
    return requestJson<TranscriptDocumentResponse>(`/workflow-runs/${runId}/transcript`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
    });
}


export async function exportTranscriptDocument(runId: string, destinationPath: string): Promise<string> {
    const response = await requestJson<ExportTranscriptResponse>(`/workflow-runs/${runId}/transcript-export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination_path: destinationPath }),
        signal: AbortSignal.timeout(10_000),
    });
    return response.path;
}


export async function fetchWaveformMetadata(assetId: string): Promise<WaveformMetadataResponse> {
    return requestJson<WaveformMetadataResponse>(`/assets/${assetId}/waveform/metadata`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
    });
}


export async function fetchWaveformTile(assetId: string, level: number, startTime: number, endTime: number): Promise<WaveformTileResponse> {
    const params = new URLSearchParams({
        level: String(level),
        start_time: String(startTime),
        end_time: String(endTime),
    });
    return requestJson<WaveformTileResponse>(`/assets/${assetId}/waveform/tiles?${params.toString()}`, {
        method: 'GET',
        signal: AbortSignal.timeout(15000),
    });
}