/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * useInteractiveDataView hook
 *
 * Encapsulates the durable state-and-effect logic for the admin data view.
 * InteractiveDataView receives this hook's return value and renders JSX
 * from it (Phase 5 item G; precedent: useConcourseDetailPage).
 *
 * Logic that moves here: dump react-query + derivations, 11 filter/dialog
 * useState, all aggregates (counts, duplicateIpGroups, deviceBreakdown,
 * filteredParticipants), react-table instance, and 7 callbacks.
 *
 * Visual-only state that stays in the component: none (no DOM useRef in
 * this component); the JSX shell and skeleton/error early-returns stay.
 */

import { useState, useMemo, useCallback, type Dispatch, type SetStateAction } from 'react';
import {
    useReactTable,
    getCoreRowModel,
    getSortedRowModel,
    getPaginationRowModel,
    type SortingState,
} from '@tanstack/react-table';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { de, enUS, fr, fi, type Locale } from 'date-fns/locale';
import {
    useGetStudyDumpApiAdminStudiesSlugDumpGet,
    getGetStudyDumpApiAdminStudiesSlugDumpGetQueryKey,
} from '@/api/generated';
import { customInstance } from '@/api/mutator';
import { parseUA } from '@/utils/uaParser';
import { getStepLabels } from '@/utils/studySteps';
import type { ParticipantRead } from '@/api/model';
import type { DumpParticipant, DumpResponse } from '@/components/admin/dashboard/types';
import {
    matchesQualityFilter,
    matchesConsentFilter,
    matchesStepFilter,
    matchesSearchFilter,
} from '@/components/admin/dashboard/InteractiveDataView.helpers';
import type {
    ConsentType,
    QualityFilter,
    StatusFilter,
    StepFilter,
} from '@/components/admin/dashboard/InteractiveDataView.helpers';
import {
    buildColumns,
    getDisplayStatus,
    FILTERABLE_STEP_KEYS,
    PAGE_SIZE,
} from '@/components/admin/dashboard/InteractiveDataView.columns';

export interface UseInteractiveDataViewParams {
    slug: string;
    initialParticipants?: ParticipantRead[];
}

export interface UseInteractiveDataViewResult {
    status: { isLoading: boolean; error: unknown; hasData: boolean };
    data: DumpResponse;
    rawData: unknown;
    table: ReturnType<typeof useReactTable<DumpParticipant>>;
    columns: ReturnType<typeof buildColumns>;
    pagination: { pageIndex: number; pageSize: number };
    liveParticipants: DumpParticipant[];
    submittedParticipants: DumpParticipant[];
    stepLabels: ReturnType<typeof getStepLabels>;
    currentLocale: Locale;
    metrics: {
        liveCount: number;
        newsletterCount: number;
        interviewCount: number;
        completedCount: number;
        inProgressCount: number;
        deviceBreakdown: Record<string, number>;
    };
    filters: {
        globalFilter: string;
        setGlobalFilter: Dispatch<SetStateAction<string>>;
        qualityFilter: QualityFilter;
        setQualityFilter: Dispatch<SetStateAction<QualityFilter>>;
        statusFilter: StatusFilter;
        setStatusFilter: Dispatch<SetStateAction<StatusFilter>>;
        stepFilter: StepFilter;
        setStepFilter: Dispatch<SetStateAction<StepFilter>>;
        consentFilters: Set<ConsentType>;
        toggleConsent: (type: ConsentType) => void;
        clearAllFilters: () => void;
        hasActiveFilters: boolean;
    };
    dialogs: {
        packageDialogOpen: boolean;
        setPackageDialogOpen: Dispatch<SetStateAction<boolean>>;
        clearAllDialogOpen: boolean;
        setClearAllDialogOpen: Dispatch<SetStateAction<boolean>>;
    };
    actions: {
        handleClearAllParticipants: () => Promise<void>;
        handleViewParticipant: (participant: DumpParticipant) => void;
        runExport: (exportFn: () => Promise<void>) => Promise<void>;
        exportNewsletterList: () => void;
        downloadBlob: (blob: Blob, filename: string) => void;
        isExportLoading: boolean;
    };
}

