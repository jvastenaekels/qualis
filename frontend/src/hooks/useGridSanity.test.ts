import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useGridSanity } from './useGridSanity';

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
});
