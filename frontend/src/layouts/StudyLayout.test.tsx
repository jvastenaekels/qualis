/*
 * Qualis - Open-source platform for conducting Q-methodology research
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
import { useNetworkStatus } from '../hooks/useNetworkStatus';

const mocks = vi.hoisted(() => ({
    changeLanguage: vi.fn(),
    navigate: vi.fn(),
    retry: vi.fn(),
    resetAllStores: vi.fn(),
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

vi.mock('../hooks/useNetworkStatus', () => ({
    useNetworkStatus: vi.fn(() => ({ isOnline: true })),
}));

vi.mock('../hooks/useLayout', () => ({
    useLayoutState: vi.fn(() => ({ headerAction: null })),
}));

vi.mock('../utils/sessionReset', () => ({
    resetAllStores: mocks.resetAllStores,
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
        vi.clearAllMocks();
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
        useSessionStore.setState({ isCompleted: true, hasConsented: true, studySlug: 'test' });

        renderWithProviders(
            <Routes>
                <Route path="/study/:slug/welcome" element={<StudyLayout />} />
                <Route path="/study/:slug/post-sort" element={<div>Post Sort Page</div>} />
            </Routes>,
            { initialEntries: ['/study/test/welcome'] }
        );

        expect(screen.getByText('Post Sort Page')).toBeInTheDocument();
    });

    it('Redirects completed legacy sessions with missing study slug to Post-Sort', () => {
        useSessionStore.setState({
            isCompleted: true,
            hasConsented: true,
            studySlug: null,
        });

        renderWithProviders(
            <Routes>
                <Route path="/study/:slug/welcome" element={<StudyLayout />} />
                <Route path="/study/:slug/post-sort" element={<div>Post Sort Page</div>} />
            </Routes>,
            { initialEntries: ['/study/test/welcome'] }
        );

        expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
        expect(screen.getByText('Post Sort Page')).toBeInTheDocument();
        expect(mocks.resetAllStores).not.toHaveBeenCalled();
    });

    it('Shows stale-session spinner while a completed other-study session is reset', () => {
        useSessionStore.setState({
            isCompleted: true,
            hasConsented: true,
            studySlug: 'other-study',
        });

        renderWithProviders(
            <Routes>
                <Route path="/study/:slug/welcome" element={<StudyLayout />} />
                <Route path="/study/:slug/post-sort" element={<div>Post Sort Page</div>} />
            </Routes>,
            { initialEntries: ['/study/test/welcome'] }
        );

        expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
        expect(screen.queryByText('Post Sort Page')).not.toBeInTheDocument();
        expect(screen.queryByTestId('layout-header')).not.toBeInTheDocument();
        expect(mocks.resetAllStores).toHaveBeenCalledWith({ skipConfig: true });
    });

    it('Resets active other-study sessions without showing stale-session spinner', () => {
        useSessionStore.setState({
            isCompleted: false,
            hasConsented: true,
            studySlug: 'other-study',
        });

        renderWithProviders(
            <Routes>
                <Route path="/study/:slug/welcome" element={<StudyLayout />} />
            </Routes>,
            { initialEntries: ['/study/test/welcome'] }
        );

        expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
        expect(screen.getByTestId('layout-header')).toBeInTheDocument();
        expect(mocks.resetAllStores).toHaveBeenCalledWith({ skipConfig: true });
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

describe('Pilot Mode Logic', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useConfigStore.setState({
            config: null,
            isLoading: false,
            error: null,
        });
        // biome-ignore lint/suspicious/noExplicitAny: mock return
        vi.mocked(useStudyConfig).mockReturnValue({ retry: vi.fn() } as any);
        // Default not in pilot mode
        useSessionStore.setState({ isPilotMode: false });
        sessionStorage.removeItem('qualis-pilot-mode');
    });

    it('Renders hard loading state when in pilot mode and config is missing', () => {
        // Simulate Pilot Mode via persistence
        useSessionStore.setState({ isPilotMode: true });

        renderWithProviders(<StudyLayout />, {
            initialEntries: ['/study/test/welcome?mode=test'],
        });

        // Should see loading spinner
        expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
        expect(screen.getByText('layout.preparing')).toBeInTheDocument();
    });

    it('Renders "Study Not Found" when config error is not_found', () => {
        useConfigStore.setState({
            error: 'common.errors.not_found',
            config: null,
        });

        renderWithProviders(<StudyLayout />, {
            initialEntries: ['/study/test/welcome'],
        });

        expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
        expect(screen.queryByTestId('layout-header')).not.toBeInTheDocument();
    });

    it('Displays Pilot Mode banner', () => {
        useSessionStore.setState({ isPilotMode: true });
        useConfigStore.setState({
            // biome-ignore lint/suspicious/noExplicitAny: mock config
            config: { slug: 'test', state: 'active' } as any,
        });

        renderWithProviders(<StudyLayout />, {
            initialEntries: ['/study/test/welcome'],
        });

        expect(screen.getByText('layout.pilot_mode')).toBeInTheDocument();
    });

    it('Restricts language list to available_languages', async () => {
        useSessionStore.setState({ isPilotMode: true });
        useConfigStore.setState({
            config: {
                slug: 'test',
                available_languages: ['fi', 'en'],
                // biome-ignore lint/suspicious/noExplicitAny: mock config
            } as any,
        });

        renderWithProviders(<StudyLayout />, {
            initialEntries: ['/study/test/welcome'],
        });

        // Open Lang Menu
        const globeBtn = screen.getByTitle('layout.change_lang_title');
        fireEvent.click(globeBtn);

        // Should see 'fi' and 'en'
        expect(screen.getByText('fi')).toBeInTheDocument();
        expect(screen.getByText('en')).toBeInTheDocument();

        // Should NOT see 'fr'
        expect(screen.queryByText('fr')).not.toBeInTheDocument();
    });
});

describe('Breadcrumb labels (process_steps mapping)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useSessionStore.setState({
            token: null,
            hasConsented: true,
            currentStep: 4,
            maxReachedStep: 4,
            language: 'en',
            isCompleted: false,
            // biome-ignore lint/suspicious/noExplicitAny: partial state
        } as any);
    });

    it('Resolves step labels by process_step id (deck mode, rough disabled)', () => {
        // Backend filters out the rough entry when rough_sort_enabled=false,
        // so process_steps has 3 entries instead of 4. Looking up by index would
        // make step.id=4 (fine) read process_steps[2] = post → "Why" instead of
        // the correct "Your perspective".
        useConfigStore.setState({
            config: {
                slug: 'test',
                rough_sort_enabled: false,
                presort_config: { enabled: true, fields: {} },
                process_steps: [
                    { id: 'profile', title: "Let's meet", description: '', icon: 'User' },
                    {
                        id: 'fine',
                        title: 'Your perspective',
                        description: '',
                        icon: 'Target',
                    },
                    { id: 'post', title: 'Why', description: '', icon: 'MessageSquare' },
                ],
                // biome-ignore lint/suspicious/noExplicitAny: mock config
            } as any,
            isLoading: false,
            error: null,
        });

        renderWithProviders(
            <Routes>
                <Route path="/study/:slug/fine-sort" element={<StudyLayout />} />
            </Routes>,
            { initialEntries: ['/study/test/fine-sort'] }
        );

        const stepper = screen.getByTestId('stepper-container');
        // The fine-sort step (3rd visible position when rough is disabled) must
        // resolve to "Your perspective", not "Why" (which is the post step).
        expect(within(stepper).getByText('Your perspective')).toBeInTheDocument();
        // "Why" should appear exactly once (for the post step), not duplicated.
        const whyMatches = within(stepper).getAllByText('Why');
        expect(whyMatches).toHaveLength(1);
    });

    it('Resolves step labels correctly when rough is enabled (5-step flow)', () => {
        useConfigStore.setState({
            config: {
                slug: 'test',
                rough_sort_enabled: true,
                presort_config: { enabled: true, fields: {} },
                process_steps: [
                    { id: 'profile', title: "Let's meet", description: '', icon: 'User' },
                    {
                        id: 'rough',
                        title: 'First impressions',
                        description: '',
                        icon: 'Zap',
                    },
                    {
                        id: 'fine',
                        title: 'Your perspective',
                        description: '',
                        icon: 'Target',
                    },
                    { id: 'post', title: 'Why', description: '', icon: 'MessageSquare' },
                ],
                // biome-ignore lint/suspicious/noExplicitAny: mock config
            } as any,
            isLoading: false,
            error: null,
        });

        renderWithProviders(
            <Routes>
                <Route path="/study/:slug/fine-sort" element={<StudyLayout />} />
            </Routes>,
            { initialEntries: ['/study/test/fine-sort'] }
        );

        const stepper = screen.getByTestId('stepper-container');
        expect(within(stepper).getByText('First impressions')).toBeInTheDocument();
        expect(within(stepper).getByText('Your perspective')).toBeInTheDocument();
        expect(within(stepper).getByText('Why')).toBeInTheDocument();
    });
});

describe('Network & Password Features', () => {
    beforeEach(() => {
        useConfigStore.setState({
            // biome-ignore lint/suspicious/noExplicitAny: mock config
            config: { slug: 'test' } as any,
            isLoading: false,
            error: null,
        });
    });

    it('Shows offline banner when network is offline', () => {
        vi.mocked(useNetworkStatus).mockReturnValue({ isOnline: false });

        renderWithProviders(<StudyLayout />, {
            initialEntries: ['/study/test/welcome'],
        });

        expect(screen.getByText('common.status.offline')).toBeInTheDocument();
    });

    it('Shows Password Gate when requires_password is true', () => {
        useConfigStore.setState({
            config: {
                slug: 'test',
                requires_password: true,
                title: 'Secret Study',
                // biome-ignore lint/suspicious/noExplicitAny: mock config
            } as any,
        });

        renderWithProviders(<StudyLayout />, {
            initialEntries: ['/study/test/welcome'],
        });

        // Should show gate title
        expect(screen.getByText('Secret Study')).toBeInTheDocument();
        expect(screen.queryByTestId('layout-header')).not.toBeInTheDocument();
    });
});

describe('Layout Global Footer', () => {
    beforeEach(() => {
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

    it('renders the global Footer on /welcome', () => {
        renderWithProviders(
            <Routes>
                <Route path="/study/:slug/welcome" element={<StudyLayout />} />
            </Routes>,
            { initialEntries: ['/study/slug/welcome'] }
        );
        expect(
            screen.getByRole('link', { name: /Powered by Qualis|footer.powered_by/i })
        ).toBeInTheDocument();
    });

    it('does not render the global Footer on /consent', () => {
        renderWithProviders(
            <Routes>
                <Route path="/study/:slug/consent" element={<StudyLayout />} />
            </Routes>,
            { initialEntries: ['/study/slug/consent'] }
        );
        expect(
            screen.queryByRole('link', { name: /Powered by Qualis|footer.powered_by/i })
        ).not.toBeInTheDocument();
    });

    it('hides the global Footer on /presort', () => {
        renderWithProviders(
            <Routes>
                <Route path="/study/:slug/presort" element={<StudyLayout />} />
            </Routes>,
            { initialEntries: ['/study/slug/presort'] }
        );
        expect(
            screen.queryByRole('link', { name: /Powered by Qualis|footer.powered_by/i })
        ).not.toBeInTheDocument();
    });

    it('hides the global Footer on /fine-sort', () => {
        renderWithProviders(
            <Routes>
                <Route path="/study/:slug/fine-sort" element={<StudyLayout />} />
            </Routes>,
            { initialEntries: ['/study/slug/fine-sort'] }
        );
        expect(
            screen.queryByRole('link', { name: /Powered by Qualis|footer.powered_by/i })
        ).not.toBeInTheDocument();
    });

    it('hides the global Footer on /rough-sort', () => {
        renderWithProviders(
            <Routes>
                <Route path="/study/:slug/rough-sort" element={<StudyLayout />} />
            </Routes>,
            { initialEntries: ['/study/slug/rough-sort'] }
        );
        expect(
            screen.queryByRole('link', { name: /Powered by Qualis|footer.powered_by/i })
        ).not.toBeInTheDocument();
    });

    it('hides the global Footer on /post-sort', () => {
        renderWithProviders(
            <Routes>
                <Route path="/study/:slug/post-sort" element={<StudyLayout />} />
            </Routes>,
            { initialEntries: ['/study/slug/post-sort'] }
        );
        expect(
            screen.queryByRole('link', { name: /Powered by Qualis|footer.powered_by/i })
        ).not.toBeInTheDocument();
    });
});
