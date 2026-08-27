import { describe, expect, it, beforeEach } from 'vitest';
import { usePlatformConfigStore } from '@/store/usePlatformConfigStore';

// Pure logic guard: the storage-availability gate is the single predicate
// that suppresses the recorder. Verifying the store predicate that both
// components consume keeps this fast and free of MediaRecorder mocking.
describe('audio storage gate (participant degradation)', () => {
    beforeEach(() => {
        usePlatformConfigStore.setState({ audioStorage: null });
    });

    it('text_audio shows audio when storage available', () => {
        usePlatformConfigStore.getState().setAudioStorage('available');
        const storageOk = usePlatformConfigStore.getState().isAudioStorageAvailable();
        const isTextAudio = true;
        // Mirror showAudioSection: storageOk && (isTextAudio || ...)
        expect(storageOk && (isTextAudio || false)).toBe(true);
    });

    it('text_audio degrades to text-only when storage unavailable', () => {
        usePlatformConfigStore.getState().setAudioStorage('unavailable');
        const storageOk = usePlatformConfigStore.getState().isAudioStorageAvailable();
        const isTextAudio = true;
        expect(storageOk && (isTextAudio || false)).toBe(false);
    });
});
