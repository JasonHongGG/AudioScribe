import type { ProviderId } from '../tasks/types';

export interface ModelDescriptor {
    id: string;
    name: string;
    desc: string;
}

export interface ProviderDescriptor {
    id: ProviderId;
    name: string;
    description: string;
    defaultModelId: string;
    models: ModelDescriptor[];
}

export const PROVIDERS: ProviderDescriptor[] = [
    {
        id: 'faster-whisper',
        name: 'Faster Whisper',
        description: 'Local Whisper inference optimized for iterative editing and stable timestamps.',
        defaultModelId: 'base',
        models: [
            { id: 'tiny', name: 'Tiny', desc: 'Fastest, lowest accuracy (approx. 39M params)' },
            { id: 'base', name: 'Base', desc: 'Good balance for casual use (approx. 74M params)' },
            { id: 'small', name: 'Small', desc: 'Better accuracy, moderate speed (approx. 244M params)' },
            { id: 'medium', name: 'Medium', desc: 'High accuracy, slower (approx. 769M params)' },
            { id: 'large-v2', name: 'Large V2', desc: 'Very high accuracy, requires good GPU (approx. 1550M params)' },
            { id: 'large-v3', name: 'Large V3', desc: 'State of the art, maximum accuracy' },
        ],
    },
    {
        id: 'qwen3-asr',
        name: 'Qwen3 ASR',
        description: 'Advanced ASR pipeline with timestamp extraction and multilingual support.',
        defaultModelId: 'qwen3-asr-1.7b',
        models: [
            { id: 'qwen3-asr-1.7b', name: 'Qwen3 ASR 1.7B', desc: 'Default Qwen3 ASR model and aligner bundle' },
        ],
    },
];

export function getProviderDescriptor(providerId: ProviderId): ProviderDescriptor {
    return PROVIDERS.find((provider) => provider.id === providerId) ?? PROVIDERS[0];
}

export function getDefaultModelId(providerId: ProviderId): string {
    return getProviderDescriptor(providerId).defaultModelId;
}