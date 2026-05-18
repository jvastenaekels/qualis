import { describe, expect, it, beforeEach } from 'vitest';
import { usePlatformConfigStore } from './usePlatformConfigStore';

describe('usePlatformConfigStore — audioStorage', () => {
    beforeEach(() => {
        usePlatformConfigStore.setState({ emailDelivery: null, audioStorage: null });
    });

    it('isAudioStorageAvailable() is true by default (null = safe default)', () => {
        expect(usePlatformConfigStore.getState().isAudioStorageAvailable()).toBe(true);
    });

    it('isAudioStorageAvailable() is false when set to unavailable', () => {
        usePlatformConfigStore.getState().setAudioStorage('unavailable');
        expect(usePlatformConfigStore.getState().isAudioStorageAvailable()).toBe(false);
    });

    it('isAudioStorageAvailable() is true when set to available', () => {
        usePlatformConfigStore.getState().setAudioStorage('available');
        expect(usePlatformConfigStore.getState().isAudioStorageAvailable()).toBe(true);
    });
});
