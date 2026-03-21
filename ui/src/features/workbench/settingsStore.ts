import { create } from 'zustand';
import type { ProviderId } from './models';
import { getDefaultModelId } from '../settings/providerCatalog';


type SettingsState = {
    globalProviderId: ProviderId;
    globalModelId: string;
    isGlobalSettingsOpen: boolean;
    setGlobalProviderId: (providerId: ProviderId) => void;
    setGlobalModelId: (modelId: string) => void;
    setIsGlobalSettingsOpen: (isOpen: boolean) => void;
};


export const useSettingsStore = create<SettingsState>((set) => ({
    globalProviderId: 'faster-whisper',
    globalModelId: getDefaultModelId('faster-whisper'),
    isGlobalSettingsOpen: false,
    setGlobalProviderId: (providerId) => set({ globalProviderId: providerId, globalModelId: getDefaultModelId(providerId) }),
    setGlobalModelId: (modelId) => set({ globalModelId: modelId }),
    setIsGlobalSettingsOpen: (isOpen) => set({ isGlobalSettingsOpen: isOpen }),
}));