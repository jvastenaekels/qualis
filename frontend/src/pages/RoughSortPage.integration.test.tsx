/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RoughSortPage from './RoughSortPage';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import StudyLayout from '../layouts/StudyLayout';
import { useConfigStore } from '../store/useConfigStore';
import { useResponseStore } from '../store/useResponseStore';
import { useSessionStore } from '../store/useSessionStore';
import { useUIStore } from '../store/useUIStore';

// Mock Stores
vi.mock('../store/useConfigStore');
vi.mock('../store/useResponseStore');
vi.mock('../store/useSessionStore');
vi.mock('../store/useUIStore');

const mockUseConfigStore = useConfigStore as unknown as ReturnType<typeof vi.fn>;
const mockUseResponseStore = useResponseStore as unknown as ReturnType<typeof vi.fn>;
const mockUseSessionStore = useSessionStore as unknown as ReturnType<typeof vi.fn>;
const mockUseUIStore = useUIStore as unknown as ReturnType<typeof vi.fn>;

// Mock useStudyConfig
vi.mock('../hooks/useStudyConfig', () => ({
    useStudyConfig: vi.fn(() => ({ isLoading: false, error: null, retry: vi.fn() }))
}));

// Mock translation
// Mock translation
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
    initReactI18next: { type: '3rdParty', init: () => {} }
}));

describe('RoughSortPage Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const mockConfig = {
        statements: [
            { id: 1, text: 'S1' }
        ]
    };

    it('shows "Next" button in page body when rough sort is complete', () => {
        // Mock State: Complete (history contains all IDs)
        
        mockUseConfigStore.mockImplementation((selector: any) => selector ? selector({ config: mockConfig }) : { config: mockConfig });
        
        mockUseResponseStore.mockImplementation((selector: any) => {
            const state = { rough: { history: [1] }, categorizeCard: vi.fn(), undoRoughSort: vi.fn() };
            return selector ? selector(state) : state;
        });
        
        const sessionState = { hasConsented: true, currentStep: 3, isSaving: false, setStep: vi.fn(), setLanguage: vi.fn() };
        mockUseSessionStore.mockImplementation((selector: any) => selector ? selector(sessionState) : sessionState);
        
        const uiState = { hoveredCard: null, setHoveredCard: vi.fn() };
        mockUseUIStore.mockImplementation((selector: any) => selector ? selector(uiState) : uiState);

        render(
            <MemoryRouter initialEntries={['/study/demo/sort/rough']}>
                <Routes>
                    <Route path="/study/:slug" element={<StudyLayout />}>
                        <Route path="sort/rough" element={<RoughSortPage />} />
                    </Route>
                </Routes>
            </MemoryRouter>
        );

        // Check for Header Action
        // Text is t('common.next') which mocks to 'common.next'
        const nextBtns = screen.getAllByText('common.next');
        expect(nextBtns.length).toBeGreaterThan(0);
        
        // Verify it's in the header/layout structure (or just present on screen)
        // Since we removed it from the body, if it's present, it must be the hoisted one rendering in StudyLayout.
    });

    it('does not show "Next" button when incomplete', () => {
         // Mock State: Incomplete
         mockUseConfigStore.mockImplementation((selector: any) => selector ? selector({ config: mockConfig }) : { config: mockConfig });
        
         mockUseResponseStore.mockImplementation((selector: any) => {
             const state = { rough: { history: [] }, categorizeCard: vi.fn(), undoRoughSort: vi.fn() };
             return selector ? selector(state) : state;
         });
         
         const sessionState = { hasConsented: true, currentStep: 3, isSaving: false, setStep: vi.fn(), setLanguage: vi.fn() };
         mockUseSessionStore.mockImplementation((selector: any) => selector ? selector(sessionState) : sessionState);
         
         const uiState = { hoveredCard: null, setHoveredCard: vi.fn() };
         mockUseUIStore.mockImplementation((selector: any) => selector ? selector(uiState) : uiState);
 
         render(
             <MemoryRouter initialEntries={['/study/demo/sort/rough']}>
                 <Routes>
                     <Route path="/study/:slug" element={<StudyLayout />}>
                         <Route path="sort/rough" element={<RoughSortPage />} />
                     </Route>
                 </Routes>
             </MemoryRouter>
         );
 
         // Should NOT have "Next" button
         expect(screen.queryByText('common.next')).toBeNull();
    });
});
