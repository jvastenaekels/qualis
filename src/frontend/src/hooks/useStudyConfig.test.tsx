import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import { useConfigStore } from '../store/useConfigStore';
import { useResponseStore } from '../store/useResponseStore';
import { useSessionStore } from '../store/useSessionStore';
import { applyStudyOverrides } from '../utils/i18nOverrides';
import { PILOT_NO_DRAFT } from '../utils/pilotMode';
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
        sessionStorage.clear();
    });

    // The pilot-mode tests spy on URLSearchParams.get; without a restore, test mode leaks
    // into every later test and disables the server-config path.
    afterEach(() => {
        vi.restoreAllMocks();
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

    it('mode=test without a local draft shows it is not a participant link', async () => {
        vi.spyOn(URLSearchParams.prototype, 'get').mockImplementation((key) => {
            if (key === 'mode') return 'test';
            return null;
        });
        localStorage.clear();

        // The server holds a live study: it must neither be asked for nor shown.
        const refetchMock = vi.fn().mockResolvedValue({
            data: { slug: 'test-study', title: 'Live Study Title', language: 'en' },
        });
        vi.mocked(useGetStudyConfig).mockReturnValue({
            data: undefined,
            isLoading: false,
            error: null,
            refetch: refetchMock,
            // biome-ignore lint/suspicious/noExplicitAny: mock hook
        } as any);

        renderHook(() => useStudyConfig());

        await waitFor(() => {
            expect(useConfigStore.getState().error).toBe(PILOT_NO_DRAFT);
        });
        expect(useConfigStore.getState().config).toBeNull();
        expect(refetchMock).not.toHaveBeenCalled();
        expect(vi.mocked(useGetStudyConfig).mock.calls.at(-1)?.[2]).toEqual({ enabled: false });
    });

    it('mode=test refuses the same way when localStorage is unavailable', async () => {
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
        const refetchMock = vi.fn();
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
                expect(useConfigStore.getState().error).toBe(PILOT_NO_DRAFT);
            });
            expect(useConfigStore.getState().config).toBeNull();
            expect(refetchMock).not.toHaveBeenCalled();
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

    describe('Test run draft', () => {
        const tr = (language_code: string, title: string, extra = {}) => ({
            language_code,
            title,
            ui_labels: {},
            process_steps: [],
            ...extra,
        });

        function openDraft(draft: Record<string, unknown>, params: Record<string, string> = {}) {
            vi.spyOn(URLSearchParams.prototype, 'get').mockImplementation((key) =>
                key === 'mode' ? 'test' : (params[key] ?? null)
            );
            localStorage.clear();
            localStorage.setItem(
                'qualis-test-draft-test-study',
                JSON.stringify({ slug: 'test-study', statements: [], ...draft })
            );
            vi.mocked(i18n.changeLanguage).mockResolvedValue(
                // biome-ignore lint/suspicious/noExplicitAny: i18n.changeLanguage returns a TFunction promise we don't use
                undefined as any
            );
            vi.mocked(useGetStudyConfig).mockReturnValue({
                data: undefined,
                isLoading: false,
                error: null,
                refetch: vi.fn(),
                // biome-ignore lint/suspicious/noExplicitAny: mock hook
            } as any);
            return renderHook(() => useStudyConfig());
        }

        /** F5: the hook and the config go, the tab's sessionStorage and the answers stay. */
        function reloadTab(): void {
            useConfigStore.getState().resetConfig();
            renderHook(() => useStudyConfig());
        }

        const statement = (code: string) => ({
            code,
            translations: [{ language_code: 'en', text: code }],
        });

        it('a reload keeps the draft under test and its notice', async () => {
            const { unmount } = openDraft({
                default_language: 'en',
                translations: [tr('en', 'First')],
                statements: [statement('S1'), statement('S2')],
            });
            await waitFor(() => expect(useSessionStore.getState().language).toBe('en'));
            await act(async () => {
                await new Promise((resolve) => setTimeout(resolve, 50));
            });
            await waitFor(() => expect(useConfigStore.getState().config?.title).toBe('First'));

            // The designer removes a statement. The answers still hold both cards: under the
            // shorter draft, Confirm would bounce between fine-sort and post-sort for good.
            unmount();
            localStorage.setItem(
                'qualis-test-draft-test-study',
                JSON.stringify({
                    slug: 'test-study',
                    default_language: 'en',
                    translations: [tr('en', 'Second')],
                    statements: [statement('S1')],
                })
            );
            reloadTab();

            await waitFor(() => expect(useConfigStore.getState().config?.title).toBe('First'));
            expect(useConfigStore.getState().config?.statements).toHaveLength(2);
            await waitFor(() => expect(useConfigStore.getState().designChanged).toBe(true));
        });

        it('a reload with an unchanged design raises no notice', async () => {
            const { unmount } = openDraft({
                default_language: 'en',
                translations: [tr('en', 'First')],
            });
            await waitFor(() => expect(useConfigStore.getState().config?.title).toBe('First'));

            unmount();
            reloadTab();

            await waitFor(() => expect(useConfigStore.getState().config?.title).toBe('First'));
            expect(useConfigStore.getState().designChanged).toBe(false);
        });

        it('the pilot reset key drops the held draft and takes the latest one', async () => {
            const { unmount } = openDraft({
                default_language: 'en',
                translations: [tr('en', 'First')],
            });
            await waitFor(() => expect(useSessionStore.getState().language).toBe('en'));
            await act(async () => {
                await new Promise((resolve) => setTimeout(resolve, 50));
            });
            await waitFor(() => expect(useConfigStore.getState().config?.title).toBe('First'));

            unmount();
            localStorage.setItem(
                'qualis-test-draft-test-study',
                JSON.stringify({
                    slug: 'test-study',
                    statements: [],
                    default_language: 'en',
                    translations: [tr('en', 'Second')],
                })
            );
            localStorage.setItem('qualis-pilot-reset-test-study', 'true');
            reloadTab();

            await waitFor(() => expect(useConfigStore.getState().config?.title).toBe('Second'));
            expect(useConfigStore.getState().designChanged).toBe(false);
        });

        it('a draft lists its translations as available languages', async () => {
            openDraft({
                default_language: 'en',
                translations: [tr('en', 'Study'), tr('fi', 'Tutkimus')],
            });
            await waitFor(() =>
                expect(useConfigStore.getState().config?.available_languages).toEqual(['en', 'fi'])
            );
        });

        it('a draft opens in default_language, not the first translation', async () => {
            openDraft({
                default_language: 'fi',
                translations: [tr('en', 'Study'), tr('fi', 'Tutkimus')],
            });
            await waitFor(() => expect(useConfigStore.getState().config?.title).toBe('Tutkimus'));
            expect(useConfigStore.getState().config?.language).toBe('fi');
        });

        it('opens in the language named by ?lang= when the draft has it', async () => {
            openDraft(
                {
                    default_language: 'en',
                    translations: [tr('en', 'Study'), tr('fi', 'Tutkimus')],
                },
                { lang: 'fi' }
            );
            await waitFor(() => expect(useConfigStore.getState().config?.title).toBe('Tutkimus'));
        });

        it('?lang= wins over the session language', async () => {
            useSessionStore.getState().setLanguage('en');
            openDraft(
                {
                    default_language: 'en',
                    translations: [tr('en', 'Study'), tr('fi', 'Tutkimus')],
                },
                { lang: 'fi' }
            );
            await waitFor(() => expect(useConfigStore.getState().config?.title).toBe('Tutkimus'));
        });

        it('a ?lang= the draft lacks falls back to the session language, not the default', async () => {
            useSessionStore.getState().setLanguage('fi');
            openDraft(
                {
                    default_language: 'en',
                    translations: [tr('en', 'Study'), tr('fi', 'Tutkimus')],
                },
                { lang: 'de' }
            );
            await waitFor(() => expect(useConfigStore.getState().config?.title).toBe('Tutkimus'));
        });

        it('a language the draft lacks falls back to its default', async () => {
            useSessionStore.getState().setLanguage('de');
            openDraft({
                default_language: 'fi',
                translations: [tr('en', 'Study'), tr('fi', 'Tutkimus')],
            });
            await waitFor(() => expect(useConfigStore.getState().config?.title).toBe('Tutkimus'));
        });

        it('a Finnish-only draft offers no English', async () => {
            openDraft({
                default_language: 'fi',
                translations: [tr('fi', 'Tutkimus')],
            });
            await waitFor(() =>
                expect(useConfigStore.getState().config?.available_languages).toEqual(['fi'])
            );
        });

        it('an untranslated statement shows its code, not an empty card', async () => {
            openDraft({
                default_language: 'fi',
                translations: [tr('en', 'Study'), tr('fi', 'Tutkimus')],
                statements: [
                    { code: 'S1', translations: [{ language_code: 'en', text: 'Hello' }] },
                    { code: 'S2', translations: [{ language_code: 'fi', text: 'Hei' }] },
                ],
            });
            await waitFor(() =>
                expect(useConfigStore.getState().config?.statements.map((s) => s.text)).toEqual([
                    'S1',
                    'Hei',
                ])
            );
        });

        it('a draft carries methodology tips and step help', async () => {
            const stepHelp = { presort: { what: 'Sort', why: 'To see' } };
            openDraft({
                default_language: 'fi',
                translations: [
                    tr('en', 'Study', { methodology_tips: ['en tip'] }),
                    tr('fi', 'Tutkimus', { methodology_tips: ['fi tip'], step_help: stepHelp }),
                ],
            });
            await waitFor(() => expect(useConfigStore.getState().config?.title).toBe('Tutkimus'));
            expect(useConfigStore.getState().config?.methodology_tips).toEqual(['fi tip']);
            expect(useConfigStore.getState().config?.step_help).toEqual(stepHelp);
        });

        it('a designer change does not reload a running test', async () => {
            const draft = (title: string) =>
                JSON.stringify({
                    slug: 'test-study',
                    statements: [],
                    default_language: 'en',
                    translations: [tr('en', title)],
                });
            openDraft({ default_language: 'en', translations: [tr('en', 'First')] });
            // The first load syncs the session language, which reloads once more: let it settle.
            await waitFor(() => expect(useSessionStore.getState().language).toBe('en'));
            await act(async () => {
                await new Promise((resolve) => setTimeout(resolve, 50));
            });
            await waitFor(() => expect(useConfigStore.getState().config?.title).toBe('First'));
            const running = useConfigStore.getState().config;

            act(() => {
                window.dispatchEvent(
                    new StorageEvent('storage', {
                        key: 'qualis-test-draft-test-study',
                        newValue: draft('Second'),
                    })
                );
            });

            expect(useConfigStore.getState().config).toBe(running);
            expect(useConfigStore.getState().config?.title).toBe('First');
            expect(useConfigStore.getState().designChanged).toBe(true);
        });

        it('a draft that did not change leaves the test unmarked', async () => {
            openDraft({ default_language: 'en', translations: [tr('en', 'First')] });
            await waitFor(() => expect(useConfigStore.getState().config?.title).toBe('First'));

            act(() => {
                window.dispatchEvent(
                    new StorageEvent('storage', {
                        key: 'qualis-test-draft-test-study',
                        newValue: localStorage.getItem('qualis-test-draft-test-study'),
                    })
                );
            });

            expect(useConfigStore.getState().designChanged).toBe(false);
        });

        it('a Save with no other change raises no notice, a real change does', async () => {
            const stamped = (title: string, at: string) =>
                JSON.stringify({
                    slug: 'test-study',
                    statements: [],
                    default_language: 'en',
                    updated_at: at,
                    last_updated_at: at,
                    translations: [tr('en', title)],
                });
            openDraft({ default_language: 'en', translations: [tr('en', 'First')] });
            await waitFor(() => expect(useSessionStore.getState().language).toBe('en'));
            await act(async () => {
                await new Promise((resolve) => setTimeout(resolve, 50));
            });
            const send = (newValue: string) =>
                act(() => {
                    window.dispatchEvent(
                        new StorageEvent('storage', {
                            key: 'qualis-test-draft-test-study',
                            newValue,
                        })
                    );
                });
            // The draft the test began with carries no stamps; Save adds both.
            const began = localStorage.getItem('qualis-test-draft-test-study') ?? '';
            send(JSON.stringify({ ...JSON.parse(began), updated_at: 'T1', last_updated_at: 'T1' }));
            expect(useConfigStore.getState().designChanged).toBe(false);

            send(stamped('Second', 'T2'));
            expect(useConfigStore.getState().designChanged).toBe(true);
        });

        it('a draft that appears on the refusal screen still loads', async () => {
            vi.spyOn(URLSearchParams.prototype, 'get').mockImplementation((key) =>
                key === 'mode' ? 'test' : null
            );
            localStorage.clear();
            vi.mocked(useGetStudyConfig).mockReturnValue({
                data: undefined,
                isLoading: false,
                error: null,
                refetch: vi.fn(),
                // biome-ignore lint/suspicious/noExplicitAny: mock hook
            } as any);
            renderHook(() => useStudyConfig());
            await waitFor(() => expect(useConfigStore.getState().error).toBe(PILOT_NO_DRAFT));

            const raw = JSON.stringify({
                slug: 'test-study',
                statements: [],
                default_language: 'en',
                translations: [tr('en', 'Late')],
            });
            localStorage.setItem('qualis-test-draft-test-study', raw);
            act(() => {
                window.dispatchEvent(
                    new StorageEvent('storage', {
                        key: 'qualis-test-draft-test-study',
                        newValue: raw,
                    })
                );
            });

            await waitFor(() => expect(useConfigStore.getState().config?.title).toBe('Late'));
        });

        it('a language switch mid-test keeps the design the test began with', async () => {
            openDraft({
                default_language: 'en',
                translations: [tr('en', 'First'), tr('fi', 'Eka')],
            });
            await waitFor(() => expect(useConfigStore.getState().config?.title).toBe('First'));
            const newer = JSON.stringify({
                slug: 'test-study',
                statements: [],
                default_language: 'en',
                translations: [tr('en', 'Second'), tr('fi', 'Toka')],
            });
            localStorage.setItem('qualis-test-draft-test-study', newer);
            act(() => {
                window.dispatchEvent(
                    new StorageEvent('storage', {
                        key: 'qualis-test-draft-test-study',
                        newValue: newer,
                    })
                );
            });

            act(() => useSessionStore.getState().setLanguage('fi'));

            await waitFor(() => expect(useConfigStore.getState().config?.title).toBe('Eka'));
            expect(useConfigStore.getState().designChanged).toBe(true);
        });

        it('the pilot reset key wipes the test progress and is consumed', async () => {
            vi.spyOn(URLSearchParams.prototype, 'get').mockImplementation((key) =>
                key === 'mode' ? 'test' : null
            );
            localStorage.clear();
            localStorage.setItem(
                'qualis-test-draft-test-study',
                JSON.stringify({
                    slug: 'test-study',
                    statements: [],
                    default_language: 'en',
                    translations: [tr('en', 'First')],
                })
            );
            localStorage.setItem('qualis-pilot-reset-test-study', 'true');
            useResponseStore.getState().setPresortResponse({ q: 'old answer' });
            vi.mocked(useGetStudyConfig).mockReturnValue({
                data: undefined,
                isLoading: false,
                error: null,
                refetch: vi.fn(),
                // biome-ignore lint/suspicious/noExplicitAny: mock hook
            } as any);

            renderHook(() => useStudyConfig());

            await waitFor(() => expect(useConfigStore.getState().config?.title).toBe('First'));
            expect(localStorage.getItem('qualis-pilot-reset-test-study')).toBeNull();
            expect(JSON.stringify(useResponseStore.getState().presort)).not.toContain('old answer');
        });
    });

    it('keeps the unlocked password for the consent call once the server accepts it', async () => {
        vi.mocked(useGetStudyConfig).mockReturnValue({
            data: {
                slug: 'test-study',
                title: 'Unlocked',
                language: 'en',
                presort_config: {},
                statements: [],
                requires_password: false,
            },
            isLoading: false,
            error: null,
            refetch: vi.fn(),
            // biome-ignore lint/suspicious/noExplicitAny: mock hook
        } as any);

        const { result } = renderHook(() => useStudyConfig());
        act(() => result.current.unlock('pw'));

        await waitFor(() => {
            expect(useSessionStore.getState().studyPassword).toBe('pw');
        });
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
