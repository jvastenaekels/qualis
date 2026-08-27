import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ZodError } from 'zod';
import { ApiError } from '../api/client';
import type { StudyConfig } from '../schemas/study';
import { useConfigStore } from '../store/useConfigStore';
import { safeBrowserLocalStorage, safeBrowserSessionStorage } from '../store/safeStorage';
import { useSessionStore } from '../store/useSessionStore';
import { applyStudyOverrides } from '../utils/i18nOverrides';
import { resetAllStores } from '../utils/sessionReset';
import { useGetStudyConfig } from './useGetStudyConfig';
import { getGetStudyApiStudySlugGetQueryKey } from '@/api/generated';
import { queryClient } from '@/lib/queryClient';
import i18n from '../i18n';

/** Map a fetch/parse error onto an i18n translation key for the user-facing message. */
function mapErrorToTranslationKey(error: unknown): string {
    if (error instanceof ApiError) {
        if (error.status === 404 || error.status === 422) return 'common.errors.not_found';
        if (error.status === 429) return 'common.errors.rate_limited';
        return 'common.errors.unknown';
    }
    if (error instanceof ZodError) return 'common.errors.validation';
    if (error instanceof TypeError || (error instanceof Error && error.name === 'TypeError')) {
        return 'common.errors.network';
    }
    return 'common.errors.unknown';
}

/**
 * Parse a localStorage draft (raw, with `translations` array) into the flat
 * StudyConfig shape consumed by the player. Returns the input as-is if it's
 * already a resolved synthetic config (no `translations` array).
 */
// biome-ignore lint/suspicious/noExplicitAny: localStorage draft has dynamic shape
function parseStudyDraft(raw: any, sessionLanguage: string | null): StudyConfig {
    if (!raw.translations || !Array.isArray(raw.translations)) {
        return raw as StudyConfig;
    }

    const lang = sessionLanguage || raw.translations[0]?.language_code || 'en';
    const tr =
        // biome-ignore lint/suspicious/noExplicitAny: draft translation type
        raw.translations.find((t: any) => t.language_code === lang) || raw.translations[0];

    return {
        ...raw,
        title: tr?.title || 'No Title',
        subtitle: tr?.subtitle,
        description: tr?.description,
        objective: tr?.objective,
        instructions: tr?.instructions,
        consent: {
            title: tr?.consent_title,
            description: tr?.consent_description,
        },
        pre_instruction: tr?.pre_instruction,
        condition_of_instruction: tr?.condition_of_instruction,
        ui_labels: tr?.ui_labels || {},
        process_steps: tr?.process_steps || [],
        language: lang,
        // biome-ignore lint/suspicious/noExplicitAny: draft statement type
        statements: (raw.statements || []).map((s: any, index: number) => {
            // biome-ignore lint/suspicious/noExplicitAny: draft translation type
            const st = s.translations?.find((t: any) => t.language_code === lang);
            return {
                id: index + 1,
                code: s.code,
                text: st?.text || '',
            };
        }),
    } as StudyConfig;
}

/** Sync i18n + session language to the resolved config language. */
async function syncConfigLanguage(
    configLanguage: string | undefined,
    sessionLanguage: string | null,
    setLanguage: (lang: string) => void
): Promise<void> {
    if (!configLanguage) return;
    if (i18n.language !== configLanguage) {
        await i18n.changeLanguage(configLanguage);
    }
    if (sessionLanguage !== configLanguage) {
        setLanguage(configLanguage);
    }
}

/**
 * Apply server data's resolved language to i18n and the session store, and
 * seed the query cache for the resolved language on first detection so the
 * next render doesn't trigger a duplicate fetch.
 */
function syncResolvedLanguage(
    data: StudyConfig,
    slug: string | undefined,
    sessionLanguage: string | null,
    password: string | undefined,
    setLanguage: (lang: string) => void
): void {
    const langChanged = !sessionLanguage || (data.language && sessionLanguage !== data.language);
    if (!langChanged) return;
    const newLang = data.language || 'en';

    // Seed the cache only on first detection (sessionLanguage was null) so a
    // freshly visited page doesn't re-fetch under the resolved language.
    if (!sessionLanguage && slug) {
        const searchParams = new URLSearchParams(window.location.search);
        const linkToken = searchParams.get('token') || undefined;
        queryClient.setQueryData(
            getGetStudyApiStudySlugGetQueryKey(slug, {
                lang: newLang,
                link_token: linkToken,
                password,
            }),
            data
        );
    }

    if (sessionLanguage !== newLang) setLanguage(newLang);
    if (i18n.language !== newLang) i18n.changeLanguage(newLang);
}

