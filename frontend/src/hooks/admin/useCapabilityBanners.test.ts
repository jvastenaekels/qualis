import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { AllTheProviders } from '@/test-utils/test-utils';
import { usePlatformConfigStore } from '@/store/usePlatformConfigStore';
import { useCapabilityBanners, CAPABILITY_BANNERS_STORAGE_KEY } from './useCapabilityBanners';

function setPlatform(
    emailDelivery: 'smtp' | 'manual' | null,
    audioStorage: 'available' | 'unavailable' | null
) {
    usePlatformConfigStore.setState({ emailDelivery, audioStorage });
}

describe('useCapabilityBanners', () => {
    beforeEach(() => {
        localStorage.clear();
        setPlatform('smtp', 'available');
    });

    it('no degraded capability → empty, count 0', () => {
        const { result } = renderHook(() => useCapabilityBanners(), { wrapper: AllTheProviders });
        expect(result.current.capabilities).toEqual([]);
        expect(result.current.count).toBe(0);
    });

    it('smtp manual only → [smtp]', () => {
        setPlatform('manual', 'available');
        const { result } = renderHook(() => useCapabilityBanners(), { wrapper: AllTheProviders });
        expect(result.current.capabilities.map((c) => c.id)).toEqual(['smtp']);
        expect(result.current.count).toBe(1);
    });

    it('s3 unavailable only → [s3]', () => {
        setPlatform('smtp', 'unavailable');
        const { result } = renderHook(() => useCapabilityBanners(), { wrapper: AllTheProviders });
        expect(result.current.capabilities.map((c) => c.id)).toEqual(['s3']);
    });

    it('both degraded → stable order [smtp, s3]', () => {
        setPlatform('manual', 'unavailable');
        const { result } = renderHook(() => useCapabilityBanners(), { wrapper: AllTheProviders });
        expect(result.current.capabilities.map((c) => c.id)).toEqual(['smtp', 's3']);
        expect(result.current.capabilities[0].guideHref).toBe(
            '/docs/guides/running-without-smtp.md'
        );
        expect(result.current.capabilities[1].guideHref).toBe('/docs/guides/running-without-s3.md');
    });

    it('defaults to expanded', () => {
        setPlatform('manual', 'available');
        const { result } = renderHook(() => useCapabilityBanners(), { wrapper: AllTheProviders });
        expect(result.current.collapsed).toBe(false);
    });

    it('setCollapsed(true) persists to localStorage with the capability signature', () => {
        setPlatform('manual', 'available');
        const { result } = renderHook(() => useCapabilityBanners(), { wrapper: AllTheProviders });
        act(() => result.current.setCollapsed(true));
        expect(result.current.collapsed).toBe(true);
        const stored = JSON.parse(localStorage.getItem(CAPABILITY_BANNERS_STORAGE_KEY) as string);
        expect(stored).toEqual({ collapsed: true, sig: 'smtp' });
    });

    it('restores collapsed when the stored signature matches', () => {
        setPlatform('manual', 'available');
        localStorage.setItem(
            CAPABILITY_BANNERS_STORAGE_KEY,
            JSON.stringify({ collapsed: true, sig: 'smtp' })
        );
        const { result } = renderHook(() => useCapabilityBanners(), { wrapper: AllTheProviders });
        expect(result.current.collapsed).toBe(true);
    });

    it('ignores stale collapsed and re-expands when the signature changed', () => {
        setPlatform('manual', 'unavailable'); // sig now "smtp,s3"
        localStorage.setItem(
            CAPABILITY_BANNERS_STORAGE_KEY,
            JSON.stringify({ collapsed: true, sig: 'smtp' })
        );
        const { result } = renderHook(() => useCapabilityBanners(), { wrapper: AllTheProviders });
        expect(result.current.collapsed).toBe(false);
    });
});
