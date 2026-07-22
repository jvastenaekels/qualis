import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import { useConfigStore } from '../store/useConfigStore';
import { useSessionStore } from '../store/useSessionStore';
import { applyStudyOverrides } from '../utils/i18nOverrides';
import { useGetStudyConfig } from './useGetStudyConfig';
import { useStudyConfig } from './useStudyConfig';

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

function restoreLocalStorage(): void {
    if (originalLocalStorage) {
        Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
    }
}

// Mock the query hook
vi.mock('./useGetStudyConfig', () => ({
    useGetStudyConfig: vi.fn(),
}));

// Mock the i18n overrides utility
vi.mock('../utils/i18nOverrides', () => ({
    applyStudyOverrides: vi.fn(),
    resetBaseLocales: vi.fn(),
}));

// Mock i18n instance methods for tracking
vi.mock('../i18n', () => ({
    default: {
        changeLanguage: vi.fn(),
        language: 'en',
    },
}));

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
    useParams: () => ({ slug: 'test-study' }),
    useLocation: () => ({ pathname: '/study/test-study/welcome' }),
}));

describe('useStudyConfig', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset Stores
        useConfigStore.getState().resetConfig();
        useSessionStore.getState().resetSession();
    });

    it('fetches study config on mount', async () => {
        const mockData = {
            slug: 'test-study',
            title: 'Test Title EN',
            description: 'Test Description EN',
            instructions: 'Test Instructions EN',
            presort_config: {},
            statements: [],
        };

        vi.mocked(useGetStudyConfig).mockReturnValue({
            data: mockData,
            isLoading: false,
            error: null,
            refetch: vi.fn(),
        });

        renderHook(() => useStudyConfig());

        await waitFor(() => {
            expect(useConfigStore.getState().config?.title).toBe('Test Title EN');
        });
    });

    it('applies UI overrides when present in config', async () => {
        const uiLabels = { 'common.agree': 'Approve' };
        const mockData = {
            slug: 'test-study',
            title: 'Test Title',
            description: 'Desc',
            instructions: 'Instr',
            presort_config: {},
            statements: [],
            ui_labels: uiLabels,
            language: 'en',
        };

        vi.mocked(useGetStudyConfig).mockReturnValue({
            data: mockData,
            isLoading: false,
            error: null,
            refetch: vi.fn(),
            // biome-ignore lint/suspicious/noExplicitAny: mock hook
        } as any);

        renderHook(() => useStudyConfig());

        await waitFor(() => {
            expect(applyStudyOverrides).toHaveBeenCalledWith('en', uiLabels);
        });
    });
    it('handles API errors (e.g. 404/500) gracefully', async () => {
        const error = new Error('Not Found');
        vi.mocked(useGetStudyConfig).mockReturnValue({
            data: undefined,
            isLoading: false,
            error: error,
            refetch: vi.fn(),
            // biome-ignore lint/suspicious/noExplicitAny: mock hook
        } as any);

        renderHook(() => useStudyConfig());

        await waitFor(() => {
            // Check if error state is updated in the store
            // Note: useStudyConfig primarily sets the config.
            // If useGetStudyConfig returns an error, it's typically handled by the component usage
            // (checking `error` returned by the hook or store).
            // Let's verify standard behavior: if error, config remains null/empty or error is logged?
            // Actually, looking at useStudyConfig implementation:
            // It relies on useGetStudyConfig.
            // If the store is not updated, that's expected.
            // But we should verify it DOES NOT update with invalid data.
            const cfg = useConfigStore.getState().config;
            expect(cfg).toBeNull();
        });
    });

    it('Pilot Mode: Falls back to server when local draft is missing', async () => {
        // Mock URL to be in test mode
        vi.spyOn(URLSearchParams.prototype, 'get').mockImplementation((key) => {
            if (key === 'mode') return 'test';
            return null;
        });

        // Ensure no local draft
        localStorage.clear();

        const mockServerData = {
            slug: 'test-study',
            title: 'Server Fallback Title',
            language: 'en',
            presort_config: {},
            statements: [],
        };

        const refetchMock = vi.fn().mockResolvedValue({ data: mockServerData });

        vi.mocked(useGetStudyConfig).mockReturnValue({
            data: undefined,
            isLoading: false,
            error: null,
            refetch: refetchMock,
            // biome-ignore lint/suspicious/noExplicitAny: mock hook
        } as any);

        renderHook(() => useStudyConfig());

        await waitFor(() => {
            expect(refetchMock).toHaveBeenCalled();
            expect(useConfigStore.getState().config?.title).toBe('Server Fallback Title');
        });
    });

    it('Pilot Mode: Falls back to server when localStorage is unavailable', async () => {
        vi.spyOn(URLSearchParams.prototype, 'get').mockImplementation((key) => {
            if (key === 'mode') return 'test';
            return null;
        });
        Object.defineProperty(globalThis, 'localStorage', {
            configurable: true,
            get() {
                throw new Error('storage unavailable');
            },
        });

        const mockServerData = {
            slug: 'test-study',
            title: 'Server Fallback Without Storage',
            language: 'en',
            presort_config: {},
            statements: [],
        };
        const refetchMock = vi.fn().mockResolvedValue({ data: mockServerData });

        vi.mocked(useGetStudyConfig).mockReturnValue({
            data: undefined,
            isLoading: false,
            error: null,
            refetch: refetchMock,
            // biome-ignore lint/suspicious/noExplicitAny: mock hook
        } as any);

        try {
            renderHook(() => useStudyConfig());

            await waitFor(() => {
                expect(refetchMock).toHaveBeenCalled();
                expect(useConfigStore.getState().config?.title).toBe(
                    'Server Fallback Without Storage'
                );
            });
        } finally {
            restoreLocalStorage();
        }
    });

    // ── Defensive guard against the OOM loop fixed in 0a31428 ────────────────
    // The data-sync effect refuses to write a response whose `slug` differs
    // from the URL slug. Without this guard, an in-flight stale response
    // (e.g. switching studies before the previous fetch resolves) would
    // populate the store with the wrong slug, the slug-guard would fire a
    // reset, the refetch would replay, and the loop would exhaust the heap.
    // See `useStudyConfig.ts:246-253` for the rationale comment.
    // ── Issue #30: uncancelled async test-mode load races on unmount ─────────
    // The test-mode loading effect runs an async loadFromStorage() chain that
    // awaits i18n.changeLanguage (via syncConfigLanguage) before calling
    // setConfig. If the component unmounts (or the slug changes) mid-load, the
    // chain must be cancelled — it must NOT fire setConfig with the stale
    // study's data after unmount. Without a cancellation flag the deferred
    // resolution writes the config post-unmount (a stale-study flash +
    // setState-after-unmount).
    it('does NOT write the test config after unmount when the async load resolves late', async () => {
        // Force test mode via URL.
        vi.spyOn(URLSearchParams.prototype, 'get').mockImplementation((key) => {
            if (key === 'mode') return 'test';
            return null;
        });

        // Make i18n believe the current UI language differs from the draft so
        // syncConfigLanguage takes the `await i18n.changeLanguage(...)` branch.
        // @ts-expect-error mocked module
        i18n.language = 'en';

        // Deferred control over the awaited changeLanguage promise: the load
        // chain will suspend here until we resolve it.
        let resolveChangeLanguage: () => void = () => {};
        const changeLanguageGate = new Promise<void>((resolve) => {
            resolveChangeLanguage = resolve;
        });
        vi.mocked(i18n.changeLanguage).mockReturnValue(
            // biome-ignore lint/suspicious/noExplicitAny: i18n.changeLanguage returns a TFunction promise we don't use
            changeLanguageGate as any
        );

        // Seed a draft for the pinned slug whose language differs from 'en'.
        localStorage.clear();
        localStorage.setItem(
            'qualis-test-draft-test-study',
            JSON.stringify({
                slug: 'test-study',
                statements: [],
                translations: [
                    {
                        language_code: 'fr',
                        title: 'Stale Test Study',
                        ui_labels: {},
                        process_steps: [],
                    },
                ],
            })
        );

        // The query hook is disabled in test mode; provide an inert stub.
        vi.mocked(useGetStudyConfig).mockReturnValue({
            data: undefined,
            isLoading: false,
            error: null,
            refetch: vi.fn(),
            // biome-ignore lint/suspicious/noExplicitAny: mock hook
        } as any);

        const { unmount } = renderHook(() => useStudyConfig());

        // Wait until the chain has reached (and is suspended on) changeLanguage.
        await waitFor(() => {
            expect(i18n.changeLanguage).toHaveBeenCalledWith('fr');
        });

        // Config must still be unwritten — the await has not resolved yet.
        expect(useConfigStore.getState().config).toBeNull();

        // Unmount BEFORE the deferred await resolves.
        unmount();

        // Now resolve the late await: the cancelled chain must NOT call setConfig.
        resolveChangeLanguage();
        await changeLanguageGate;
        // Flush any pending microtasks the chain might schedule.
        await Promise.resolve();
        await Promise.resolve();

        expect(useConfigStore.getState().config).toBeNull();
    });

    it('does NOT write a config response whose slug mismatches the URL slug', async () => {
        // The router mock pins the URL slug to 'test-study'. Mock the API
        // hook to return a response with a different slug — this is exactly
        // the stale-in-flight scenario the guard exists for.
        const mismatchedData = {
            slug: 'wrong-slug',
            title: 'Should Not Be Written',
            language: 'en',
            presort_config: {},
            statements: [],
        };

        vi.mocked(useGetStudyConfig).mockReturnValue({
            data: mismatchedData,
            isLoading: false,
            error: null,
            refetch: vi.fn(),
            // biome-ignore lint/suspicious/noExplicitAny: mock hook
        } as any);

        renderHook(() => useStudyConfig());

        // Give effects a tick to run; the guard returns synchronously so
        // setConfig should not have fired.
        await waitFor(() => {
            // Store stays at reset (config = null) — the mismatched payload
            // was rejected by the guard, never reaching setConfig.
            expect(useConfigStore.getState().config).toBeNull();
        });
    });
});
