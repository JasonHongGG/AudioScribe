export type AudioSegment = {
    id: string;
    start: number;
    end: number;
    included: boolean;
};

export type TrimRange = {
    start: number;
    end: number;
};

export type ProviderId = 'faster-whisper' | 'qwen3-asr';
export type SourceKind = 'audio' | 'video';
export type TaskPhase = 'preparing-media' | 'ready' | 'processing' | 'completed' | 'failed';

export type FileTask = {
    id: string;
    name: string;
    source: {
        path: string;
        kind: SourceKind;
    };
    media: {
        playbackPath: string | null;
        extractionPath: string | null;
    };
    transcription: {
        providerId: ProviderId;
        modelId: string;
    };
    editor: {
        segments: AudioSegment[];
        trimRange: TrimRange | null;
    };
    runtime: {
        phase: TaskPhase;
        progress: number;
        errorMessage: string | null;
    };
    result: {
        transcriptPath: string | null;
    } | null;
};

export type ActiveTool = 'split' | 'include' | 'exclude';
