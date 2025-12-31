/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { renderHook } from '@testing-library/react';
import { useScaleToFit } from './useScaleToFit';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('useScaleToFit', () => {
    let container: HTMLDivElement;
    let content: HTMLDivElement;

    beforeEach(() => {
        container = document.createElement('div');
        content = document.createElement('div');

        // Mock ResizeObserver
        vi.stubGlobal(
            'ResizeObserver',
            vi.fn().mockImplementation(function (_callback) {
                return {
                    observe: vi.fn(),
                    disconnect: vi.fn(),
                    unobserve: vi.fn(),
                };
            })
        );
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should return scale 1 initially/default', () => {
        const { result } = renderHook(() =>
            useScaleToFit({ current: container }, { current: content })
        );
        expect(result.current).toBe(1);
    });

    it('should calculate correct scale when content is larger than container (Zoom Out)', () => {
        // Mock Dimensions
        // Container: 500x500 (minus 64 padding = 436x436)
        Object.defineProperty(container, 'clientWidth', { value: 500, configurable: true });
        Object.defineProperty(container, 'clientHeight', { value: 500, configurable: true });

        // Content: 872x872 (Twice as big)
        Object.defineProperty(content, 'scrollWidth', { value: 872, configurable: true });
        Object.defineProperty(content, 'scrollHeight', { value: 872, configurable: true });

        const { result } = renderHook(() =>
            useScaleToFit({ current: container }, { current: content })
        );

        // Logic: 436 / 872 = 0.5
        // React effect runs asynchronously maybe?
        // ResizeObserver usually triggers callback. The hook triggers handleResize on mount too.

        expect(result.current).toBe(0.5);
    });

    it('should calculate correct scale when content is smaller (Zoom In - Capped at 1.5)', () => {
        // Container: 1000x1000 (minus 64 = 936)
        Object.defineProperty(container, 'clientWidth', { value: 1000, configurable: true });
        Object.defineProperty(container, 'clientHeight', { value: 1000, configurable: true });

        // Content: 468x468
        Object.defineProperty(content, 'scrollWidth', { value: 468, configurable: true });
        Object.defineProperty(content, 'scrollHeight', { value: 468, configurable: true });

        const { result } = renderHook(() =>
            useScaleToFit({ current: container }, { current: content })
        );

        // Logic: 936 / 468 = 2 -> Capped at 1.5
        expect(result.current).toBe(1.5);
    });

    it('should respect the smaller dimension (fit width vs fit height)', () => {
        // Container: 1000w x 500h (minus 64 = 936w x 436h)
        Object.defineProperty(container, 'clientWidth', { value: 1000, configurable: true });
        Object.defineProperty(container, 'clientHeight', { value: 500, configurable: true });

        // Content: 936w x 872h
        // scaleX = 936/936 = 1.0
        // scaleY = 436/872 = 0.5
        // Should choose 0.5
        Object.defineProperty(content, 'scrollWidth', { value: 936, configurable: true });
        Object.defineProperty(content, 'scrollHeight', { value: 872, configurable: true });

        const { result } = renderHook(() =>
            useScaleToFit({ current: container }, { current: content })
        );
        expect(result.current).toBe(0.5);
    });
});
