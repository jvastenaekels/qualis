import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../test-utils/server';
import { queryClient } from '../lib/queryClient';
import { studyLayoutLoader } from '../layouts/StudyLayout.loader';
import { useConfigStore } from '../store/useConfigStore';
import { useSessionStore } from '../store/useSessionStore';
import { useStudyConfig } from './useStudyConfig';

vi.mock('../utils/i18nOverrides', () => ({
    applyStudyOverrides: vi.fn(),
    resetBaseLocales: vi.fn(),
}));
vi.mock('../i18n', () => ({ default: { changeLanguage: vi.fn(), language: 'en' } }));
vi.mock('react-router-dom', () => ({ useParams: () => ({ slug: 'test-study' }) }));

/** Requests that reach the (msw) network layer, by `lang`. */
const requested: Array<string | null> = [];

function serve(offered: string[]): void {
    requested.length = 0;
    server.use(
        http.get('*/api/study/:slug', ({ request }) => {
            const lang = new URL(request.url).searchParams.get('lang');
            requested.push(lang);
            return HttpResponse.json({
                slug: 'test-study',
                title: 'T',
                presort_config: {},
                statements: [],
                available_languages: offered,
                language: lang && offered.includes(lang) ? lang : offered[0],
            });
        })
    );
}

/** A session-less visitor in a French-Finnish browser: the loader runs, then the layout mounts the hook. */
async function firstLoad(): Promise<void> {
    const request = new Request('http://localhost/study/test-study/welcome');
    await studyLayoutLoader({ params: { slug: 'test-study' }, request } as never);
    const wrapper = ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client: queryClient }, children);
    renderHook(() => useStudyConfig(), { wrapper });
    await waitFor(() => expect(useSessionStore.getState().language).not.toBeNull());
    await new Promise((r) => setTimeout(r, 100)); // let a stray second fetch show
}

describe('first load of a session-less visitor', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        queryClient.clear();
        useConfigStore.getState().resetConfig();
        useSessionStore.getState().resetSession();
        window.history.replaceState({}, '', '/study/test-study/welcome');
        vi.stubGlobal('navigator', { language: 'fi-FI' });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        queryClient.clear();
    });

    it('fetches once when the study offers the browser language', async () => {
        serve(['en', 'fi']);
        await firstLoad();

        expect(requested).toEqual(['fi']);
        expect(useSessionStore.getState().language).toBe('fi');
        expect(useConfigStore.getState().isLoading).toBe(false);
    });

    it('fetches once when the study does not offer it, and ends on the default language', async () => {
        serve(['en', 'de']);
        await firstLoad();

        expect(requested).toEqual(['fi']);
        expect(useSessionStore.getState().language).toBe('en');
        expect(useConfigStore.getState().isLoading).toBe(false);
    });

    it('fetches once with no browser language, as before', async () => {
        vi.stubGlobal('navigator', {});
        serve(['en', 'fi']);
        await firstLoad();

        expect(requested).toEqual([null]);
        expect(useSessionStore.getState().language).toBe('en');
    });
});
