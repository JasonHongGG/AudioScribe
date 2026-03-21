import { invoke } from '@tauri-apps/api/core';
import { exportTranscriptDocument as exportTranscript, loadTranscriptDocument as loadTranscript } from '../../services/backendClient';


export interface TranscriptDocument {
    path: string;
    content: string;
}


export async function loadTranscriptDocument(runId: string): Promise<TranscriptDocument> {
    const document = await loadTranscript(runId);
    return {
        path: document.path,
        content: document.content,
    };
}


export async function revealTranscriptDocument(path: string): Promise<void> {
    await invoke('reveal_path', { path });
}


export async function exportTranscriptDocument(runId: string, destinationPath: string): Promise<string> {
    return await exportTranscript(runId, destinationPath);
}