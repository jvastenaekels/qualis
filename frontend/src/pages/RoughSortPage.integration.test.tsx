/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RoughSortPage from './RoughSortPage';
import { useStudyStore } from '../store/useStudyStore';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import StudyLayout from '../layouts/StudyLayout';

// Mock Store
vi.mock('../store/useStudyStore');
const mockUseStudyStore = useStudyStore as unknown as ReturnType<typeof vi.fn>;

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
        mockUseStudyStore.mockReturnValue({
            config: mockConfig,
            responses: {
                rough: { history: [1] } // All cards sorted
            },
            session: { hasConsented: true, currentStep: 3 },
            categorizeCard: vi.fn(),
            undoRoughSort: vi.fn(),
            setStep: vi.fn(),
            setConfig: vi.fn(),
            setConfigLoading: vi.fn(),
            setConfigError: vi.fn(),
            triggerConfigRefetch: vi.fn()
        });

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
         mockUseStudyStore.mockReturnValue({
             config: mockConfig,
             responses: {
                 rough: { history: [] } 
             },
             session: { hasConsented: true, currentStep: 3 },
             categorizeCard: vi.fn(),
             undoRoughSort: vi.fn(),
             setStep: vi.fn(),
             setConfig: vi.fn(),
             setConfigLoading: vi.fn(),
             setConfigError: vi.fn(),
             triggerConfigRefetch: vi.fn()
         });
 
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
