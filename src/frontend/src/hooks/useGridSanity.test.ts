import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { useGridSanity } from './useGridSanity';

vi.mock('sonner', () => ({
    toast: {
        warning: vi.fn(),
        success: vi.fn(),
        error: vi.fn(),
    },
}));

describe('useGridSanity', () => {
    const mockUnplaceCard = vi.fn();
    const mockCategorizeCard = vi.fn();

    const gridColumns = [
        { capacity: 2 }, // Col 0
        { capacity: 2 }, // Col 1
    ];

    it('does nothing if grid is valid', () => {
        const qsort = [
            { statementId: 1, col: 0, row: 0 },
            { statementId: 2, col: 0, row: 1 },
        ];

        renderHook(() =>
            useGridSanity({
                qsort,
                gridColumns,
                unplaceCard: mockUnplaceCard,
                categorizeCard: mockCategorizeCard,
            })
        );

        expect(mockUnplaceCard).not.toHaveBeenCalled();
    });

    it('removes overlapping cards', () => {
        const qsort = [
            { statementId: 1, col: 0, row: 0 },
            { statementId: 2, col: 0, row: 0 }, // Overlap!
        ];

        renderHook(() =>
            useGridSanity({
                qsort,
                gridColumns,
                unplaceCard: mockUnplaceCard,
                categorizeCard: mockCategorizeCard,
            })
        );

        // Should unplace the second card (2) because it was seen second
        expect(mockUnplaceCard).toHaveBeenCalledWith(2);
        expect(mockCategorizeCard).toHaveBeenCalledWith(2, 'neutral');
        // First card should stay
        expect(mockUnplaceCard).not.toHaveBeenCalledWith(1);
    });

    it('removes out-of-bounds cards (row too high)', () => {
        const qsort = [
            { statementId: 1, col: 0, row: 5 }, // Capacity is 2
        ];

        renderHook(() =>
            useGridSanity({
                qsort,
                gridColumns,
                unplaceCard: mockUnplaceCard,
                categorizeCard: mockCategorizeCard,
            })
        );

        expect(mockUnplaceCard).toHaveBeenCalledWith(1);
        expect(mockCategorizeCard).toHaveBeenCalledWith(1, 'neutral');
    });

    it('removes out-of-bounds cards (col invalid)', () => {
        const qsort = [
            { statementId: 1, col: 5, row: 0 }, // No column 5
        ];

        renderHook(() =>
            useGridSanity({
                qsort,
                gridColumns,
                unplaceCard: mockUnplaceCard,
                categorizeCard: mockCategorizeCard,
            })
        );

        expect(mockUnplaceCard).toHaveBeenCalledWith(1);
        expect(mockCategorizeCard).toHaveBeenCalledWith(1, 'neutral');
    });

    it('keeps overflow rows in free mode (row past capacity is allowed)', () => {
        const unplaceCard = vi.fn();
        const categorizeCard = vi.fn();
        const qsort = [
            { statementId: 1, col: 0, row: 0 },
            { statementId: 2, col: 0, row: 1 },
            { statementId: 3, col: 0, row: 2 }, // overflow: capacity is 2
        ];

        renderHook(() =>
            useGridSanity({
                qsort,
                gridColumns,
                unplaceCard,
                categorizeCard,
                distributionMode: 'free',
            })
        );

        expect(unplaceCard).not.toHaveBeenCalled();
        expect(categorizeCard).not.toHaveBeenCalled();
    });

    it('still removes negative-row cards in free mode (genuine bounds error)', () => {
        const unplaceCard = vi.fn();
        const categorizeCard = vi.fn();
        const qsort = [{ statementId: 1, col: 0, row: -1 }];

        renderHook(() =>
            useGridSanity({
                qsort,
                gridColumns,
                unplaceCard,
                categorizeCard,
                distributionMode: 'free',
            })
        );

        expect(unplaceCard).toHaveBeenCalledWith(1);
        expect(categorizeCard).toHaveBeenCalledWith(1, 'neutral');
    });

    it('still removes invalid-col cards in free mode', () => {
        const unplaceCard = vi.fn();
        const categorizeCard = vi.fn();
        const qsort = [{ statementId: 1, col: 99, row: 0 }];

        renderHook(() =>
            useGridSanity({
                qsort,
                gridColumns,
                unplaceCard,
                categorizeCard,
                distributionMode: 'free',
            })
        );

        expect(unplaceCard).toHaveBeenCalledWith(1);
        expect(categorizeCard).toHaveBeenCalledWith(1, 'neutral');
    });

    it('still flags overlap in free mode', () => {
        const unplaceCard = vi.fn();
        const categorizeCard = vi.fn();
        const qsort = [
            { statementId: 1, col: 0, row: 5 }, // overflow row
            { statementId: 2, col: 0, row: 5 }, // overlap on overflow row
        ];

        renderHook(() =>
            useGridSanity({
                qsort,
                gridColumns,
                unplaceCard,
                categorizeCard,
                distributionMode: 'free',
            })
        );

        expect(unplaceCard).toHaveBeenCalledWith(2);
        expect(unplaceCard).not.toHaveBeenCalledWith(1);
    });

    it('shows a toast when cards are removed (no longer silent)', () => {
        vi.mocked(toast.warning).mockClear();
        const unplaceCard = vi.fn();
        const categorizeCard = vi.fn();
        const qsort = [
            { statementId: 1, col: 0, row: 5 }, // out of bounds (capacity 2, forced)
        ];

        renderHook(() =>
            useGridSanity({
                qsort,
                gridColumns,
                unplaceCard,
                categorizeCard,
            })
        );

        expect(unplaceCard).toHaveBeenCalledWith(1);
        expect(toast.warning).toHaveBeenCalled();
    });

    it('does not show a toast when the grid is valid', () => {
        vi.mocked(toast.warning).mockClear();
        const unplaceCard = vi.fn();
        const categorizeCard = vi.fn();
        const qsort = [{ statementId: 1, col: 0, row: 0 }];

        renderHook(() =>
            useGridSanity({
                qsort,
                gridColumns,
                unplaceCard,
                categorizeCard,
            })
        );

        expect(toast.warning).not.toHaveBeenCalled();
    });
});