export const useStudyConfig = () => {
    const { slug } = useParams();
    const [password, setPasswordState] = useState<string | undefined>();
    const [passwordError, setPasswordError] = useState<boolean>(false);

    // Store Actions
    const setConfig = useConfigStore((state) => state.setConfig);
    const setConfigLoading = useConfigStore((state) => state.setLoading);
    const setConfigError = useConfigStore((state) => state.setError);
    const config = useConfigStore((state) => state.config);
    const resetConfig = useConfigStore((state) => state.resetConfig);

    // Session Store
    const isPilotMode = useSessionStore((state) => state.isPilotMode);
    const setPilotMode = useSessionStore((state) => state.setPilotMode);
    const sessionLanguage = useSessionStore((state) => state.language);
    const setLanguage = useSessionStore((state) => state.setLanguage);

    // --- Query Hook ---
    const searchParams = new URLSearchParams(window.location.search);
    const isTestMode = searchParams.get('mode') === 'test';

    // Determine language to request
    // Priority: sessionLanguage (persisted) -> URL parameter -> null (let backend decide)
    const langToRequest = sessionLanguage || searchParams.get('lang') || undefined;

    const { data, isLoading, error, refetch } = useGetStudyConfig(
        slug,
        langToRequest,
        // Disable query if we're in pilot mode (using local draft)
        { enabled: !!slug && !isPilotMode && !isTestMode },
        password
    );

    // --- Effect: Handle Test Mode Loading ---
    useEffect(() => {
        if (slug && isTestMode && !isPilotMode) {
            // Set flag for storage isolation in this tab
            safeBrowserSessionStorage.setItem('qualis-pilot-mode', 'true');
            setPilotMode(true);
        }
    }, [isTestMode, slug, isPilotMode, setPilotMode]);

    // --- Effect: Handle Test Mode Loading (Config) ---
    useEffect(() => {
        if (!isTestMode || !slug) return;

        // Per-load cancellation guard (issue #30). The async loadFromStorage
        // chain awaits i18n.changeLanguage / refetch before calling setState;
        // if the slug changes or the component unmounts mid-load, the in-flight
        // chain must not fire setState with the previous study's data (a stale
        // study flash + setState-after-unmount). Cleanup flips this flag, and
        // every awaited continuation below checks it before touching state.
        // The storage listener also re-enters loadFromStorage, so gating on this
        // single effect-scoped flag covers both the initial load and any late
        // storage-triggered reload: once cancelled, neither can write state.
        let cancelled = false;

        // Cancellation-aware `setLoading(false)` for the load chain's finally
        // blocks: a no-op once the effect has been torn down.
        const finishLoading = (): void => {
            if (!cancelled) setConfigLoading(false);
        };

        // Cancellation-aware commit of a resolved config + its UI overrides.
        // Called only on the happy path after every await guard has passed.
        const commitConfig = (resolved: StudyConfig): void => {
            if (cancelled) return;
            if (resolved.ui_labels) {
                applyStudyOverrides(resolved.language || 'en', resolved.ui_labels);
            }
            setConfig(resolved);
            setConfigError(null);
        };

        const loadFromLocalDraft = async (
            draftJson: string | null,
            legacyJson: string | null
        ): Promise<void> => {
            try {
                const config = draftJson
                    ? parseStudyDraft(JSON.parse(draftJson), sessionLanguage)
                    : (JSON.parse(legacyJson as string) as StudyConfig);

                await syncConfigLanguage(config.language, sessionLanguage, setLanguage);
                if (cancelled) return;
                commitConfig(config);
            } catch (e) {
                if (cancelled) return;
                console.error('Failed to parse test config from localStorage', e);
                setConfigError('common.errors.validation');
            } finally {
                finishLoading();
            }
        };

        // Sync i18n + session language to the server data's resolved language.
        // Returns false when the load was cancelled mid-await (caller must abort).
        const syncServerLang = async (serverData: StudyConfig): Promise<boolean> => {
            const langChanged =
                !sessionLanguage ||
                (serverData.language && sessionLanguage !== serverData.language);
            if (!langChanged) return true;
            const newLang = serverData.language || 'en';
            await i18n.changeLanguage(newLang);
            if (cancelled) return false;
            setLanguage(newLang);
            return true;
        };

        const applyServerData = async (serverData: StudyConfig): Promise<void> => {
            if (serverData.ui_labels) {
                applyStudyOverrides(serverData.language || 'en', serverData.ui_labels);
            }
            if (!(await syncServerLang(serverData))) return;
            if (cancelled) return;
            setConfig(serverData);
            setConfigError(null);
        };

        const loadFromServerFallback = async (): Promise<void> => {
            console.warn(
                `[useStudyConfig] No draft found in localStorage for ${slug}. Attempting server fallback.`
            );
            try {
                const { data: serverData } = await refetch();
                if (!serverData) throw new Error('Server returned no data');
                await applyServerData(serverData);
            } catch (err) {
                if (cancelled) return;
                console.error('[useStudyConfig] Server fallback failed', err);
                setConfigError('common.errors.not_found');
            } finally {
                finishLoading();
            }
        };

        const loadFromStorage = async () => {
            if (cancelled) return;
            resetConfig(); // Clear previous study config
            setConfigLoading(true);

            // Honour the StudyDesignPage reset signal before reading drafts.
            const resetKey = `qualis-pilot-reset-${slug}`;
            if (safeBrowserLocalStorage.getItem(resetKey)) {
                resetAllStores({ skipConfig: true });
                safeBrowserLocalStorage.removeItem(resetKey);
            }

            const draftJson = safeBrowserLocalStorage.getItem(`qualis-test-draft-${slug}`);
            const legacyJson = safeBrowserLocalStorage.getItem(`qualis-test-config-${slug}`);

            if (draftJson || legacyJson) {
                await loadFromLocalDraft(draftJson, legacyJson);
            } else {
                await loadFromServerFallback();
            }
        };

        // Initial load
        loadFromStorage();

        // Listen for changes from other tabs (Designer)
        const handleStorageChange = (e: StorageEvent) => {
            if (cancelled) return;
            if (e.key === `qualis-test-draft-${slug}` || e.key === `qualis-pilot-reset-${slug}`) {
                loadFromStorage();
            }
        };

        window.addEventListener('storage', handleStorageChange);
        return () => {
            cancelled = true;
            window.removeEventListener('storage', handleStorageChange);
        };
    }, [
        isTestMode,
        slug,
        setConfig,
        setLanguage,
        sessionLanguage,
        setConfigError,
        setConfigLoading,
        resetConfig,
        refetch,
    ]);

    // --- Effect: Handle Stale Data (Reset on Slug Change) ---
    // This is the "Slug Guard" - it ensures clean slate when switching studies.
    // Guard against empty/partial config (e.g. when an in-flight request
    // resolves with no slug yet, or when a test mock returns a partial body):
    // we only reset when the loaded config carries a *different* slug than
    // the URL — never when it has no slug at all.
    useEffect(() => {
        if (slug && config?.slug && config.slug !== slug) {
            resetAllStores();
        }
    }, [slug, config?.slug]);

    // --- Effect: Sync Loading State ---
    useEffect(() => {
        if (!isTestMode) {
            setConfigLoading(isLoading);
        }
    }, [isLoading, setConfigLoading, isTestMode]);

    // --- Effect: Reset Pilot Language on Mode Change ---
    useEffect(() => {
        if (isTestMode && !sessionLanguage && config?.language) {
            if (sessionLanguage !== config.language) {
                setLanguage(config.language);
            }
        }
    }, [isTestMode, sessionLanguage, config?.language, setLanguage]);

    // --- Effect: Handle Stale Language (Show loader while switching) ---
    useEffect(() => {
        if (!isTestMode && sessionLanguage && config && config.language !== sessionLanguage) {
            setConfigLoading(true);
        }
    }, [sessionLanguage, config, setConfigLoading, isTestMode]);

    // --- Effect: Sync Data on Success ---
    useEffect(() => {
        // Defensive guard: ignore responses whose slug doesn't match the current
        // URL slug. This can happen during navigation (stale in-flight request)
        // or when a fixture/server returns the wrong study. Without this guard,
        // setConfig(data) writes the wrong slug, the slug-guard above fires and
        // resets everything — including the query cache — which triggers a refetch,
        // and the cycle repeats until the heap is exhausted.
        if (data?.slug && slug && data.slug !== slug) return;
        if (!data || isTestMode) return;

        setConfig(data);
        if (data.ui_labels) {
            applyStudyOverrides(data.language || 'en', data.ui_labels);
        }
        syncResolvedLanguage(data, slug, sessionLanguage, password, setLanguage);
        setConfigError(null);
        setPasswordError(Boolean(data.requires_password && password));
    }, [data, setConfig, setLanguage, sessionLanguage, setConfigError, isTestMode, password, slug]);

    // --- Effect: Sync Error ---
    useEffect(() => {
        if (error) {
            console.error('Failed to fetch or validate study:', error);
            setConfigError(mapErrorToTranslationKey(error));
        }
    }, [error, setConfigError]);

    return {
        retry: refetch,
        unlock: (pw: string) => {
            setPasswordState(pw);
        },
        passwordError,
    };
};
