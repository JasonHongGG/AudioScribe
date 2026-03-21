import { invoke } from '@tauri-apps/api/core';
import { exportTranscriptDocument as exportTranscript, loadTranscriptDocument as loadTranscript } from '../../services/backendClient';


export interface TranscriptDocument {
    path: string;
    content: string;
}

export interface TranscriptCue {
    id: string;
    lineIndex: number;
    startTime: number;
    endTime: number;
    startLabel: string;
    endLabel: string;
    text: string;
    rawLine: string;
}


const TIMESTAMPED_LINE_PATTERN = /^\[(\d+:\d{2}:\d{2}(?:\.\d+)?)\s*->\s*(\d+:\d{2}:\d{2}(?:\.\d+)?)\]\s*(.*)$/;


function parseTimestampToSeconds(value: string): number | null {
    const parts = value.split(':');
    if (parts.length !== 3) {
        return null;
    }

    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);
    const seconds = Number(parts[2]);
    if ([hours, minutes, seconds].some((part) => Number.isNaN(part))) {
        return null;
    }

    return (hours * 3600) + (minutes * 60) + seconds;
}


export function parseTranscriptCues(content: string): TranscriptCue[] {
    return content
        .split(/\r?\n/)
        .map((line, lineIndex) => {
            const match = line.match(TIMESTAMPED_LINE_PATTERN);
            if (!match) {
                return null;
            }

            const startLabel = match[1];
            const endLabel = match[2];
            const text = match[3] ?? '';
            const startTime = parseTimestampToSeconds(startLabel);
            const endTime = parseTimestampToSeconds(endLabel);
            if (startTime === null || endTime === null) {
                return null;
            }

            return {
                id: `${lineIndex}:${startLabel}:${endLabel}`,
                lineIndex,
                startTime,
                endTime,
                startLabel,
                endLabel,
                text,
                rawLine: line,
            } satisfies TranscriptCue;
        })
        .filter((cue): cue is TranscriptCue => cue !== null);
}


export function findActiveTranscriptCueIndex(cues: TranscriptCue[], currentTime: number): number {
    for (let index = 0; index < cues.length; index += 1) {
        const cue = cues[index];
        const isWithinCue = currentTime >= cue.startTime && currentTime < cue.endTime;
        const isLastCue = index === cues.length - 1 && currentTime >= cue.startTime;
        if (isWithinCue || isLastCue) {
            return index;
        }
    }
    return -1;
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