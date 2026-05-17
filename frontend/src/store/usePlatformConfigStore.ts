import { create } from 'zustand';
import type { PublicConfigEmailDelivery } from '@/api/model/publicConfigEmailDelivery';

type EmailDelivery = PublicConfigEmailDelivery;

interface PlatformConfigState {
    emailDelivery: EmailDelivery | null;
    setEmailDelivery: (mode: EmailDelivery) => void;
    isEmailManual: () => boolean;
}

export const usePlatformConfigStore = create<PlatformConfigState>((set, get) => ({
    emailDelivery: null,
    setEmailDelivery: (mode) => set({ emailDelivery: mode }),
    isEmailManual: () => get().emailDelivery === 'manual',
}));
