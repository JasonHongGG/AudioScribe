export type ProviderId = 'faster-whisper' | 'qwen3-asr';
export type SourceKind = 'audio' | 'video';
export type ArtifactKind = 'transcript';
export type WorkflowCapability = 'transcription';
export type WorkflowStatus = 'draft' | 'prepared' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type ActiveTool = 'split' | 'include' | 'exclude';

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

export type WaveformBarView = {
    startTime: number;
    endTime: number;
    amplitude: number;
};

export type WaveformLevelView = {
    level: number;
    secondsPerBar: number;
    barsPerTile: number;
    tileDuration: number;
};

export type WaveformView = {
    duration: number;
    overviewBars: WaveformBarView[];
    levels: WaveformLevelView[];
};

export type WorkbenchAsset = {
    assetId: string;
    name: string;
    importedAt: string;
    source: {
        path: string;
        kind: SourceKind;
    };
    media: {
        playbackPath: string;
        extractionPath: string | null;
        waveform: WaveformView | null;
    };
};

export type EditorSession = {
    assetId: string;
    trimRange: TrimRange | null;
    segments: AudioSegment[];
};

export type WorkflowDraft = {
    assetId: string;
    capability: WorkflowCapability;
    providerId: ProviderId;
    modelId: string;
};

export type ArtifactView = {
    artifactId: string;
    kind: ArtifactKind;
    path: string;
    createdAt: string;
};

export type WorkflowRunView = {
    runId: string;
    assetId: string;
    assetName: string;
    capability: WorkflowCapability;
    status: WorkflowStatus;
    progress: number;
    createdAt: string;
    updatedAt: string;
    errorMessage: string | null;
    artifact: ArtifactView | null;
};

export type WorkbenchEntry = {
    asset: WorkbenchAsset;
    editorSession: EditorSession;
    draft: WorkflowDraft;
    latestRun: WorkflowRunView | null;
};