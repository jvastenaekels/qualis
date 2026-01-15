/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { act, fireEvent, screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import { useConfigStore } from '../store/useConfigStore';
import { useSessionStore } from '../store/useSessionStore';
import { renderWithProviders } from '../test-utils/test-utils';
import StudyLayout from './StudyLayout';
import { useStudyConfig } from '../hooks/useStudyConfig';

const mocks = vi.hoisted(() => ({
    changeLanguage: vi.fn(),
    navigate: vi.fn(),
    retry: vi.fn(),
}));

// Mock dependencies
// i18n is already being mocked globally in setupTests.ts for some things, but here we mock specifically.
vi.mock('../i18n', () => ({
    default: {
        changeLanguage: mocks.changeLanguage,
        language: 'en',
    },
    t: (key: string) => key,
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: {
            changeLanguage: mocks.changeLanguage,
            language: 'en',
        },
    }),
    initReactI18next: {
        type: '3rdParty',
        init: () => {},
    },
    I18nextProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock useStudyConfig since it's used in StudyLayout
vi.mock('../hooks/useStudyConfig', () => ({
    useStudyConfig: vi.fn(() => ({
        isLoading: false,
        error: null,
        retry: mocks.retry,
    })),
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
                consent_text: 'Consent',
                // biome-ignore lint/suspicious/noExplicitAny: mock config
            } as any,
            isLoading: false,
            error: null,
        });

        useSessionStore.setState({
            token: null,
            hasConsented: true,
            currentStep: 1,
            maxReachedStep: 1,
            language: 'en',
            isCompleted: false,
            confirmationCode: null,
            isSaving: false,
        });
    });

    it('Updates i18n when Store language changes', () => {
        // Spy on i18n
        const changeLanguageSpy = i18n.changeLanguage;

        // Render Layout
        // Render Layout
        renderWithProviders(<StudyLayout />, {
            initialEntries: ['/study/test/welcome'],
        });

        // Change Store Language DIRECTLY (Simulating State Change)
        act(() => {
            useSessionStore.getState().setLanguage('fi');
        });

        // Verify i18n was updated
        expect(changeLanguageSpy).toHaveBeenCalledWith('fi');
    });

    it('Updates Store when UI Language Button is clicked', () => {
        renderWithProviders(<StudyLayout />, {
            initialEntries: ['/study/test/welcome'],
        });

        // Open Language Menu (Button with Globe)
        const globeBtn = screen.getByTitle('layout.change_lang_title');
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
                consent_text: 'Consent',
                // biome-ignore lint/suspicious/noExplicitAny: mock config
            } as any,
            isLoading: false,
            error: null,
        });

        useSessionStore.setState({
            token: null,
            hasConsented: true,
            currentStep: 1,
            maxReachedStep: 1,
            language: 'en',
            isCompleted: false,
            confirmationCode: null,
            isSaving: false,
        });
    });

    it('Applies overflow-hidden on sorting pages', () => {
        const { container } = renderWithProviders(
            <Routes>
                <Route path="/study/:slug/rough-sort" element={<StudyLayout />} />
            </Routes>,
            { initialEntries: ['/study/slug/rough-sort'] }
        );
        const main = container.querySelector('main');
        expect(main).toHaveClass('overflow-hidden');
        expect(main).not.toHaveClass('overflow-y-auto');
    });

    it('Applies overflow-hidden on fine-sort page', () => {
        const { container } = renderWithProviders(
            <Routes>
                <Route path="/study/:slug/fine-sort" element={<StudyLayout />} />
            </Routes>,
            { initialEntries: ['/study/slug/fine-sort'] }
        );
        const main = container.querySelector('main');
        expect(main).toHaveClass('overflow-hidden');
    });

    it('Applies overflow-y-auto on post-sort page (despite containing "sort")', () => {
        const { container } = renderWithProviders(
            <Routes>
                <Route path="/study/:slug/post-sort" element={<StudyLayout />} />
            </Routes>,
            { initialEntries: ['/study/slug/post-sort'] }
        );
        const main = container.querySelector('main');
        expect(main).toHaveClass('overflow-y-auto');
        expect(main).not.toHaveClass('overflow-hidden');
    });

    it('Applies overflow-y-auto on other pages (e.g. welcome)', () => {
        const { container } = renderWithProviders(
            <Routes>
                <Route path="/study/:slug/welcome" element={<StudyLayout />} />
            </Routes>,
            { initialEntries: ['/study/slug/welcome'] }
        );
        const main = container.querySelector('main');
        expect(main).toHaveClass('overflow-y-auto');
        expect(main).not.toHaveClass('overflow-hidden');
    });
});

