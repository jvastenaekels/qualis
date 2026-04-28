/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
    ShieldCheck,
    Users,
    Mic2,
    Globe,
    CalendarDays,
    ShieldAlert,
    Loader2,
    AlertTriangle,
    Clock,
} from 'lucide-react';

import {
    useGetDataInventoryApiAdminStudiesSlugDataInventoryGet,
    useBulkAnonymiseOldParticipantsApiAdminStudiesSlugAnonymiseBulkPost,
    usePreviewAnonymiseCandidatesApiAdminStudiesSlugAnonymisePreviewGet,
    getGetDataInventoryApiAdminStudiesSlugDataInventoryGetQueryKey,
} from '@/api/generated';
import type { BulkAnonymiseResult } from '@/api/model';
import { StudyPageHeader } from '@/components/admin/layout/StudyPageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyStateContract } from '@/components/admin/EmptyStateContract';

// ─── helpers ──────────────────────────────────────────────────────────────────

function oneYearAgo(): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
}

/**
 * Default cutoff for the bulk-anonymisation date picker.
 *
 * If the study declares a retention policy (months), use today − months.
 * Otherwise fall back to the legacy one-year-ago default.
 */
function defaultCutoff(retentionMonths: number | null | undefined): string {
    if (!retentionMonths || retentionMonths < 1) return oneYearAgo();
    const d = new Date();
    d.setMonth(d.getMonth() - retentionMonths);
    return d.toISOString().slice(0, 10);
}

function formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

// ─── loading skeleton ──────────────────────────────────────────────────────────

function InventorySkeleton() {
    return (
        <div className="space-y-6 max-w-4xl">
            {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-40 w-full rounded-2xl" />
            ))}
        </div>
    );
}

// ─── page ──────────────────────────────────────────────────────────────────────

