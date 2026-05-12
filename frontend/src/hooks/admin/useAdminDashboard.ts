/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * useAdminDashboard hook
 *
 * Encapsulates the durable state-and-effect logic for the project dashboard.
 * AdminDashboard receives this hook's return value and renders JSX from it.
 *
 * Visual-only state that stays in the component:
 * - none (all state is logical: dialog open flags, derived data)
 */

import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { de, enUS, fr, fi } from 'date-fns/locale';
import type { Locale } from 'date-fns';
import {
    useListConcoursesApiAdminConcoursesGet,
    useListStudiesApiAdminStudiesGet,
} from '@/api/generated';
import type { ConcourseRead, StudyRead } from '@/api/model';
import { useAuthStore } from '@/store/useAuthStore';
import { useAdminStore } from '@/store/useAdminStore';

const DATE_LOCALES: Record<string, Locale> = { en: enUS, fr, fi, de };

export interface DashboardAlert {
    key: string;
    message: string;
    action?: () => void;
    actionLabel?: string;
}

export interface AdminDashboardApi {
    isLoading: boolean;
    hasStudies: boolean;
    projectSlug: string;
    studies: StudyRead[] | undefined;
    activeStudies: StudyRead[];
    draftStudies: StudyRead[];
    pausedStudies: StudyRead[];
    closedStudies: StudyRead[];
    totalParticipants: number;
    concourse: ConcourseRead | undefined;
    isConcourseLoading: boolean;
    alerts: DashboardAlert[];
    currentLocale: Locale;
    showCreateDialog: boolean;
    showImportDialog: boolean;
    setShowCreateDialog: (open: boolean) => void;
    setShowImportDialog: (open: boolean) => void;
    getStudyTitle: (study: StudyRead) => string;
    handleOpenStudy: (studySlug: string) => void;
    handleOpenConcourse: () => void;
}

const DAYS_TO_DEADLINE_ALERT = 7;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function useAdminDashboard(): AdminDashboardApi {
    const { currentProject } = useAuthStore();
    const { setActiveStudy } = useAdminStore();
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();

    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [showImportDialog, setShowImportDialog] = useState(false);

    const projectSlug = currentProject?.slug ?? '';
    const currentLocale = DATE_LOCALES[i18n.language] ?? enUS;

    const { data: allStudiesData, isLoading } = useListStudiesApiAdminStudiesGet(undefined, {
        query: { enabled: !!currentProject?.id },
    });

    const { data: concoursesData, isLoading: isConcourseLoading } =
        useListConcoursesApiAdminConcoursesGet(undefined, {
            query: { enabled: !!currentProject?.id },
        });
    const concourse = concoursesData?.items?.[0];

    const studies = useMemo(
        () => allStudiesData?.items?.filter((s) => s.project_id === currentProject?.id),
        [allStudiesData, currentProject?.id]
    );

    const buckets = useMemo(() => {
        const list = studies ?? [];
        return {
            activeStudies: list.filter((s) => s.state === 'active'),
            draftStudies: list.filter((s) => s.state === 'draft'),
            pausedStudies: list.filter((s) => s.state === 'paused'),
            closedStudies: list.filter((s) => s.state === 'closed' || s.state === 'archived'),
        };
    }, [studies]);

    const totalParticipants = useMemo(
        () => (studies ?? []).reduce((sum, s) => sum + (s.participant_count ?? 0), 0),
        [studies]
    );

    const getStudyTitle = useCallback(
        (study: StudyRead): string => {
            const current = study.translations?.find((tr) => tr.language_code === i18n.language);
            if (current?.title) return current.title;
            const en = study.translations?.find((tr) => tr.language_code === 'en');
            if (en?.title) return en.title;
            const any = study.translations?.find((tr) => tr.title);
            if (any?.title) return any.title;
            return study.slug;
        },
        [i18n.language]
    );

    const handleOpenStudy = useCallback(
        (studySlug: string): void => {
            setActiveStudy(studySlug);
            navigate(`/app/${projectSlug}/studies/${studySlug}`);
        },
        [setActiveStudy, navigate, projectSlug]
    );

    const handleOpenConcourse = useCallback((): void => {
        navigate(`/app/${projectSlug}/concourses`);
    }, [navigate, projectSlug]);

    const alerts = useMemo<DashboardAlert[]>(() => {
        const out: DashboardAlert[] = [];
        const now = Date.now();
        for (const study of buckets.activeStudies) {
            if (!study.end_date) continue;
            const daysLeft = Math.ceil((new Date(study.end_date).getTime() - now) / MS_PER_DAY);
            if (daysLeft > 0 && daysLeft <= DAYS_TO_DEADLINE_ALERT) {
                out.push({
                    key: `deadline-${study.id}`,
                    message: t('admin.dashboard.alert_deadline', {
                        study: getStudyTitle(study),
                        days: daysLeft,
                        count: study.participant_count ?? 0,
                        defaultValue:
                            '{{study}}: closing in {{days}} days with {{count}} participants',
                    }),
                    action: () => handleOpenStudy(study.slug),
                    actionLabel: t('admin.dashboard.view', 'View'),
                });
            }
        }
        return out;
    }, [buckets.activeStudies, t, getStudyTitle, handleOpenStudy]);

    return {
        isLoading,
        hasStudies: (studies?.length ?? 0) > 0,
        projectSlug,
        studies,
        activeStudies: buckets.activeStudies,
        draftStudies: buckets.draftStudies,
        pausedStudies: buckets.pausedStudies,
        closedStudies: buckets.closedStudies,
        totalParticipants,
        concourse,
        isConcourseLoading,
        alerts,
        currentLocale,
        showCreateDialog,
        showImportDialog,
        setShowCreateDialog,
        setShowImportDialog,
        getStudyTitle,
        handleOpenStudy,
        handleOpenConcourse,
    };
}
