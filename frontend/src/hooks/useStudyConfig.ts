import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ZodError } from 'zod';
import { ApiError } from '../api/client';
import { useConfigStore } from '../store/useConfigStore';
import { useResponseStore } from '../store/useResponseStore';
import { useSessionStore } from '../store/useSessionStore';
import { applyStudyOverrides } from '../utils/i18nOverrides';
import { localizeStudy } from '../utils/studyLocalization';
import { useGetStudyConfig } from './useGetStudyConfig';

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
    const resetSession = useSessionStore((state) => state.resetSession);
    const resetResponses = useResponseStore((state) => state.resetResponses);

    // Determine language to request
    const langToRequest = sessionLanguage ?? window.navigator.language.substring(0, 2);

    // --- Query Hook ---
    const searchParams = new URLSearchParams(window.location.search);
    const isTestMode = searchParams.get('mode') === 'test';

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
            sessionStorage.setItem('open-q-pilot-mode', 'true');
            setPilotMode(true);
        }
    }, [isTestMode, slug, isPilotMode, setPilotMode]);

    // --- Effect: Handle Test Mode Loading (Config) ---
    useEffect(() => {
        if (!isTestMode || !slug) return;

        const loadFromStorage = () => {
            resetConfig(); // Clear previous study config
            setConfigLoading(true);

            // Check if we need a fresh start (set by StudyDesignPage)
            const resetKey = `open-q-pilot-reset-${slug}`;
            if (localStorage.getItem(resetKey)) {
                resetSession();
                resetResponses();
                localStorage.removeItem(resetKey);
            }

            const draftKey = `open-q-test-draft-${slug}`;
            const legacyKey = `open-q-test-config-${slug}`;

            const draftJson = localStorage.getItem(draftKey);
            const legacyJson = localStorage.getItem(legacyKey);

            console.log(`[useStudyConfig] Participant tab slug: ${slug}`);
            console.log(
                `[useStudyConfig] Keys in localStorage:`,
                Object.keys(localStorage).filter((k) => k.startsWith('open-q-test-'))
            );
            console.log(
                `[useStudyConfig] draftJson: ${draftJson ? 'found' : 'null'}, legacyJson: ${legacyJson ? 'found' : 'null'}`
            );

            if (draftJson || legacyJson) {
                try {
                    let config: any;
                    if (draftJson) {
                        const fullDraft = JSON.parse(draftJson);
                        console.log(
                            '[useStudyConfig] Found test draft. Translations:',
                            fullDraft.translations?.map((tr: any) => tr.language_code)
                        );
                        // Dynamically localize based on current session language
                        config = localizeStudy(
                            fullDraft,
                            sessionLanguage || fullDraft.language || 'en'
                        );
                    } else {
                        config = JSON.parse(legacyJson!);
                    }

                    console.log(
                        '[useStudyConfig] Localized Config Languages:',
                        config.available_languages
                    );
                    setConfig(config);

                    if (config.ui_labels) {
                        applyStudyOverrides(config.language || 'en', config.ui_labels);
                    }

                    if (
                        !sessionLanguage ||
                        (config.language && sessionLanguage !== config.language)
                    ) {
                        setLanguage(config.language || 'en');
                    }

                    setConfigError(null);
                    setConfigLoading(false);
                } catch (e) {
                    console.error('Failed to parse test config from localStorage', e);
                    setConfigError('common.errors.validation');
                    setConfigLoading(false);
                }
            } else {
                setConfigLoading(false);
            }
        };

        // Initial load
        loadFromStorage();

        // Listen for changes from other tabs (Designer)
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === `open-q-test-draft-${slug}` || e.key === `open-q-pilot-reset-${slug}`) {
                loadFromStorage();
            }
        };

        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, [
        isTestMode,
        slug,
        setConfig,
        setLanguage,
        sessionLanguage,
        setConfigError,
        setConfigLoading,
        resetSession,
        resetResponses,
    ]);

    // --- Effect: Handle Stale Data (Reset on Slug Change) ---
    useEffect(() => {
        if (slug && config && config.slug !== slug) {
            resetSession();
            resetConfig();
            resetResponses();
        }
    }, [slug, config, resetSession, resetConfig, resetResponses]);

    // --- Effect: Sync Loading State ---
    useEffect(() => {
        if (!isTestMode) {
            setConfigLoading(isLoading);
        }
    }, [isLoading, setConfigLoading, isTestMode]);

    // --- Effect: Reset Pilot Language on Mode Change ---
    useEffect(() => {
        if (isTestMode && !sessionLanguage && config?.language) {
            setLanguage(config.language);
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
        if (data && !isTestMode) {
            setConfig(data);

            if (data.ui_labels) {
                applyStudyOverrides(data.language || 'en', data.ui_labels);
            }

            if (!sessionLanguage || (data.language && sessionLanguage !== data.language)) {
                setLanguage(data.language || 'en');
            }
            // Clear error on success
            setConfigError(null);

            // Handle password error
            if (data.requires_password && password) {
                setPasswordError(true);
            } else {
                setPasswordError(false);
            }
        }
    }, [data, setConfig, setLanguage, sessionLanguage, setConfigError, isTestMode, password]);

    // --- Effect: Sync Error ---
    useEffect(() => {
        if (error) {
            console.error('Failed to fetch or validate study:', error);
            let errorKey = 'common.errors.unknown';

            if (error instanceof ApiError) {
                if (error.status === 404 || error.status === 422)
                    errorKey = 'common.errors.not_found';
                if (error.status === 429) errorKey = 'common.errors.rate_limited';
            } else if (error instanceof ZodError) {
                errorKey = 'common.errors.validation';
            } else if (
                error instanceof TypeError ||
                (error instanceof Error && error.name === 'TypeError')
            ) {
                errorKey = 'common.errors.network';
            }

            setConfigError(errorKey);
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
