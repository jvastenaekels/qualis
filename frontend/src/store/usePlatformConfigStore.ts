import { create } from 'zustand';
import type { PublicConfigEmailDelivery } from '@/api/model/publicConfigEmailDelivery';
import type { PublicConfigAudioStorage } from '@/api/model/publicConfigAudioStorage';

type EmailDelivery = PublicConfigEmailDelivery;
type AudioStorage = PublicConfigAudioStorage;

interface PlatformConfigState {
    emailDelivery: EmailDelivery | null;
    audioStorage: AudioStorage | null;
    setEmailDelivery: (mode: EmailDelivery) => void;
    setAudioStorage: (mode: AudioStorage) => void;
    isEmailManual: () => boolean;
    isAudioStorageAvailable: () => boolean;
}

export const usePlatformConfigStore = create<PlatformConfigState>((set, get) => ({
    emailDelivery: null,
    audioStorage: null,
    setEmailDelivery: (mode) => set({ emailDelivery: mode }),
    setAudioStorage: (mode) => set({ audioStorage: mode }),
    isEmailManual: () => get().emailDelivery === 'manual',
    // null = not yet loaded: default to available so a transient /api/config
    // failure never suppresses audio on a correctly-configured instance.
    isAudioStorageAvailable: () => get().audioStorage !== 'unavailable',
}));