export default function DataLifecyclePage() {
    const { t } = useTranslation();
    const { studySlug, projectSlug } = useParams<{ studySlug: string; projectSlug: string }>();
    const effectiveSlug = studySlug ?? projectSlug ?? '';

    const queryClient = useQueryClient();

    const [cutoffDate, setCutoffDate] = useState<string>(oneYearAgo());
    const [confirmOpen, setConfirmOpen] = useState(false);
    // Track whether the user has manually edited the cutoff. We only seed
    // the policy-derived default while the input is untouched, so subsequent
    // inventory refetches don't clobber the researcher's pick.
    const userTouchedCutoffRef = useRef(false);

    // ── data fetch ──────────────────────────────────────────────────────────
    const {
        data: inventory,
        isLoading,
        error,
    } = useGetDataInventoryApiAdminStudiesSlugDataInventoryGet(effectiveSlug, {
        query: { enabled: !!effectiveSlug },
    });

    // ── Effect: seed cutoff from study retention policy on first load ──
    useEffect(() => {
        if (!inventory || userTouchedCutoffRef.current) return;
        const seeded = defaultCutoff(inventory.data_retention_months);
        setCutoffDate(seeded);
    }, [inventory]);

    // ── mutation ────────────────────────────────────────────────────────────
    const anonymiseMutation = useBulkAnonymiseOldParticipantsApiAdminStudiesSlugAnonymiseBulkPost({
        mutation: {
            onSuccess: (result: BulkAnonymiseResult) => {
                setConfirmOpen(false);
                toast.success(t('admin.lifecycle.anonymise_success', 'Anonymisation complete'), {
                    description: t(
                        'admin.lifecycle.anonymise_success_desc',
                        '{{n}} participant(s) anonymised, {{s}} already anonymous.',
                        {
                            n: result.anonymised,
                            s: result.skipped_already_anonymous,
                        }
                    ),
                });
                queryClient.invalidateQueries({
                    queryKey:
                        getGetDataInventoryApiAdminStudiesSlugDataInventoryGetQueryKey(
                            effectiveSlug
                        ),
                });
            },
            onError: () => {
                toast.error(t('admin.lifecycle.anonymise_error', 'Anonymisation failed'));
            },
        },
    });

    // ── derived values ──────────────────────────────────────────────────────
    // Use end-of-day for the actual API call timestamp.
    const cutoffDt = new Date(cutoffDate);
    cutoffDt.setHours(23, 59, 59, 999);

    // Server-side preview: exact count of candidates that bulk anonymise
    // would touch for this cutoff. Replaces the year-bucketed estimate.
    const { data: previewData, isFetching: isPreviewFetching } =
        usePreviewAnonymiseCandidatesApiAdminStudiesSlugAnonymisePreviewGet(
            effectiveSlug,
            { cutoff: cutoffDt.toISOString() },
            { query: { enabled: !!effectiveSlug } }
        );
    const candidateCount = previewData?.candidates ?? 0;

    // ── render: loading / error ─────────────────────────────────────────────
    if (isLoading) {
        return (
            <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6 pt-2">
                <StudyPageHeader
                    title={t('admin.lifecycle.title', 'Data inventory & lifecycle')}
                    description={t(
                        'admin.lifecycle.header_desc',
                        'GDPR Art. 5 data minimisation controls'
                    )}
                    icon={ShieldCheck}
                />
                <InventorySkeleton />
            </div>
        );
    }

    if (error || !inventory) {
        return (
            <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6 pt-2">
                <StudyPageHeader
                    title={t('admin.lifecycle.title', 'Data inventory & lifecycle')}
                    description={t(
                        'admin.lifecycle.header_desc',
                        'GDPR Art. 5 data minimisation controls'
                    )}
                    icon={ShieldCheck}
                />
                <Alert className="bg-red-50 border-red-200 max-w-4xl">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    <AlertDescription className="text-red-800">
                        {t('admin.lifecycle.load_error', 'Failed to load data inventory.')}
                    </AlertDescription>
                </Alert>
            </div>
        );
    }

    const { participants, audio, timeline, locales } = inventory;

    // ── Empty-state contract: no participant data yet ─────────────────────
    // Wave A — UX progressive-disclosure audit. The Lifecycle page surfaces
    // GDPR Art. 5 controls that only have meaning once data exists. Until then,
    // render an honest contract pointing the user to the share-link surface.
    if (participants.total === 0) {
        return (
            <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6 pt-2">
                <StudyPageHeader
                    title={t('admin.lifecycle.title', 'Data inventory & lifecycle')}
                    description={t(
                        'admin.lifecycle.header_desc',
                        'GDPR Art. 5 data minimisation controls'
                    )}
                    icon={ShieldCheck}
                />
                <EmptyStateContract
                    icon={Users}
                    title={t('admin.lifecycle.empty.title', 'No participant data yet')}
                    body={t(
                        'admin.lifecycle.empty.body',
                        'This page will activate the inventory dashboards and bulk-anonymisation controls (GDPR Art. 5) as soon as the first participant submits a Q-sort. Until then, share the study link from the overview to start collecting responses.'
                    )}
                    ctaLabel={t('admin.lifecycle.empty.cta', 'Open study overview')}
                    ctaTo={`/app/${projectSlug ?? ''}/studies/${studySlug ?? ''}`}
                />
            </div>
        );
    }

    return (
        <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6 pt-2">
            <StudyPageHeader
                title={t('admin.lifecycle.title', 'Data inventory & lifecycle')}
                description={t(
                    'admin.lifecycle.header_desc',
                    'GDPR Art. 5 data minimisation controls'
                )}
                icon={ShieldCheck}
            />

            {/* Intro */}
            <p className="text-sm text-slate-600 max-w-2xl leading-relaxed">
                {t(
                    'admin.lifecycle.intro',
                    'This page gives you a real-time snapshot of personal data held for this study and lets you anonymise older records in bulk. Use it to enforce GDPR Art. 5 data-minimisation obligations once data collection is complete.'
                )}
            </p>

            <div className="space-y-6 max-w-4xl">
                {/* ── Section 1: Participants ─────────────────────────────── */}
                <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                    <CardHeader className="border-b border-slate-50 pb-4">
                        <div className="flex items-center gap-2 mb-1">
                            <Users className="h-5 w-5 text-indigo-500" />
                            <CardTitle className="text-lg font-black text-slate-900">
                                {t('admin.lifecycle.participants_title', 'Participants snapshot')}
                            </CardTitle>
                        </div>
                        <CardDescription className="text-sm font-medium text-slate-500">
                            {t(
                                'admin.lifecycle.participants_desc',
                                'Current status of all participants in this study'
                            )}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-6">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                            <Stat
                                label={t('admin.lifecycle.stat_total', 'Total')}
                                value={participants.total}
                            />
                            <Stat
                                label={t('admin.lifecycle.stat_started', 'Started')}
                                value={participants.started}
                            />
                            <Stat
                                label={t('admin.lifecycle.stat_completed', 'Completed')}
                                value={participants.completed}
                            />
                            <Stat
                                label={t('admin.lifecycle.stat_discarded', 'Discarded')}
                                value={participants.discarded}
                            />
                            <Stat
                                label={t('admin.lifecycle.stat_anonymised', 'Anonymised')}
                                value={participants.anonymised}
                                highlight
                            />
                        </div>

                        {/* Aged-data alerts — only render when there is actual
                            risk to flag. Yellow alert bars for "0 records older
                            than X" train the user to ignore the channel; D9
                            from the progressive-disclosure audit (REPORT.md
                            finding H3). */}
                        <div className="mt-5 space-y-2">
                            {timeline.completed_older_than_1y > 0 && (
                                <OlderThanHint
                                    label={t(
                                        'admin.lifecycle.older_1y',
                                        'Older than 1 year (not anonymised)'
                                    )}
                                    count={timeline.completed_older_than_1y}
                                />
                            )}
                            {timeline.completed_older_than_2y > 0 && (
                                <OlderThanHint
                                    label={t(
                                        'admin.lifecycle.older_2y',
                                        'Older than 2 years (not anonymised)'
                                    )}
                                    count={timeline.completed_older_than_2y}
                                />
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* ── Section 2: Audio storage ─ D8: render only when audio
                    was actually collected; otherwise the panel is permanent
                    "0 / 0.00 MB" noise (audit REPORT.md finding H8). */}
                {audio.count > 0 && (
                    <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                        <CardHeader className="border-b border-slate-50 pb-4">
                            <div className="flex items-center gap-2 mb-1">
                                <Mic2 className="h-5 w-5 text-violet-500" />
                                <CardTitle className="text-lg font-black text-slate-900">
                                    {t('admin.lifecycle.audio_title', 'Audio storage')}
                                </CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="p-6">
                            <div className="grid grid-cols-2 gap-4">
                                <Stat
                                    label={t('admin.lifecycle.audio_count', 'Recordings')}
                                    value={audio.count}
                                />
                                <Stat
                                    label={t('admin.lifecycle.audio_mb', 'Total size')}
                                    value={`${audio.total_mb.toFixed(2)} MB`}
                                />
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* ── Section 3: Locale breakdown ──────────────────────── */}
                <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                    <CardHeader className="border-b border-slate-50 pb-4">
                        <div className="flex items-center gap-2 mb-1">
                            <Globe className="h-5 w-5 text-emerald-500" />
                            <CardTitle className="text-lg font-black text-slate-900">
                                {t('admin.lifecycle.locale_title', 'Locale breakdown')}
                            </CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6">
                        {locales && Object.keys(locales).length > 0 ? (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-slate-500 font-semibold border-b border-slate-100">
                                        <th className="pb-2 font-semibold">
                                            {t('admin.lifecycle.locale_col', 'Language')}
                                        </th>
                                        <th className="pb-2 font-semibold text-right">
                                            {t('admin.lifecycle.locale_count_col', 'Participants')}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {Object.entries(locales).map(([lang, count]) => (
                                        <tr
                                            key={lang}
                                            className="border-b border-slate-50 last:border-0"
                                        >
                                            <td className="py-2 text-slate-700 font-medium uppercase tracking-wide">
                                                {lang}
                                            </td>
                                            <td className="py-2 text-slate-900 font-bold text-right">
                                                {count}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <p className="text-sm text-slate-400 italic">
                                {t('admin.lifecycle.locale_empty', 'No locale data yet.')}
                            </p>
                        )}
                    </CardContent>
                </Card>

                {/* ── Section 4: Timeline ──────────────────────────────── */}
                <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                    <CardHeader className="border-b border-slate-50 pb-4">
                        <div className="flex items-center gap-2 mb-1">
                            <CalendarDays className="h-5 w-5 text-sky-500" />
                            <CardTitle className="text-lg font-black text-slate-900">
                                {t('admin.lifecycle.timeline_title', 'Timeline')}
                            </CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6">
                        <dl className="space-y-3 text-sm">
                            <TimelineRow
                                label={t('admin.lifecycle.tl_first', 'First submission')}
                                value={formatDate(timeline.first_submission_at)}
                            />
                            <TimelineRow
                                label={t('admin.lifecycle.tl_last', 'Last submission')}
                                value={formatDate(timeline.last_submission_at)}
                            />
                            <TimelineRow
                                label={t('admin.lifecycle.tl_anon', 'Last anonymisation')}
                                value={formatDate(timeline.last_anonymisation_at)}
                            />
                        </dl>
                    </CardContent>
                </Card>

                {/* ── Section 5: Bulk anonymisation ────────────────────── */}
                <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                    <CardHeader className="border-b border-slate-50 pb-4">
                        <div className="flex items-center gap-2 mb-1">
                            <ShieldAlert className="h-5 w-5 text-amber-500" />
                            <CardTitle className="text-lg font-black text-slate-900">
                                {t('admin.lifecycle.bulk_title', 'Bulk anonymisation')}
                            </CardTitle>
                        </div>
                        <CardDescription className="text-sm font-medium text-slate-500">
                            {t(
                                'admin.lifecycle.bulk_desc',
                                'Remove personal data from completed participants submitted before a cutoff date. Q-sort rankings are preserved.'
                            )}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-6 space-y-5">
                        {/* Cutoff date picker */}
                        <div className="space-y-1.5">
                            <label
                                htmlFor="cutoff-date"
                                className="text-xs font-black text-slate-500 flex items-center gap-1.5"
                            >
                                <Clock className="w-3 h-3" />
                                {t('admin.lifecycle.cutoff_label', 'Cutoff date')}
                            </label>
                            <input
                                id="cutoff-date"
                                type="date"
                                value={cutoffDate}
                                max={new Date().toISOString().slice(0, 10)}
                                onChange={(e) => {
                                    userTouchedCutoffRef.current = true;
                                    setCutoffDate(e.target.value);
                                }}
                                className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <p className="text-xs text-slate-400">
                                {t(
                                    'admin.lifecycle.cutoff_help',
                                    'Only completed participants submitted strictly before this date will be anonymised.'
                                )}
                            </p>
                            {inventory?.data_retention_months && !userTouchedCutoffRef.current && (
                                <p className="text-xs text-indigo-600">
                                    {t(
                                        'admin.lifecycle.cutoff_from_policy',
                                        'Default derived from study retention policy ({{months}} months).',
                                        { months: inventory.data_retention_months }
                                    )}
                                </p>
                            )}
                        </div>

                        {/* Preview / candidate count */}
                        <div className="bg-slate-50 rounded-xl p-4 text-sm">
                            <span className="font-semibold text-slate-700">
                                {t('admin.lifecycle.preview_label', 'Candidates:')}
                            </span>{' '}
                            <span className="font-bold text-slate-900">
                                {isPreviewFetching ? '…' : candidateCount}
                            </span>
                            {!isPreviewFetching && candidateCount === 0 && (
                                <p className="text-xs text-slate-400 mt-1">
                                    {t(
                                        'admin.lifecycle.preview_zero',
                                        'No participants qualify for this cutoff. Try an earlier date.'
                                    )}
                                </p>
                            )}
                        </div>

                        {/* Anonymise button */}
                        <Button
                            disabled={candidateCount === 0 || anonymiseMutation.isPending}
                            onClick={() => setConfirmOpen(true)}
                            className="rounded-xl px-6 font-black bg-amber-500 hover:bg-amber-600 text-white active:scale-[0.98] transition-all shadow-sm disabled:opacity-50"
                        >
                            {anonymiseMutation.isPending ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            ) : (
                                <ShieldAlert className="w-4 h-4 mr-2" />
                            )}
                            {t(
                                'admin.lifecycle.anonymise_button',
                                'Anonymise older than {{date}}',
                                { date: cutoffDate }
                            )}
                        </Button>
                    </CardContent>
                </Card>
            </div>

            {/* ── Confirmation AlertDialog ────────────────────────────────────── */}
            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t('admin.lifecycle.confirm_title', 'Anonymise participant data?')}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="space-y-2 text-left">
                            <span className="block">
                                {t(
                                    'admin.lifecycle.confirm_candidates',
                                    '{{count}} completed participant(s) submitted before {{date}} will be anonymised.',
                                    { count: candidateCount, date: cutoffDate }
                                )}
                            </span>
                            <span className="block">
                                {t(
                                    'admin.lifecycle.confirm_preserved',
                                    'Q-sort statement rankings will be preserved as anonymous research data — they will no longer link to any individual.'
                                )}
                            </span>
                            <span className="block font-medium text-slate-700">
                                {t(
                                    'admin.lifecycle.confirm_irreversible',
                                    'This action is immediate and cannot be undone.'
                                )}
                            </span>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={anonymiseMutation.isPending}>
                            {t('common.cancel', 'Cancel')}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            disabled={anonymiseMutation.isPending}
                            onClick={() =>
                                anonymiseMutation.mutate({
                                    slug: effectiveSlug,
                                    data: {
                                        submitted_before: cutoffDt.toISOString(),
                                    },
                                })
                            }
                            className="bg-amber-500 hover:bg-amber-600"
                        >
                            {anonymiseMutation.isPending
                                ? t('admin.lifecycle.confirm_in_progress', 'Anonymising…')
                                : t('admin.lifecycle.confirm_action', 'Yes, anonymise')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

// ─── sub-components ────────────────────────────────────────────────────────────

interface StatProps {
    label: string;
    value: number | string;
    highlight?: boolean;
}

function Stat({ label, value, highlight = false }: StatProps) {
    return (
        <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                {label}
            </p>
            <p
                className={`text-2xl font-black ${highlight ? 'text-indigo-600' : 'text-slate-900'}`}
            >
                {value}
            </p>
        </div>
    );
}

interface OlderThanHintProps {
    label: string;
    count: number;
}

function OlderThanHint({ label, count }: OlderThanHintProps) {
    return (
        <div className="flex items-center justify-between rounded-xl bg-amber-50 border border-amber-100 px-4 py-2.5 text-sm">
            <span className="text-amber-800 font-medium">{label}</span>
            <span className="font-black text-amber-900">{count}</span>
        </div>
    );
}

interface TimelineRowProps {
    label: string;
    value: string;
}

function TimelineRow({ label, value }: TimelineRowProps) {
    return (
        <div className="flex items-center justify-between py-1 border-b border-slate-50 last:border-0">
            <dt className="text-slate-500 font-medium">{label}</dt>
            <dd className="text-slate-800 font-bold">{value}</dd>
        </div>
    );
}
