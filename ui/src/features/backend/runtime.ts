import { invoke } from '@tauri-apps/api/core';
import type { BackendRuntimeInfo } from './contracts';
import { api, configureApiClient } from '../../services/api';

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveBackendRuntime(): Promise<BackendRuntimeInfo> {
    try {
        return await invoke<BackendRuntimeInfo>('ensure_backend_started');
    } catch {
        const envEndpoint = import.meta.env.VITE_AUDIOSCRIBE_API_BASE_URL;
        if (envEndpoint) {
            return { endpoint: envEndpoint, log_path: 'desktop backend log path unavailable in browser-only mode' };
        }
        throw new Error('Desktop backend runtime is unavailable. Start the app through Tauri or configure VITE_AUDIOSCRIBE_API_BASE_URL.');
    }
}

export async function ensureBackendReady(timeoutMs = 45000): Promise<BackendRuntimeInfo> {
    const runtime = await resolveBackendRuntime();
    configureApiClient(runtime);

    const initialProbe = await api.checkHealth(runtime.endpoint);
    if (initialProbe.ok) {
        return runtime;
    }

    const startedAt = Date.now();
    let lastError = initialProbe.error;
    while (Date.now() - startedAt < timeoutMs) {
        const probe = await api.checkHealth(runtime.endpoint);
        if (probe.ok) {
            return runtime;
        }
        lastError = probe.error;
        await sleep(750);
    }

    throw new Error(
        `Audio engine failed to start at ${runtime.endpoint}. Check ${runtime.log_path}.` +
        (lastError ? ` Last probe error: ${lastError}` : '')
    );
}
