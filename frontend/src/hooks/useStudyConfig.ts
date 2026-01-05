import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ZodError } from 'zod';
import { ApiError } from '../api/client';
import { useConfigStore } from '../store/useConfigStore';
import { useResponseStore } from '../store/useResponseStore';
import { useSessionStore } from '../store/useSessionStore';
import { applyStudyOverrides } from '../utils/i18nOverrides';
import { useGetStudyConfig } from './useGetStudyConfig';

export const useStudyConfig = () => {
    const { slug } = useParams();

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
        { enabled: !!slug && !isPilotMode && !isTestMode }
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

            const draftKey = `open-q-test-config-${slug}`;
            const draftJson = localStorage.getItem(draftKey);
            if (draftJson) {
                try {
                    const draft = JSON.parse(draftJson);
                    setConfig(draft);
                    if (draft.ui_labels) {
                        applyStudyOverrides(draft.language || 'en', draft.ui_labels);
                    }
                    if (
                        !sessionLanguage ||
                        (draft.language && sessionLanguage !== draft.language)
                    ) {
                        setLanguage(draft.language || 'en');
                    }
                    setConfigError(null);
                    setConfigLoading(false);
                    console.log('Loaded study config from localStorage (Test Mode)');
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
        }
    }, [slug, config, resetSession, resetConfig]);

    // --- Effect: Sync Loading State ---
    useEffect(() => {
        if (!isTestMode) {
            setConfigLoading(isLoading);
        }
    }, [isLoading, setConfigLoading, isTestMode]);

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
        }
    }, [data, setConfig, setLanguage, sessionLanguage, setConfigError, isTestMode]);

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
    };
};
