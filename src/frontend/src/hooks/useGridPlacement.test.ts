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

    it('is a no-op when a card is dropped onto its own slot in a full column', () => {
        // Card 1 sits at 0,0 in a full column (0,0 + 0,1 occupied). Dropping it
        // back onto 0,0 must NOT route into swapCardsInGrid(1, 1), which would
        // duplicate the card in qsort.
        const responses = {
            qsort: [
                { statementId: 1, col: 0, row: 0 },
                { statementId: 2, col: 0, row: 1 },
            ],
        };
        const { result } = renderHook(() =>
            useGridPlacement({ responses, gridColumns, actions: mockActions })
        );

        const placed = result.current.handlePlacement(1, 0, 0);

        expect(placed).toBe(false);
        expect(mockActions.swapCardsInGrid).not.toHaveBeenCalled();
        expect(mockActions.moveCardInGrid).not.toHaveBeenCalled();
        expect(mockActions.placeCardInGrid).not.toHaveBeenCalled();
    });

    it('is a no-op when a card is dropped onto its own slot in a non-full column', () => {
        // Card 1 alone at 0,0 (column not full). Dropping it back onto 0,0 must
        // not shuffle it to another row.
        const responses = { qsort: [{ statementId: 1, col: 0, row: 0 }] };
        const { result } = renderHook(() =>
            useGridPlacement({ responses, gridColumns, actions: mockActions })
        );

        const placed = result.current.handlePlacement(1, 0, 0);

        expect(placed).toBe(false);
        expect(mockActions.moveCardInGrid).not.toHaveBeenCalled();
    });

    it('returns true when a card is actually placed', () => {
        const responses = { qsort: [] };
        const { result } = renderHook(() =>
            useGridPlacement({ responses, gridColumns, actions: mockActions })
        );

        expect(result.current.handlePlacement(1, 0, 0)).toBe(true);
    });

    // --- Free distribution mode: placement past declared capacity ---

    it('finds an empty row past declared capacity in free mode (overflow placement)', () => {
        // Column 0 has declared capacity 2 but is fully filled — in free mode
        // the placement should overflow to row 2 (past capacity), not swap.
        const responses = {
            qsort: [
                { statementId: 2, col: 0, row: 0 },
                { statementId: 3, col: 0, row: 1 },
            ],
        };
        const { result } = renderHook(() =>
            useGridPlacement({
                responses,
                gridColumns,
                actions: mockActions,
                distributionMode: 'free',
            })
        );

        // findClosestEmptyRow should return row 2 (past declared capacity 2)
        const targetRow = result.current.findClosestEmptyRow(0, 0);
        expect(targetRow).toBe(2);
    });

    it('places a card past declared capacity in free mode without swapping', () => {
        // Column full to capacity (2) — in free mode, dropping a fresh card
        // there should overflow into row 2, never trigger swap/unplace.
        const responses = {
            qsort: [
                { statementId: 2, col: 0, row: 0 },
                { statementId: 3, col: 0, row: 1 },
            ],
        };
        const { result } = renderHook(() =>
            useGridPlacement({
                responses,
                gridColumns,
                actions: mockActions,
                distributionMode: 'free',
            })
        );

        result.current.handlePlacement(1, 0, 0);

        // Expected: card 1 lands in (0, 2) — overflow row past capacity.
        expect(mockActions.placeCardInGrid).toHaveBeenCalledWith(1, 0, 2);
        expect(mockActions.swapCardsInGrid).not.toHaveBeenCalled();
        expect(mockActions.unplaceCard).not.toHaveBeenCalled();
    });

    it('forced mode is unchanged: finds no empty row past capacity', () => {
        const responses = {
            qsort: [
                { statementId: 2, col: 0, row: 0 },
                { statementId: 3, col: 0, row: 1 },
            ],
        };
        const { result } = renderHook(() =>
            useGridPlacement({
                responses,
                gridColumns,
                actions: mockActions,
                distributionMode: 'forced',
            })
        );

        const targetRow = result.current.findClosestEmptyRow(0, 0);
        expect(targetRow).toBeNull();
    });
});
