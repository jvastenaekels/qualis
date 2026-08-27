/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Locale, browser-title, and welcome-back coordination for the study layout.
 *
 * Owns four cooperating effects:
 * - URL `?lang=` override (applied once per query change, only when the
 *   language is part of `available_languages` and differs from the
 *   current session language),
 * - i18n + `<html lang>` sync from the session store,
 * - browser tab title (`<study title> | Qualis`),
 * - welcome-back toast for returning same-browser users; suppressed when
 *   ResumePage already showed its own toast (sessionStorage flag).
 */

import type { StudyConfig } from '@/schemas/study';
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { useSessionStore } from '../../store/useSessionStore';

interface UseStudyLocaleSyncArgs {
    config: StudyConfig | null;
    sessionLanguage: string | null;
    hasConsented: boolean;
    isCompleted: boolean;
    isPilotMode: boolean;
    maxReachedStep: number;
}

export function useStudyLocaleSync({
    config,
    sessionLanguage,
    hasConsented,
    isCompleted,
    isPilotMode,
    maxReachedStep,
}: UseStudyLocaleSyncArgs): void {
    const { t } = useTranslation();
    const location = useLocation();

    // URL Language Override (e.g. ?lang=fr)
    useEffect(() => {
        const urlLang = new URLSearchParams(location.search).get('lang');
        const availableLangs = config?.available_languages || ['en'];
        if (urlLang && availableLangs.includes(urlLang) && urlLang !== sessionLanguage) {
            i18n.changeLanguage(urlLang);
            useSessionStore.getState().setLanguage(urlLang);
        }
    }, [location.search, config?.available_languages, sessionLanguage]);

    // Sync i18n + <html lang> from the session store.
    useEffect(() => {
        if (sessionLanguage) {
            if (sessionLanguage !== i18n.language) {
                i18n.changeLanguage(sessionLanguage);
            }
            document.documentElement.lang = sessionLanguage;
        }
    }, [sessionLanguage]);

    // Browser tab title.
    useEffect(() => {
        if (config?.title) {
            document.title = `${config.title} | ${t('layout.title', 'Qualis')}`;
        } else {
            document.title = t('layout.title', 'Qualis');
        }
    }, [config?.title, t]);

    // Welcome-back toast (skipped when ResumePage already showed one).
    // Only fires when maxReachedStep was already > 1 at mount, not when
    // the user first progresses past step 1. Waits for i18n.language to
    // match sessionLanguage so the toast is localized.
    const mountMaxStep = useRef(maxReachedStep);
    const hasShownWelcomeBack = useRef(false);
    const langReady = !sessionLanguage || i18n.language === sessionLanguage;
    useEffect(() => {
        if (
            !hasShownWelcomeBack.current &&
            langReady &&
            mountMaxStep.current > 1 &&
            hasConsented &&
            !isCompleted &&
            !isPilotMode &&
            maxReachedStep > 1
        ) {
            hasShownWelcomeBack.current = true;
            try {
                if (sessionStorage.getItem('qualis-resumed-via-link') === '1') {
                    sessionStorage.removeItem('qualis-resumed-via-link');
                    return; // ResumePage already showed a toast
                }
            } catch {
                // Ignore storage errors
            }
            toast.success(
                t('resume.welcome_back', 'Welcome back! Your progress has been restored.')
            );
        }
    }, [hasConsented, isCompleted, isPilotMode, langReady, maxReachedStep, t]);
}
