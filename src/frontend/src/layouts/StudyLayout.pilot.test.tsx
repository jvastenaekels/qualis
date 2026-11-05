import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { customInstance } from '../api/mutator';
import { queryClient } from '../lib/queryClient';
import { setStudyStorageScope } from '../store/safeStorage';
import { useConfigStore } from '../store/useConfigStore';
import { useSessionStore } from '../store/useSessionStore';
import StudyLayout from './StudyLayout';

/**
 * Real useStudyConfig, restoreStudySession and BrowserRouter: useStudyConfig reads
 * window.location, so a MemoryRouter could not show a tab coming unstuck.
 */

vi.mock('../api/mutator', () => ({ BASE_URL: '', customInstance: vi.fn().mockResolvedValue({}) }));
// One object: refetch is a dependency of useStudyConfig's load effect, so it must be stable.
const studyQuery = vi.hoisted(() => ({
    data: undefined,
    isLoading: false,
    error: null,
    refetch: async () => ({}),
}));
vi.mock('../hooks/useGetStudyConfig', () => ({ useGetStudyConfig: () => studyQuery }));

const FLAG = 'qualis-pilot-mode';
const DRAFT = {
    slug: 'pilot',
    state: 'draft',
    grid_config: [],
    statements: [],
    translations: [{ language_code: 'en', title: 'Draft title' }],
};

const searchesSeenByTheStep: string[] = [];
function Step() {
    searchesSeenByTheStep.push(window.location.search);
    return <p>step body</p>;
}

function openTab(url: string) {
    window.history.replaceState({}, '', url);
    return render(
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <Routes>
                    <Route path="/study/:slug" element={<StudyLayout />}>
                        <Route path="welcome" element={<Step />} />
                        <Route path="fine-sort" element={<Step />} />
                    </Route>
                </Routes>
            </BrowserRouter>
        </QueryClientProvider>
    );
}

/** The tab's state right after a reload: flag kept, stores named and hydrated as a test. */
function seedPilotTab(session: Partial<ReturnType<typeof useSessionStore.getState>>) {
    sessionStorage.setItem(FLAG, 'true');
    useSessionStore.setState({ isPilotMode: true, ...session });
}

describe('a pilot tab', () => {
    beforeEach(() => {
        setStudyStorageScope(undefined);
        localStorage.clear();
        sessionStorage.clear();
        searchesSeenByTheStep.length = 0;
        localStorage.setItem('qualis-test-draft-pilot', JSON.stringify(DRAFT));
        useConfigStore.setState({ config: null, isLoading: false, error: null });
        vi.mocked(customInstance).mockClear();
    });
    afterEach(() => {
        vi.restoreAllMocks();
        setStudyStorageScope(undefined);
        sessionStorage.clear();
        window.history.replaceState({}, '', '/');
    });

    it('a pilot tab that lost mode=test gets it back', async () => {
        seedPilotTab({ studySlug: 'pilot', hasConsented: true, maxReachedStep: 4 });
        const entries = window.history.length;

        openTab('/study/pilot/fine-sort?lang=fi&token=abc');

        await waitFor(() => expect(window.location.search).toContain('mode=test'));
        const params = new URLSearchParams(window.location.search);
        expect(params.get('lang')).toBe('fi');
        expect(params.get('token')).toBe('abc');
        expect(window.location.pathname).toBe('/study/pilot/fine-sort');
        expect(window.history.length).toBe(entries);
    });

    it('a pilot reload without the param does not spin forever', async () => {
        seedPilotTab({ studySlug: 'pilot', hasConsented: true, maxReachedStep: 4 });

        openTab('/study/pilot/fine-sort');

        expect(await screen.findByText('step body')).toBeInTheDocument();
        expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    });

    it('a real link pasted before consent stays a test', async () => {
        seedPilotTab({ studySlug: null, hasConsented: false });

        openTab('/study/pilot/welcome');

        expect(await screen.findByText('step body')).toBeInTheDocument();
        expect(sessionStorage.getItem(FLAG)).toBe('true');
        expect(useSessionStore.getState().isPilotMode).toBe(true);
        expect(window.location.search).toBe('?mode=test');
    });

    it('no step mounts before mode=test is back, so nothing can write', async () => {
        seedPilotTab({ studySlug: 'pilot', hasConsented: true, token: 'pilot-token' });

        openTab('/study/pilot/fine-sort?lang=fi');

        expect(await screen.findByText('step body')).toBeInTheDocument();
        expect(searchesSeenByTheStep.every((s) => s.includes('mode=test'))).toBe(true);
        expect(customInstance).not.toHaveBeenCalled();
    });

    it('a tab with no flag and no param is left alone', async () => {
        useConfigStore.setState({
            // biome-ignore lint/suspicious/noExplicitAny: only the fields the layout reads
            config: { slug: 'real', state: 'active', statements: [] } as any,
        });
        useSessionStore.setState({ isPilotMode: false, studySlug: 'real', hasConsented: true });

        openTab('/study/real/fine-sort?lang=fi');

        expect(await screen.findByText('step body')).toBeInTheDocument();
        expect(window.location.search).toBe('?lang=fi');
        expect(sessionStorage.getItem(FLAG)).toBeNull();
        expect(screen.queryByRole('button', { name: /leave the test/i })).not.toBeInTheDocument();
    });

    it('the banner says a real link stays a test, and its button leaves', async () => {
        const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
        seedPilotTab({ studySlug: 'pilot', hasConsented: true, maxReachedStep: 4 });

        openTab('/study/pilot/fine-sort');

        expect(await screen.findByText(/even if you open a real link here/i)).toBeInTheDocument();
        act(() => {
            fireEvent.click(screen.getByRole('button', { name: /leave the test/i }));
        });
        expect(sessionStorage.getItem(FLAG)).toBeNull();
        expect(assign).toHaveBeenCalledWith('/study/pilot');
    });

    it('reset keeps a test tab in test: only the banner button leaves', () => {
        seedPilotTab({});

        useSessionStore.getState().resetSession();

        expect(sessionStorage.getItem(FLAG)).toBe('true');
        expect(useSessionStore.getState().isPilotMode).toBe(true);
    });
});
