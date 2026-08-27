/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { renderHook } from '@testing-library/react';
import { AllTheProviders } from '../test-utils/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGridZoom } from './useGridZoom';

const mockTransformRef = {
    setTransform: vi.fn(),
    instance: {
        transformState: {
            scale: 1,
            positionX: 0,
            positionY: 0,
        },
    },
};

const mockOnZoomChange = vi.fn();
const mockOnTransformChange = vi.fn();

const defaultProps = {
    wrapperRef: { current: document.createElement('div') },
    contentRef: { current: document.createElement('div') },
    onZoomChange: mockOnZoomChange,
    onTransformChange: mockOnTransformChange,
};

// Mock useRef to return our mock for the first call
vi.mock('react', async () => {
    const actual = await vi.importActual('react');
    return {
        ...actual,
        useRef: (initial: unknown) => {
            // The first ref created in useGridZoom is transformRef
            if (initial === null) {
                return { current: mockTransformRef };
            }
            // biome-ignore lint/correctness/useHookAtTopLevel: This is a mock
            return (actual as { useRef: (initial: unknown) => unknown }).useRef(initial);
        },
    };
});

describe('useGridZoom', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Setup mock dimensions
        Object.defineProperty(defaultProps.wrapperRef.current, 'clientWidth', {
            value: 1000,
            configurable: true,
        });
        Object.defineProperty(defaultProps.wrapperRef.current, 'clientHeight', {
            value: 800,
            configurable: true,
        });
        Object.defineProperty(defaultProps.contentRef.current, 'offsetWidth', {
            value: 500,
            configurable: true,
        });
        Object.defineProperty(defaultProps.contentRef.current, 'offsetHeight', {
            value: 400,
            configurable: true,
        });

        // Mock window.innerWidth
        global.window.innerWidth = 1200; // Desktop
    });

    it('initializes with transformRef', () => {
        const { result } = renderHook(() => useGridZoom(defaultProps), {
            wrapper: AllTheProviders,
        });
        expect(result.current.transformRef).toBeDefined();
    });

    it('performs auto-fit on desktop correctly', () => {
        const { result } = renderHook(() => useGridZoom(defaultProps), {
            wrapper: AllTheProviders,
        });

        result.current.performAutoFit();

        expect(mockTransformRef.setTransform).toHaveBeenCalled();
        const [_x, _y, scale] = mockTransformRef.setTransform.mock.calls[0];

        // Desktop scale logic: min(scaleX, scaleY, 1.0)
        // expected scale = 1.0 (clamped)
        expect(scale).toBe(1.0);
    });

    it('performs auto-fit on mobile correctly', () => {
        global.window.innerWidth = 500; // Mobile
        const { result } = renderHook(() => useGridZoom(defaultProps), {
            wrapper: AllTheProviders,
        });

        result.current.performAutoFit();

        expect(mockTransformRef.setTransform).toHaveBeenCalled();
        const [_x, _y, scale] = mockTransformRef.setTransform.mock.calls[0];

        // Scale is min(1.96, ...) -> around 1.96
        expect(scale).toBeGreaterThan(1.0);
    });
});
