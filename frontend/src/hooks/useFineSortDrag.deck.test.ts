import type { DragEndEvent } from '@dnd-kit/core';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFineSortDrag } from './useFineSortDrag';

describe('useFineSortDrag - Deck Interactions', () => {
    const mockActions = {
        placeCardInGrid: vi.fn(),
        moveCardInGrid: vi.fn(),
        swapCardsInGrid: vi.fn(),
        unplaceCard: vi.fn(),
        categorizeCard: vi.fn(),
    };

    const mockResponses = {
        qsort: [{ statementId: 1, col: 0, row: 0 }],
    };

    const mockGridColumns = [{ capacity: 2 }];

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('handles dropping a card back to a specific deck pile (legacy ID behavior)', () => {
        const { result } = renderHook(() =>
            useFineSortDrag({
                responses: mockResponses,
                gridColumns: mockGridColumns,
                actions: mockActions,
                statements: [],
            })
        );

        const event = {
            active: { id: 1 },
            over: { id: 'deck-agree' },
        } as DragEndEvent;

        result.current.handleDragEnd(event);

        expect(mockActions.unplaceCard).toHaveBeenCalledWith(1);
        expect(mockActions.categorizeCard).toHaveBeenCalledWith(1, 'agree');
    });

    it('handles dropping a card back to the deck area (new ID behavior with area- prefix)', () => {
        const { result } = renderHook(() =>
            useFineSortDrag({
                responses: mockResponses,
                gridColumns: mockGridColumns,
                actions: mockActions,
                statements: [],
            })
        );

        const event = {
            active: { id: 1 },
            over: { id: 'deck-area-disagree' },
        } as DragEndEvent;

        result.current.handleDragEnd(event);

        expect(mockActions.unplaceCard).toHaveBeenCalledWith(1);
        expect(mockActions.categorizeCard).toHaveBeenCalledWith(1, 'disagree');
    });

    it('ignores drops on non-droppable areas', () => {
        const { result } = renderHook(() =>
            useFineSortDrag({
                responses: mockResponses,
                gridColumns: mockGridColumns,
                actions: mockActions,
                statements: [],
            })
        );

        const event = {
            active: { id: 1 },
            over: null,
        } as DragEndEvent;

        result.current.handleDragEnd(event);

        expect(mockActions.unplaceCard).not.toHaveBeenCalled();
        expect(mockActions.categorizeCard).not.toHaveBeenCalled();
    });
});
