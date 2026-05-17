import { beforeEach, describe, expect, it } from 'vitest';
import { usePlatformConfigStore } from './usePlatformConfigStore';

describe('usePlatformConfigStore', () => {
    beforeEach(() => {
        usePlatformConfigStore.setState({ emailDelivery: null });
    });

    it('defaults to null before bootstrap', () => {
        expect(usePlatformConfigStore.getState().emailDelivery).toBeNull();
    });

    it('stores the delivery mode', () => {
        usePlatformConfigStore.getState().setEmailDelivery('manual');
        expect(usePlatformConfigStore.getState().emailDelivery).toBe('manual');
    });

    it('isEmailManual reflects the mode', () => {
        usePlatformConfigStore.getState().setEmailDelivery('manual');
        expect(usePlatformConfigStore.getState().isEmailManual()).toBe(true);
        usePlatformConfigStore.getState().setEmailDelivery('smtp');
        expect(usePlatformConfigStore.getState().isEmailManual()).toBe(false);
    });
});
