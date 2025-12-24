/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import FineSortPage from './FineSortPage';
import { useConfigStore } from '../store/useConfigStore';
import { useSessionStore } from '../store/useSessionStore';
import { useResponseStore } from '../store/useResponseStore';
import { useUIStore } from '../store/useUIStore';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import StudyLayout from '../layouts/StudyLayout';

// Mock Stores
vi.mock('../store/useConfigStore');
vi.mock('../store/useSessionStore');
vi.mock('../store/useResponseStore');
vi.mock('../store/useUIStore');

const mockUseConfigStore = useConfigStore as unknown as ReturnType<typeof vi.fn>;
const mockUseSessionStore = useSessionStore as unknown as ReturnType<typeof vi.fn>;
const mockUseResponseStore = useResponseStore as unknown as ReturnType<typeof vi.fn>;
const mockUseUIStore = useUIStore as unknown as ReturnType<typeof vi.fn>;

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
        const configState = { config: mockConfig, isLoading: false };
        const sessionState = { 
            currentStep: 4, 
            hasConsented: true, 
            isSaving: false,
            language: 'en',
            setStep: vi.fn(), 
        };
        const responseState = {
            rough: { agree: [], disagree: [], neutral: [] },
            qsort: [
                { statementId: 1, col: 0, row: 0 },
                { statementId: 2, col: 0, row: 1 }
            ]
        };
        const uiState = { hoveredCard: null, setHoveredCard: vi.fn() };

        mockUseConfigStore.mockImplementation((selector: any) => selector ? selector(configState) : configState);
        mockUseSessionStore.mockImplementation((selector: any) => selector ? selector(sessionState) : sessionState);
        mockUseResponseStore.mockImplementation((selector: any) => selector ? selector(responseState) : responseState);
        mockUseUIStore.mockImplementation((selector: any) => selector ? selector(uiState) : uiState);

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
        // Logic says: if isAllPlaced -> "Validate"
        expect(screen.getAllByText(/fine.actions.validate/i).length).toBeGreaterThan(0);
        
        // It should be enabled
        const btns = screen.getAllByRole('button', { name: /fine.actions.validate/i });
        btns.forEach(btn => expect((btn as HTMLButtonElement).disabled).toBe(false));
    });

    it('renders disabled "Finish Sorting" button when grid is NOT full', () => {
        // Mock State: Cards remaining in Neutral pile
        const configState = { config: mockConfig, isLoading: false };
        const sessionState = { 
            currentStep: 4, 
            hasConsented: true, 
            isSaving: false,
            language: 'en',
            setStep: vi.fn(), 
        };
        const responseState = {
            rough: { agree: [], disagree: [], neutral: [1, 2] },
            qsort: []
        };
        const uiState = { hoveredCard: null, setHoveredCard: vi.fn() };

        mockUseConfigStore.mockImplementation((selector: any) => selector ? selector(configState) : configState);
        mockUseSessionStore.mockImplementation((selector: any) => selector ? selector(sessionState) : sessionState);
        mockUseResponseStore.mockImplementation((selector: any) => selector ? selector(responseState) : responseState);
        mockUseUIStore.mockImplementation((selector: any) => selector ? selector(uiState) : uiState);

        render(
            <MemoryRouter initialEntries={['/study/demo/sort/fine']}>
                <Routes>
                    <Route path="/study/:slug" element={<StudyLayout />}>
                        <Route path="sort/fine" element={<FineSortPage />} />
                    </Route>
                </Routes>
            </MemoryRouter>
        );

        // Logic says: if !isAllPlaced -> Button should NOT be visible
        // We check for both potential keys just in case, or ensure the query returns nothing
        const finishBtns = screen.queryAllByRole('button', { name: /fine.actions.finish/i });
        const validateBtns = screen.queryAllByRole('button', { name: /fine.actions.validate/i });
        
        expect(finishBtns.length).toBe(0);
        expect(validateBtns.length).toBe(0);
    });
});
