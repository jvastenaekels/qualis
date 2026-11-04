import {
    safeBrowserSessionStorage,
    setStudyStorageScope,
    withoutStudyStorageWrites,
} from '../store/safeStorage';
import { useSessionStore } from '../store/useSessionStore';
import { useConfigStore } from '../store/useConfigStore';
import { useResponseStore } from '../store/useResponseStore';
import { useUIStore } from '../store/useUIStore';
import { queryClient } from '../lib/queryClient';

interface ResetOptions {
    skipConfig?: boolean;
}

export const resetAllStores = (options: ResetOptions = {}) => {
    useSessionStore.getState().resetSession();
    if (!options.skipConfig) {
        useConfigStore.getState().resetConfig();
    }
    useResponseStore.getState().resetResponses();
    useUIStore.getState().resetUI();
    queryClient.clear();
};

/** Switch local sessions only while the participant subtree is unmounted. */
export function restoreStudySession(slug: string): void {
    setStudyStorageScope(slug);
    // Reset memory to defaults without erasing the destination's persisted state.
    withoutStudyStorageWrites(() =>
        resetAllStores({ skipConfig: useConfigStore.getState().config?.slug === slug })
    );
    // Both adapters use synchronous localStorage: hydrate both slices in one
    // turn so another navigation cannot interleave session and answer hydration.
    void useSessionStore.persist.rehydrate();
    void useResponseStore.persist.rehydrate();
    if (new URLSearchParams(window.location.search).get('mode') === 'test') {
        safeBrowserSessionStorage.setItem('qualis-pilot-mode', 'true');
        useSessionStore.getState().setPilotMode(true);
    }
}
