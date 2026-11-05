import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConfigStore } from '../store/useConfigStore';
import { useSessionStore } from '../store/useSessionStore';
import { useGetStudyConfig } from './useGetStudyConfig';
import { useStudyConfig } from './useStudyConfig';

vi.mock('./useGetStudyConfig', () => ({ useGetStudyConfig: vi.fn() }));
vi.mock('../utils/i18nOverrides', () => ({
    applyStudyOverrides: vi.fn(),
    resetBaseLocales: vi.fn(),
}));
vi.mock('../i18n', () => ({ default: { changeLanguage: vi.fn(), language: 'en' } }));
vi.mock('react-router-dom', () => ({ useParams: () => ({ slug: 'test-study' }) }));

/** Language the hook asked the query for, on its first render or (latest) after the session synced. */
function requestedLanguage(which: 'first' | 'latest' = 'first'): string | undefined {
    const calls = vi.mocked(useGetStudyConfig).mock.calls;
    return calls[which === 'first' ? 0 : calls.length - 1][1];
}

/** Stand-in for the backend: answers in `offered` when `lang` is not one of its languages. */
function mockBackend(offered: string[]): void {
    const answers = new Map<string, unknown>(); // stable per language, like the query cache
    vi.mocked(useGetStudyConfig).mockImplementation(((_slug: string, lang?: string) => {
        const language = lang && offered.includes(lang) ? lang : offered[0];
        if (!answers.has(language)) {
            answers.set(language, {
                slug: 'test-study',
                title: 'T',
                presort_config: {},
                statements: [],
                language,
            });
        }
        return { data: answers.get(language), isLoading: false, error: null, refetch: vi.fn() };
        // biome-ignore lint/suspicious/noExplicitAny: mock hook
    }) as any);
}

describe('useStudyConfig language request', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useConfigStore.getState().resetConfig();
        useSessionStore.getState().resetSession();
        window.history.replaceState({}, '', '/');
        mockBackend(['en', 'fi']);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        window.history.replaceState({}, '', '/');
    });

    const browserIn = (language: string | undefined) =>
        vi.stubGlobal('navigator', language === undefined ? {} : { language });

    it('requests the browser language when there is no session or URL language', () => {
        browserIn('fi-FI');
        renderHook(() => useStudyConfig());
        expect(requestedLanguage()).toBe('fi');
    });

    it('prefers the session language', () => {
        browserIn('fi-FI');
        useSessionStore.getState().setLanguage('en');
        renderHook(() => useStudyConfig());
        expect(requestedLanguage()).toBe('en');
    });

    it('prefers the URL language', () => {
        browserIn('fi-FI');
        window.history.replaceState({}, '', '/?lang=en');
        renderHook(() => useStudyConfig());
        expect(requestedLanguage()).toBe('en');
    });

    it('sends no language for an unsupported browser language', () => {
        browserIn('ja-JP');
        renderHook(() => useStudyConfig());
        expect(requestedLanguage()).toBeUndefined();
    });

    it('sends no language when navigator has none', () => {
        browserIn(undefined);
        renderHook(() => useStudyConfig());
        expect(requestedLanguage()).toBeUndefined();
    });

    it('reduces pt-BR to pt', () => {
        browserIn('pt-BR');
        renderHook(() => useStudyConfig());
        expect(requestedLanguage()).toBe('pt');
    });

    it('does not stay loading when the study does not offer the browser language', async () => {
        mockBackend(['en', 'de']); // asked for fi, answered in en
        browserIn('fi-FI');
        renderHook(() => useStudyConfig());
        expect(requestedLanguage()).toBe('fi');

        await waitFor(() => expect(useSessionStore.getState().language).toBe('en'));
        expect(requestedLanguage('latest')).toBe('en');
        expect(useConfigStore.getState().config?.language).toBe('en');
        expect(useConfigStore.getState().isLoading).toBe(false);
    });
});
