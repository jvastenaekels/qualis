/*
 * Libre-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Unit tests for useFineSort hook.
 *
 * These tests cover the durable logic (step setting, navigation guard,
 * reconciliation, derived data) without rendering any JSX.
 * Integration of hook + JSX is tested by the existing FineSortPage test files.
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StudyConfig } from '../../schemas/study';
import { useConfigStore } from '../../store/useConfigStore';
import { useResponseStore } from '../../store/useResponseStore';
import { useSessionStore } from '../../store/useSessionStore';
import { AllTheProviders } from '../../test-utils/test-utils';
import { useFineSort } from './useFineSort';

// ── Mocks ─────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
        useParams: () => ({ slug: 'test-study' }),
    };
});

vi.mock('../useLayout', () => ({
    useLayoutAction: () => ({ setHeaderAction: vi.fn() }),
}));

vi.mock('../useGridSanity', () => ({
    useGridSanity: vi.fn(),
}));

vi.mock('../useFineSortDrag', () => ({
    useFineSortDrag: () => ({
        activeId: null,
        handleDragStart: vi.fn(),
        handleDragMove: vi.fn(),
        handleDragEnd: vi.fn(),
        handleDragCancel: vi.fn(),
        handleCardClick: vi.fn(),
        handleSlotClick: vi.fn(),
        findClosestEmptyRow: vi.fn(),
    }),
}));

// ── Fixtures ───────────────────────────────────────────────────────

const mockConfig: StudyConfig = {
    slug: 'test-study',
    title: 'Test Study',
    description: 'Desc',
    instructions: 'Instructions',
    presort_config: {},
    statements: [
        { id: 1, text: 'Statement 1' },
        { id: 2, text: 'Statement 2' },
        { id: 3, text: 'Statement 3' },
    ],
    grid_config: [
        { score: -1, capacity: 1 },
        { score: 0, capacity: 1 },
        { score: 1, capacity: 1 },
    ],
};

// ── Tests ──────────────────────────────────────────────────────────

describe('useFineSort', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useConfigStore.getState().setConfig(mockConfig);
        useResponseStore.getState().resetResponses();
        useSessionStore.getState().resetSession();
        useSessionStore.getState().setConsent(true);

        // Seed rough sort so the navigation guard doesn't fire
        useResponseStore.getState().categorizeCard(1, 'agree');
        useResponseStore.getState().categorizeCard(2, 'disagree');
        useResponseStore.getState().categorizeCard(3, 'neutral');
    });

    it('sets step to 4 on mount', () => {
        renderHook(() => useFineSort(null), { wrapper: AllTheProviders });
        expect(useSessionStore.getState().currentStep).toBe(4);
    });

    it('computes correct unplaced card groups', () => {
        // Cards 1 (agree) and 2 (disagree) unplaced; 3 (neutral) placed in grid
        useResponseStore.getState().placeCardInGrid(3, 1, 0);

        const { result } = renderHook(() => useFineSort(null), { wrapper: AllTheProviders });

        expect(result.current.unplacedAgree).toHaveLength(1);
        expect(result.current.unplacedAgree[0].id).toBe(1);
        expect(result.current.unplacedDisagree).toHaveLength(1);
        expect(result.current.unplacedDisagree[0].id).toBe(2);
        expect(result.current.unplacedNeutral).toHaveLength(0); // card 3 is placed
    });

    it('isAllPlaced is false when cards remain in decks', () => {
        const { result } = renderHook(() => useFineSort(null), { wrapper: AllTheProviders });
        // No cards placed in grid → not all placed
        expect(result.current.isAllPlaced).toBe(false);
    });

    it('isAllPlaced is true when all cards are in the grid', () => {
        useResponseStore.getState().placeCardInGrid(1, 2, 0);
        useResponseStore.getState().placeCardInGrid(2, 0, 0);
        useResponseStore.getState().placeCardInGrid(3, 1, 0);

        const { result } = renderHook(() => useFineSort(null), { wrapper: AllTheProviders });
        expect(result.current.isAllPlaced).toBe(true);
    });

    it('exposes qsort from the response store', () => {
        useResponseStore.getState().placeCardInGrid(1, 2, 0);

        const { result } = renderHook(() => useFineSort(null), { wrapper: AllTheProviders });

        expect(result.current.qsort).toHaveLength(1);
        expect(result.current.qsort[0]).toMatchObject({ statementId: 1, col: 2, row: 0 });
    });

    it('reconciles missing cards into neutral on mount', async () => {
        // Card 3 is NOT in rough sort buckets (simulate missing card)
        useResponseStore.getState().resetResponses();
        useResponseStore.getState().categorizeCard(1, 'agree');
        useResponseStore.getState().categorizeCard(2, 'disagree');
        // Card 3 is not categorised — reconciliation should add it to neutral

        const { result } = renderHook(() => useFineSort(null), { wrapper: AllTheProviders });

        // After mount the reconciliation effect fires
        await act(async () => {});

        const state = useResponseStore.getState();
        expect(state.rough.neutral).toContain(3);
    });

    it('handleValidate navigates to post-sort', () => {
        const { result } = renderHook(() => useFineSort(null), { wrapper: AllTheProviders });

        act(() => {
            result.current.handleValidate();
        });

        expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('/post-sort'));
    });

    it('Escape key sets selectedCardId to null', () => {
        const { result } = renderHook(() => useFineSort(null), { wrapper: AllTheProviders });

        // First set a selected card via the setter
        act(() => {
            result.current.setSelectedCardId(1);
        });
        expect(result.current.selectedCardId).toBe(1);

        // Then press Escape
        act(() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        });
        expect(result.current.selectedCardId).toBeNull();
    });

    it('navigation guard redirects to rough-sort when no rough data', () => {
        // Clear rough sort (simulate deep-linking directly to fine-sort)
        useResponseStore.getState().resetResponses();

        renderHook(() => useFineSort(null), { wrapper: AllTheProviders });

        expect(mockNavigate).toHaveBeenCalledWith(
            expect.stringContaining('/rough-sort'),
            expect.objectContaining({ replace: true })
        );
    });

    it('uses config grid_config when provided', () => {
        // mockConfig has 3 columns: -1, 0, +1
        const { result } = renderHook(() => useFineSort(null), { wrapper: AllTheProviders });

        expect(result.current.gridColumns).toHaveLength(3);
        expect(result.current.gridColumns[0].score).toBe(-1);
        expect(result.current.gridColumns[2].score).toBe(1);
    });
});