export function useInteractiveDataView({
    slug,
    initialParticipants,
}: UseInteractiveDataViewParams): UseInteractiveDataViewResult {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const { projectSlug } = useParams<{ projectSlug: string }>();
    const queryClient = useQueryClient();

    const dateLocales: Record<string, Locale> = { en: enUS, fr, fi, de };
    const currentLocale = dateLocales[i18n.language] || enUS;

    const { data: rawData, isLoading, error } = useGetStudyDumpApiAdminStudiesSlugDumpGet(slug);

    const [sorting, setSorting] = useState<SortingState>([{ id: 'submitted_at', desc: true }]);
    const [globalFilter, setGlobalFilter] = useState('');
    const [qualityFilter, setQualityFilter] = useState<QualityFilter>('all');
    const [consentFilters, setConsentFilters] = useState<Set<ConsentType>>(new Set());
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [stepFilter, setStepFilter] = useState<StepFilter>('all');
    const [isExportLoading, setIsExportLoading] = useState(false);
    const [packageDialogOpen, setPackageDialogOpen] = useState(false);
    const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: PAGE_SIZE });
    const [clearAllDialogOpen, setClearAllDialogOpen] = useState(false);

    const toggleConsent = useCallback((type: ConsentType) => {
        setConsentFilters((prev) => {
            const next = new Set(prev);
            if (next.has(type)) next.delete(type);
            else next.add(type);
            return next;
        });
    }, []);

    const clearAllFilters = useCallback(() => {
        setConsentFilters(new Set());
        setQualityFilter('all');
        setStatusFilter('all');
        setStepFilter('all');
        setGlobalFilter('');
    }, []);

    const effectiveParticipants = useMemo(() => {
        const dumpData = rawData as unknown as DumpResponse | null;
        if (dumpData?.participants) return dumpData.participants;
        if (initialParticipants) {
            return initialParticipants.map((p) => ({
                id: String(p.id).substring(0, 8),
                db_id: p.id,
                duration_seconds: (p as { duration_seconds?: number }).duration_seconds ?? null,
                scores: [],
                placements: {},
                presort: {},
                postsort: {},
                language: p.language_used || 'en',
                is_discarded: p.is_discarded,
                discard_reason: p.discard_reason,
                created_at: p.created_at,
                submitted_at: p.submitted_at || p.created_at,
                recruitment_token: p.recruitment_token,
                status: p.status,
            })) as DumpParticipant[];
        }
        return [];
    }, [rawData, initialParticipants]);

    const data = useMemo(() => {
        if (rawData) return rawData as unknown as DumpResponse;
        return {
            study: {
                slug,
                statements: [],
                translations: [],
                presort_config: {},
                postsort_config: {},
                state: 'draft',
            },
            participants: effectiveParticipants,
            statement_id_to_index: {},
        } as DumpResponse;
    }, [rawData, effectiveParticipants, slug]);

    // Step labels derived from the study config so the filter dropdown and
    // per-row badges adapt to rough_sort_enabled (step 3 vanishes when off).
    const stepLabels = useMemo(
        () =>
            getStepLabels(
                { rough_sort_enabled: data.study.rough_sort_enabled !== false },
                FILTERABLE_STEP_KEYS
            ),
        [data.study.rough_sort_enabled]
    );

    const handleClearAllParticipants = useCallback(async () => {
        try {
            await customInstance({
                url: `/api/admin/studies/${slug}/participants`,
                method: 'DELETE',
            });
            toast.success(
                t('admin.data.actions.clear_all_success', 'All participants successfully cleared!')
            );
            queryClient.invalidateQueries({
                queryKey: getGetStudyDumpApiAdminStudiesSlugDumpGetQueryKey(slug),
            });
        } catch (error) {
            toast.error(
                t(
                    'admin.data.actions.clear_all_error',
                    'Could not clear data. Check your permissions and try again.'
                )
            );
            console.error(error);
        }
    }, [slug, queryClient, t]);

    const liveParticipants = useMemo(() => effectiveParticipants, [effectiveParticipants]);

    const liveCount = liveParticipants.length;
    const newsletterCount = liveParticipants.filter(
        (p) => p.postsort.newsletter_consent && p.postsort.email
    ).length;
    const interviewCount = liveParticipants.filter((p) => p.postsort.interview_consent).length;
    const completedCount = liveParticipants.filter(
        (p) => getDisplayStatus(p) === 'completed'
    ).length;
    const inProgressCount = liveParticipants.filter(
        (p) => getDisplayStatus(p) === 'in_progress'
    ).length;
    const submittedParticipants = useMemo(
        () => liveParticipants.filter((p) => p.status === 'completed'),
        [liveParticipants]
    );
    // Map duplicate IP hashes to a group number so participants sharing the same IP can be linked visually
    const duplicateIpGroups = useMemo(() => {
        const ipCounts = new Map<string, number>();
        for (const p of liveParticipants) {
            if (p.ip_address) {
                ipCounts.set(p.ip_address, (ipCounts.get(p.ip_address) || 0) + 1);
            }
        }
        const groups = new Map<string, number>();
        let groupNum = 1;
        for (const [ip, count] of ipCounts) {
            if (count > 1) {
                groups.set(ip, groupNum);
                groupNum++;
            }
        }
        return groups;
    }, [liveParticipants]);

    const deviceBreakdown = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const p of liveParticipants) {
            const { device } = parseUA(p.user_agent);
            counts[device] = (counts[device] || 0) + 1;
        }
        return counts;
    }, [liveParticipants]);

    const hasActiveFilters =
        consentFilters.size > 0 ||
        qualityFilter !== 'all' ||
        statusFilter !== 'all' ||
        stepFilter !== 'all' ||
        globalFilter !== '';

    const filteredParticipants = useMemo(
        () =>
            liveParticipants.filter(
                (p) =>
                    matchesQualityFilter(p, qualityFilter) &&
                    matchesConsentFilter(p, consentFilters) &&
                    (statusFilter === 'all' || getDisplayStatus(p) === statusFilter) &&
                    matchesStepFilter(p, stepFilter) &&
                    matchesSearchFilter(p, globalFilter)
            ),
        [liveParticipants, qualityFilter, consentFilters, statusFilter, stepFilter, globalFilter]
    );

    const handleViewParticipant = useCallback(
        (participant: DumpParticipant) => {
            const baseUrl = projectSlug
                ? `/app/${projectSlug}/studies/${slug}`
                : `/admin/studies/${slug}`;
            navigate(`${baseUrl}/participants/${participant.db_id || participant.id}`);
        },
        [navigate, slug, projectSlug]
    );

    const runExport = useCallback(
        async (exportFn: () => Promise<void>) => {
            setIsExportLoading(true);
            try {
                await exportFn();
                toast.success(t('admin.export.success', 'Export successful'));
            } catch (_e) {
                toast.error(t('admin.export.error', 'Export failed'));
            } finally {
                setIsExportLoading(false);
            }
        },
        [t]
    );

    const downloadBlob = useCallback((blob: Blob, filename: string) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }, []);

    const exportNewsletterList = useCallback(() => {
        runExport(async () => {
            const escapeCsv = (v: string) => `"${v.replace(/"/g, '""')}"`;
            const rows = liveParticipants.filter(
                (p) => p.postsort.newsletter_consent && p.postsort.email
            );
            const csv = ['email', ...rows.map((p) => escapeCsv(p.postsort.email ?? ''))].join('\n');
            const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
            downloadBlob(blob, `${slug}_newsletter_emails.csv`);
        });
    }, [liveParticipants, slug, downloadBlob, runExport]);

    const showLanguageColumn = data.study.translations.length > 1;

    const columns = useMemo(
        () =>
            buildColumns({
                t,
                currentLocale,
                duplicateIpGroups,
                showLanguageColumn,
                statusFilter,
                consentFilters,
                qualityFilter,
                stepFilter,
                stepLabels,
                toggleConsent,
                setStatusFilter,
                setStepFilter,
                setConsentFilters,
                setQualityFilter,
            }),
        [
            t,
            currentLocale,
            duplicateIpGroups,
            showLanguageColumn,
            statusFilter,
            consentFilters,
            qualityFilter,
            stepFilter,
            toggleConsent,
            stepLabels,
        ]
    );

    const table = useReactTable({
        data: filteredParticipants,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        onSortingChange: setSorting,
        onPaginationChange: setPagination,
        state: { sorting, pagination },
    });

    return {
        status: { isLoading, error, hasData: Boolean(rawData) },
        data,
        rawData,
        table,
        columns,
        pagination,
        liveParticipants,
        submittedParticipants,
        stepLabels,
        currentLocale,
        metrics: {
            liveCount,
            newsletterCount,
            interviewCount,
            completedCount,
            inProgressCount,
            deviceBreakdown,
        },
        filters: {
            globalFilter,
            setGlobalFilter,
            qualityFilter,
            setQualityFilter,
            statusFilter,
            setStatusFilter,
            stepFilter,
            setStepFilter,
            consentFilters,
            toggleConsent,
            clearAllFilters,
            hasActiveFilters,
        },
        dialogs: {
            packageDialogOpen,
            setPackageDialogOpen,
            clearAllDialogOpen,
            setClearAllDialogOpen,
        },
        actions: {
            handleClearAllParticipants,
            handleViewParticipant,
            runExport,
            exportNewsletterList,
            downloadBlob,
            isExportLoading,
        },
    };
}
