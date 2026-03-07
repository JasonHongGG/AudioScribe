import { invoke } from '@tauri-apps/api/core';

export interface TranscriptDocument {
    path: string;
    content: string;
}

export async function loadTranscriptDocument(path: string): Promise<TranscriptDocument> {
    return await invoke<TranscriptDocument>('load_transcript_document', { path });
}

export async function revealTranscriptDocument(path: string): Promise<void> {
    await invoke('reveal_transcript_document', { path });
}

export async function exportTranscriptDocument(sourcePath: string, destinationPath: string): Promise<string> {
    return await invoke<string>('export_transcript_document', {
        sourcePath,
        destinationPath,
    });
}