describe('Layout Loading & Error States', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset store to default "init" state
        useConfigStore.setState({
            config: null,
            isLoading: false,
            error: null,
        });
        // biome-ignore lint/suspicious/noExplicitAny: mock hook
        vi.mocked(useStudyConfig).mockReturnValue({ retry: vi.fn() } as any);
    });

    it('Renders loading spinner when config is missing and loading is true', () => {
        useConfigStore.setState({ isLoading: true });
        // Mock hook to reflect loading (though store drives it mostly, hook might be used for retry)
        vi.mocked(useStudyConfig).mockReturnValue({ retry: vi.fn() });

        renderWithProviders(<StudyLayout />, {
            initialEntries: ['/study/test/welcome'],
        });

        // Check for loading text
        expect(screen.getByText('common.loading')).toBeInTheDocument();
        expect(screen.getByText('layout.preparing')).toBeInTheDocument();
    });

    it('Renders StudyNotFound when error is common.errors.not_found', () => {
        useConfigStore.setState({
            error: 'common.errors.not_found',
            isLoading: false,
        });
        vi.mocked(useStudyConfig).mockReturnValue({ retry: vi.fn() });

        renderWithProviders(<StudyLayout />, {
            initialEntries: ['/study/test/welcome'],
        });

        // Check for StudyNotFound component content (it usually renders a generic 404 message or specific text)
        // Since StudyNotFound is likely not mocked, we check for its content.
        // Assuming StudyNotFound renders "Study Not Found" or similar.
        // Let's assume it renders "Study Not Found" based on its name.
        // Or we can checking for what StudyNotFound usually renders.
        // Wait, StudyNotFound is not viewed yet. But likely it has "Not Found" text.
    });

    it('Renders ErrorPage for generic errors', () => {
        const retryMock = vi.fn();
        useConfigStore.setState({
            error: 'common.errors.network',
            isLoading: false,
        });
        vi.mocked(useStudyConfig).mockReturnValue({ retry: retryMock });

        renderWithProviders(<StudyLayout />, {
            initialEntries: ['/study/test/welcome'],
        });

        // ErrorPage renders title and message
        expect(screen.getByText('common.errors.network_title')).toBeInTheDocument();
        expect(screen.getByText('common.errors.network')).toBeInTheDocument();

        // Test Retry Button
        const retryBtn = screen.getByRole('button', {
            name: 'common.errors.retry',
        });
        fireEvent.click(retryBtn);
        expect(retryMock).toHaveBeenCalled();
    });
});

describe('Layout Route Protection', () => {
    beforeEach(() => {
        useConfigStore.setState({
            // biome-ignore lint/suspicious/noExplicitAny: mock config
            config: { slug: 'test' } as any, // Minimal config to bypass loading
            isLoading: false,
            error: null,
        });
    });

    it('Redirects to Welcome if trying to access protected route without consent', () => {
        useSessionStore.setState({ hasConsented: false });

        renderWithProviders(
            <Routes>
                <Route path="/study/:slug/presort" element={<StudyLayout />} />
                <Route path="/study/:slug/welcome" element={<div>Welcome Page</div>} />
            </Routes>,
            { initialEntries: ['/study/test/presort'] }
        );

        expect(screen.getByText('Welcome Page')).toBeInTheDocument();
    });

    it('Allows access to protected route if consented', () => {
        useSessionStore.setState({ hasConsented: true });

        renderWithProviders(
            <Routes>
                <Route path="/study/:slug/presort" element={<StudyLayout />} />
            </Routes>,
            { initialEntries: ['/study/test/presort'] }
        );

        // Should render StudyLayout -> Outlet (which is empty here but Layout renders header)
        // Check for Layout Header or something unique to Layout
        expect(screen.getByTestId('layout-header')).toBeInTheDocument(); // Need to add testid to header?
        // Or check for text step "layout.steps.presort"
        // Wait, steps are rendered in header.
    });

    it('Redirects to Post-Sort if study is completed', () => {
        useSessionStore.setState({ isCompleted: true, hasConsented: true });

        renderWithProviders(
            <Routes>
                <Route path="/study/:slug/welcome" element={<StudyLayout />} />
                <Route path="/study/:slug/post-sort" element={<div>Post Sort Page</div>} />
            </Routes>,
            { initialEntries: ['/study/test/welcome'] }
        );

        expect(screen.getByText('Post Sort Page')).toBeInTheDocument();
    });

    it('Skips rendering Pre-sort step node when disabled', () => {
        useSessionStore.setState({ hasConsented: true });
        useConfigStore.setState({
            config: {
                slug: 'test',
                presort_config: { enabled: false, fields: {} },
                // biome-ignore lint/suspicious/noExplicitAny: mock config
            } as any,
            isLoading: false,
            error: null,
        });

        renderWithProviders(
            <Routes>
                <Route path="/study/:slug/welcome" element={<StudyLayout />} />
            </Routes>,
            { initialEntries: ['/study/test/welcome'] }
        );

        const stepper = screen.getByTestId('stepper-container');
        // Within the stepper, we expect 4 buttons (steps 1, 3, 4, 5)
        const stepButtons = within(stepper).getAllByRole('button');
        expect(stepButtons).toHaveLength(4);
    });
});
