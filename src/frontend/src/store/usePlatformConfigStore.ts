import { create } from 'zustand';
import type { PublicConfigEmailDelivery } from '@/api/model/publicConfigEmailDelivery';
import type { PublicConfigAudioStorage } from '@/api/model/publicConfigAudioStorage';

type EmailDelivery = PublicConfigEmailDelivery;
type AudioStorage = PublicConfigAudioStorage;

interface PlatformConfigState {
    emailDelivery: EmailDelivery | null;
    audioStorage: AudioStorage | null;
    isDemo: boolean;
    setEmailDelivery: (mode: EmailDelivery) => void;
    setAudioStorage: (mode: AudioStorage) => void;
    setIsDemo: (isDemo: boolean) => void;
    isEmailManual: () => boolean;
    isAudioStorageAvailable: () => boolean;
}

export const usePlatformConfigStore = create<PlatformConfigState>((set, get) => ({
    emailDelivery: null,
    audioStorage: null,
    // Opposite default to audioStorage below: absent or unreadable config means
    // "not a demo". Showing a demo banner on an instance that never asked for
    // one is the failure that matters here, so it takes an explicit true.
    isDemo: false,
    setEmailDelivery: (mode) => set({ emailDelivery: mode }),
    setAudioStorage: (mode) => set({ audioStorage: mode }),
    setIsDemo: (isDemo) => set({ isDemo }),
    isEmailManual: () => get().emailDelivery === 'manual',
    // null = not yet loaded: default to available so a transient /api/config
    // failure never suppresses audio on a correctly-configured instance.
    isAudioStorageAvailable: () => get().audioStorage !== 'unavailable',
}));
