
import { renderHook, act } from '@testing-library/react';
import { useFineSortDrag } from './useFineSortDrag';
import { vi, describe, it, expect } from 'vitest';

describe('useFineSortDrag', () => {
    const mockActions = {
        placeCardInGrid: vi.fn(),
        moveCardInGrid: vi.fn(),
        swapCardsInGrid: vi.fn(),
        unplaceCard: vi.fn(),
    };

    const mockGridColumns = [
        { capacity: 2 }, // Col 0
        { capacity: 1 }, // Col 1
    ];

    it('should place card in empty slot', () => {
        const responses = { qsort: [] };
        const { result } = renderHook(() => useFineSortDrag({ 
            responses, 
            gridColumns: mockGridColumns, 
            actions: mockActions 
        }));

        act(() => {
            result.current.handleDragEnd({
                active: { id: 101 } as any,
                over: { id: 'slot_0_0' } as any,
            } as any);
        });

        expect(mockActions.placeCardInGrid).toHaveBeenCalledWith(101, 0, 0);
    });

    it('should redirect to closest empty row if target is occupied but column has space', () => {
        const responses = { qsort: [{ statementId: 200, col: 0, row: 0 }] }; // Slot 0_0 occupied
        const { result } = renderHook(() => useFineSortDrag({ 
            responses, 
            gridColumns: mockGridColumns, 
            actions: mockActions 
        }));

        act(() => {
            // Drag to 0_0 (Occupied) -> Should go to 0_1 (Empty)
            result.current.handleDragEnd({
                active: { id: 101 } as any,
                over: { id: 'slot_0_0' } as any,
            } as any);
        });

        expect(mockActions.placeCardInGrid).toHaveBeenCalledWith(101, 0, 1);
    });

    it('should swap cards if column is full and both cards are in grid', () => {
        // Col 1 has capacity 1.
        // Card 200 is at 1_0.
        // Drag Card 300 (which is at 0_0) to 1_0.
        const responses = { 
            qsort: [
                { statementId: 200, col: 1, row: 0 },
                { statementId: 300, col: 0, row: 0 }
            ] 
        };
        const { result } = renderHook(() => useFineSortDrag({ 
            responses, 
            gridColumns: mockGridColumns, 
            actions: mockActions 
        }));

        act(() => {
            result.current.handleDragEnd({
                active: { id: 300 } as any,
                over: { id: 'slot_1_0' } as any,
            } as any);
        });

        expect(mockActions.swapCardsInGrid).toHaveBeenCalledWith(300, 200);
    });

    it('should kick existing card to deck if column is full and dragged card is from deck', () => {
        // Col 1 has capacity 1.
        // Card 200 is at 1_0.
        // Drag Card 101 (from Deck) to 1_0.
        const responses = { 
            qsort: [
                { statementId: 200, col: 1, row: 0 }
            ] 
        };
        const { result } = renderHook(() => useFineSortDrag({ 
            responses, 
            gridColumns: mockGridColumns, 
            actions: mockActions 
        }));

        act(() => {
            result.current.handleDragEnd({
                active: { id: 101 } as any,
                over: { id: 'slot_1_0' } as any,
            } as any);
        });

        expect(mockActions.unplaceCard).toHaveBeenCalledWith(200);
        expect(mockActions.placeCardInGrid).toHaveBeenCalledWith(101, 1, 0);
    });
});
