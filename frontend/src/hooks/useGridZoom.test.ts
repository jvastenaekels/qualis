/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { renderHook } from '@testing-library/react';
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

const mockSetHasPerformedZonalFocus = vi.fn();
const mockOnZoomChange = vi.fn();
const mockOnTransformChange = vi.fn();

const defaultProps = {
    wrapperRef: { current: document.createElement('div') },
    contentRef: { current: document.createElement('div') },
    pyramidRef: { current: document.createElement('div') },
    gridColumns: [{ score: 0, capacity: 1 }],
    activePile: 'neutral' as const,
    activePileCount: 1,
    hasPerformedZonalFocus: false,
    setHasPerformedZonalFocus: mockSetHasPerformedZonalFocus,
    onZoomChange: mockOnZoomChange,
    onTransformChange: mockOnTransformChange,
};

// Mock useRef to return our mock for the first call
vi.mock('react', async () => {
    const actual = await vi.importActual('react');
    return {
        ...actual,
        useRef: (initial: any) => {
            // The first ref created in useGridZoom is transformRef
            if (initial === null) {
                return { current: mockTransformRef };
            }
            // biome-ignore lint/correctness/useHookAtTopLevel: This is a mock
            return (actual as any).useRef(initial);
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
        const { result } = renderHook(() => useGridZoom(defaultProps));
        expect(result.current.transformRef).toBeDefined();
    });

    it('performs auto-fit on desktop correctly', () => {
        const { result } = renderHook(() => useGridZoom(defaultProps));

        result.current.performAutoFit();

        expect(mockTransformRef.setTransform).toHaveBeenCalled();
        const [_x, _y, scale] = mockTransformRef.setTransform.mock.calls[0];

        // Desktop scale logic: min(scaleX, scaleY, 1.1)
        // expected scale = 1.1 (clamped)
        expect(scale).toBe(1.1);
    });

    it('performs auto-fit on mobile correctly', () => {
        global.window.innerWidth = 500; // Mobile
        const { result } = renderHook(() => useGridZoom(defaultProps));

        result.current.performAutoFit();

        expect(mockTransformRef.setTransform).toHaveBeenCalled();
        const [_x, _y, scale] = mockTransformRef.setTransform.mock.calls[0];

        // Scale is min(1.96, ...) -> around 1.96
        expect(scale).toBeGreaterThan(1.0);
    });

    it('triggers zonal focus sequence when enabled', async () => {
        vi.useFakeTimers();
        const props = { ...defaultProps, hasPerformedZonalFocus: true };

        // Mock getElementById for target column
        const mockColumn = document.createElement('div');
        vi.spyOn(document, 'getElementById').mockReturnValue(mockColumn);
        vi.spyOn(mockColumn, 'getBoundingClientRect').mockReturnValue({
            left: 400,
            top: 400,
            width: 100,
            height: 100,
        } as any);
        vi.spyOn(defaultProps.contentRef.current as any, 'getBoundingClientRect').mockReturnValue({
            left: 0,
            top: 0,
            width: 500,
            height: 400,
        } as any);

        renderHook(() => useGridZoom(props));

        // Advance time to trigger Step 2 (Step 1 is mount)
        vi.advanceTimersByTime(501);

        expect(mockTransformRef.setTransform).toHaveBeenCalled();
        expect(mockSetHasPerformedZonalFocus).toHaveBeenCalledWith(false);

        vi.useRealTimers();
    });
});
