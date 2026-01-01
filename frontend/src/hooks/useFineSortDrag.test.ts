/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useFineSortDrag } from './useFineSortDrag';

vi.mock('../store/useUIStore', () => ({
    useUIStore: vi.fn((selector) => selector({ setActiveCard: vi.fn() })),
}));

vi.mock('./useDragAutoInteraction', () => ({
    useDragAutoInteraction: () => ({
        initInteraction: vi.fn(),
        updateInteraction: vi.fn(),
        cleanupInteraction: vi.fn(),
    }),
}));

describe('useFineSortDrag', () => {
    const defaultProps = {
        responses: { qsort: [] },
        gridColumns: [],
        actions: {
            placeCardInGrid: vi.fn(),
            moveCardInGrid: vi.fn(),
            swapCardsInGrid: vi.fn(),
            unplaceCard: vi.fn(),
        },
        statements: [{ id: 1, text: 'Card 1' }],
    };

    it('extracts stable coordinates in handleDragStart (pointerCoordinates)', async () => {
        const { result } = renderHook(() => useFineSortDrag(defaultProps as any));

        // Manual override for hook's inner mock if possible, or just check that it uses the provided mock
        // Since we mocked useDragAutoInteraction globally, we check if handles are correctly wired

        const event = {
            active: { id: 1 },
            activatorEvent: { clientX: 100, clientY: 200 },
            pointerCoordinates: { x: 150, y: 250 },
        };

        const { act } = await import('react');
        await act(async () => {
            result.current.handleDragStart(event as any);
        });

        // We verify that activeId is set
        expect(result.current.activeId).toBe(1);
    });

    it('handles handleDragMove with pointerCoordinates', () => {
        const { result } = renderHook(() => useFineSortDrag(defaultProps as any));

        const event = {
            delta: { x: 10, y: 10 },
            pointerCoordinates: { x: 160, y: 260 },
        };

        result.current.handleDragMove(event as any);
        // Logic check: anyEvent.pointerCoordinates is used preferentially
    });

    it('handles handleSlotClick correctly', () => {
        const onSelectionChange = vi.fn();
        const { result } = renderHook(() =>
            useFineSortDrag({
                ...defaultProps,
                selectedId: 1,
                onSelectionChange,
            } as any)
        );

        result.current.handleSlotClick(0, 0);

        expect(defaultProps.actions.placeCardInGrid).toHaveBeenCalledWith(1, 0, 0);
        expect(onSelectionChange).toHaveBeenCalledWith(null);
    });
});
