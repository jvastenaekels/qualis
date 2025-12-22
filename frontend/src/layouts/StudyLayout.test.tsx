/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StudyLayout from './StudyLayout';
import { useConfigStore } from '../store/useConfigStore';
import { useSessionStore } from '../store/useSessionStore';
import i18n from '../i18n';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// Mock dependencies
// i18n is already being mocked globally in setupTests.ts for some things, but here we mock specifically.
vi.mock('../i18n', () => ({
    default: {
        changeLanguage: vi.fn(),
        language: 'en'
    },
    // Adding named export for useTranslation if needed, but it's mocked in layout
    t: (key: string) => key
}));

// Mock useStudyConfig since it's used in StudyLayout
vi.mock('../hooks/useStudyConfig', () => ({
    useStudyConfig: vi.fn(() => ({ isLoading: false, error: null, retry: vi.fn() }))
}));

describe('StudyLayout Language Sync', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset and seed store
        useConfigStore.setState({
            config: {
                title: 'Test Study',
                slug: 'test',
                statements: [],
                grid_config: [],
                presort_config: {},
                postsort_config: {},
                available_languages: ['en', 'fr'],
                require_code: false,
                require_consent: true,
                consent_text: 'Consent'
            } as any,
            isLoading: false,
            error: null
        });
        
        useSessionStore.setState({
            token: null, 
            hasConsented: true, 
            currentStep: 1, 
            maxReachedStep: 1, 
            language: 'en', 
            isCompleted: false, 
            confirmationCode: null,
            isSaving: false
        });
    });

    it('Updates i18n when Store language changes', () => {
        // Spy on i18n
        const changeLanguageSpy = i18n.changeLanguage;

        // Render Layout
        render(
            <MemoryRouter initialEntries={['/study/test/welcome']}>
                <StudyLayout />
            </MemoryRouter>
        );

        // Change Store Language DIRECTLY (Simulating State Change)
        act(() => {
            useSessionStore.getState().setLanguage('fi');
        });

        // Verify i18n was updated
        expect(changeLanguageSpy).toHaveBeenCalledWith('fi');
    });

    it('Updates Store when UI Language Button is clicked', () => {
         render(
            <MemoryRouter initialEntries={['/study/test/welcome']}>
                <StudyLayout />
            </MemoryRouter>
        );
        
        // Open Language Menu (Button with Globe)
        const globeBtn = screen.getByTitle('Change language'); // Based on title attribute I saw in code
        fireEvent.click(globeBtn);

        // Click French
        const frBtn = screen.getByText('fr'); 
        
        fireEvent.click(frBtn);

        // Verify Store Updated
        expect(useSessionStore.getState().language).toBe('fr');
        
        // Verify i18n updated
        expect(i18n.changeLanguage).toHaveBeenCalledWith('fr');
    });
});

describe('Layout Scroll Behavior', () => {
    beforeEach(() => {
        // Setup stores - layout needs config and consent to render main
        useConfigStore.setState({
            config: {
                title: 'Test Study',
                slug: 'slug',
                statements: [],
                grid_config: [],
                presort_config: {},
                postsort_config: {},
                available_languages: ['en'],
                require_code: false,
                require_consent: true,
                consent_text: 'Consent'
            } as any,
            isLoading: false,
            error: null
        });
        
        useSessionStore.setState({
            token: null, 
            hasConsented: true, 
            currentStep: 1, 
            maxReachedStep: 1, 
            language: 'en', 
            isCompleted: false, 
            confirmationCode: null,
            isSaving: false
        });
    });

    it('Applies overflow-hidden on sorting pages', () => {

        const { container } = render(
            <MemoryRouter initialEntries={['/study/slug/rough-sort']}>
                <Routes>
                    <Route path="/study/:slug/rough-sort" element={<StudyLayout />} />
                </Routes>
            </MemoryRouter>
        );
        const main = container.querySelector('main');
        expect(main).toHaveClass('overflow-hidden');
        expect(main).not.toHaveClass('overflow-y-auto');
    });

    it('Applies overflow-hidden on fine-sort page', () => {
        const { container } = render(
            <MemoryRouter initialEntries={['/study/slug/sort']}>
                 <Routes>
                    <Route path="/study/:slug/sort" element={<StudyLayout />} />
                </Routes>
            </MemoryRouter>
        );
        const main = container.querySelector('main');
        expect(main).toHaveClass('overflow-hidden');
    });

    it('Applies overflow-y-auto on post-sort page (despite containing "sort")', () => {
        const { container } = render(
             <MemoryRouter initialEntries={['/study/slug/post-sort']}>
                 <Routes>
                    <Route path="/study/:slug/post-sort" element={<StudyLayout />} />
                </Routes>
            </MemoryRouter>
        );
        const main = container.querySelector('main');
        expect(main).toHaveClass('overflow-y-auto');
        expect(main).not.toHaveClass('overflow-hidden');
    });

    it('Applies overflow-y-auto on other pages (e.g. welcome)', () => {
        const { container } = render(
             <MemoryRouter initialEntries={['/study/slug/welcome']}>
                 <Routes>
                    <Route path="/study/:slug/welcome" element={<StudyLayout />} />
                </Routes>
            </MemoryRouter>
        );
        const main = container.querySelector('main');
        expect(main).toHaveClass('overflow-y-auto');
        expect(main).not.toHaveClass('overflow-hidden');
    });
});
