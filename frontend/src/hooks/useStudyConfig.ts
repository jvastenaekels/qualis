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
        if (isTestMode && slug) {
            // Check if we need a fresh start (set by StudyDesignPage)
            if (localStorage.getItem(`open-q-pilot-reset-${slug}`)) {
                resetSession();
                resetResponses();
                localStorage.removeItem(`open-q-pilot-reset-${slug}`);
            }

            const draftKey = `open-q-test-draft-${slug}`;
            const legacyKey = `open-q-test-config-${slug}`;

            const draftJson = localStorage.getItem(draftKey);
            const legacyJson = localStorage.getItem(legacyKey);

            if (draftJson || legacyJson) {
                try {
                    let config: any;
                    if (draftJson) {
                        const fullDraft = JSON.parse(draftJson);
                        // Dynamically localize based on current session language
                        config = localizeStudy(
                            fullDraft,
                            sessionLanguage || fullDraft.language || 'en'
                        );
                    } else {
                        config = JSON.parse(legacyJson!);
                    }

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
                    console.log(
                        'Loaded study config from localStorage (Test Mode)',
                        draftJson ? '(Full Draft)' : '(Legacy)'
                    );
                } catch (e) {
                    console.error('Failed to parse test config from localStorage', e);
                    setConfigError('common.errors.validation');
                }
            } else {
                // If no local data, we could fallback to API or show error
                // For now, let's just trigger the normal loading if its enabled
            }
        }
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
