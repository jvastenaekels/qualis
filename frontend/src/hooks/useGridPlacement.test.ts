import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useGridPlacement } from './useGridPlacement';

describe('useGridPlacement', () => {
    const mockActions = {
        placeCardInGrid: vi.fn(),
        moveCardInGrid: vi.fn(),
        swapCardsInGrid: vi.fn(),
        unplaceCard: vi.fn(),
    };

    const gridColumns = [
        { capacity: 2 }, // Col 0
        { capacity: 2 }, // Col 1
    ];

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('places a card in an empty slot', () => {
        const responses = { qsort: [] };
        const { result } = renderHook(() =>
            useGridPlacement({ responses, gridColumns, actions: mockActions })
        );

        result.current.handlePlacement(1, 0, 0);

        // Should place directly
        expect(mockActions.placeCardInGrid).toHaveBeenCalledWith(1, 0, 0);
        expect(mockActions.moveCardInGrid).not.toHaveBeenCalled();
    });

    it('places a card in the closest empty slot if target is occupied', () => {
        const responses = {
            qsort: [{ statementId: 2, col: 0, row: 0 }],
        };
        const { result } = renderHook(() =>
            useGridPlacement({ responses, gridColumns, actions: mockActions })
        );

        // Try placing at 0,0 (occupied). Closest empty is 0,1.
        result.current.handlePlacement(1, 0, 0);

        expect(mockActions.placeCardInGrid).toHaveBeenCalledWith(1, 0, 1);
    });

    it('replaces an existing card if column is completely full (Deck to Grid)', () => {
        const responses = {
            qsort: [
                { statementId: 2, col: 0, row: 0 },
                { statementId: 3, col: 0, row: 1 },
            ],
        };
        const { result } = renderHook(() =>
            useGridPlacement({ responses, gridColumns, actions: mockActions })
        );

        // Try placing card 1 (from deck) at 0,0 (occupied, and col full).
        result.current.handlePlacement(1, 0, 0);

        // Should unplace existing card (2) and place new card (1)
        expect(mockActions.unplaceCard).toHaveBeenCalledWith(2);
        expect(mockActions.placeCardInGrid).toHaveBeenCalledWith(1, 0, 0);
        expect(mockActions.swapCardsInGrid).not.toHaveBeenCalled();
    });

    it('swaps cards if column is full (Grid to Grid)', () => {
        const responses = {
            qsort: [
                { statementId: 2, col: 0, row: 0 },
                { statementId: 3, col: 0, row: 1 },
                { statementId: 1, col: 1, row: 0 }, // Card 1 is already in grid (Col 1)
            ],
        };
        const { result } = renderHook(() =>
            useGridPlacement({ responses, gridColumns, actions: mockActions })
        );

        // Move card 1 to 0,0
        result.current.handlePlacement(1, 0, 0);

        // Should swap 1 and 2
        expect(mockActions.swapCardsInGrid).toHaveBeenCalledWith(1, 2);
        expect(mockActions.unplaceCard).not.toHaveBeenCalled();
    });
});
