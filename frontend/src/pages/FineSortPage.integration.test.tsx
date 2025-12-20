/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import FineSortPage from './FineSortPage';
import { useStudyStore } from '../store/useStudyStore';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import StudyLayout from '../layouts/StudyLayout';

// Mock Store
vi.mock('../store/useStudyStore', () => ({
    useStudyStore: Object.assign(vi.fn(), {
        getState: vi.fn(() => ({
            session: { token: null, hasConsented: true, currentStep: 4, isSaving: false },
            resetSession: vi.fn(),
        })),
        setState: vi.fn(),
        subscribe: vi.fn(),
    }),
}));
const mockUseStudyStore = useStudyStore as unknown as ReturnType<typeof vi.fn>;

// Mock useStudyConfig
vi.mock('../hooks/useStudyConfig', () => ({
    useStudyConfig: vi.fn(() => ({ isLoading: false, error: null, retry: vi.fn() }))
}));

// Mock translation
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
    Trans: ({ children, i18nKey }: any) => children || i18nKey,
    initReactI18next: { type: '3rdParty', init: () => {} }
}));

// Mock Drag and Drop (difficult to test full drag interaction in unit tests, so we mock basics)
// Or we just test that the button renders if we mock the STATE as empty.

// Mock GridSort to avoid complex DND logic in integration tests
vi.mock('../components/GridSort', () => ({
    default: () => <div data-testid="grid-sort">GridSort</div>
}));

// Mock ResizeObserver
global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

describe('FineSortPage Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const mockConfig = {
        statements: [
            { id: 1, text: 'S1' },
            { id: 2, text: 'S2' }
        ],
        grid_config: [{ score: 0, capacity: 2 }]
    };

    it('renders "Finish Sorting" button in Header when grid is full', () => {
        // Mock State: All cards placed
        // placed in grid -> responses.qsort
        // piles empty -> responses.rough
        mockUseStudyStore.mockReturnValue({
            config: mockConfig,
            responses: {
                rough: { agree: [], disagree: [], neutral: [] },
                qsort: [
                    { statementId: 1, col: 0, row: 0 },
                    { statementId: 2, col: 0, row: 1 }
                ]
            },
            session: { hasConsented: true, currentStep: 4, isSaving: false },
            setStep: vi.fn(),
            placeCardInGrid: vi.fn(),
            moveCardInGrid: vi.fn(),
            swapCardsInGrid: vi.fn(),
            unplaceCard: vi.fn(),
            resetFineSort: vi.fn()
        });

        render(
            <MemoryRouter initialEntries={['/study/demo/sort/fine']}>
                <Routes>
                    <Route path="/study/:slug" element={<StudyLayout />}>
                        <Route path="sort/fine" element={<FineSortPage />} />
                    </Route>
                </Routes>
            </MemoryRouter>
        );

        // Check for Header Action (Desktop/Mobile)
        // Since we are validating behaviors, we look for "fine.actions.finish" or "fine.actions.validate"
        // Logic says: if isAllPlaced -> "Validate"
        expect(screen.getAllByText(/fine.actions.validate/i).length).toBeGreaterThan(0);
        
        // It should be enabled
        const btns = screen.getAllByRole('button', { name: /fine.actions.validate/i });
        btns.forEach(btn => expect((btn as HTMLButtonElement).disabled).toBe(false));
    });

    it('renders disabled "Finish Sorting" button when grid is NOT full', () => {
        // Mock State: Cards remaining in Neutral pile
        mockUseStudyStore.mockReturnValue({
            config: mockConfig,
            responses: {
                rough: { agree: [], disagree: [], neutral: [1, 2] }, // Just IDs usually in real app, but logic depends on mapping
                qsort: []
            },
            // Note: In FineSortPage:
            // const unplacedNeutral = responses.rough.neutral... map id to statement
            session: { hasConsented: true, currentStep: 4, isSaving: false },
            setStep: vi.fn(),
            resetFineSort: vi.fn()
        });

        render(
            <MemoryRouter initialEntries={['/study/demo/sort/fine']}>
                <Routes>
                    <Route path="/study/:slug" element={<StudyLayout />}>
                        <Route path="sort/fine" element={<FineSortPage />} />
                    </Route>
                </Routes>
            </MemoryRouter>
        );

        // Logic says: if !isAllPlaced -> "Finish Sorting"
        // Note: StudyLayout might render it twice (Header + Mobile Footer), so we allow multiple.
        const btns = screen.getAllByRole('button', { name: /fine.actions.finish/i });
        expect(btns.length).toBeGreaterThan(0);
        
        // They should be disabled
        btns.forEach(btn => expect((btn as HTMLButtonElement).disabled).toBe(true));
    });
});
