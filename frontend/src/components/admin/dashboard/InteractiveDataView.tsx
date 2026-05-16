import type { ParticipantRead } from '@/api/model';
import { type ReactNode, useState } from 'react';
import { flexRender } from '@tanstack/react-table';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Clock,
    ChevronLeft,
    ChevronRight,
    AlertTriangle,
    Search,
    Mail,
    FileText,
    Users,
    Trash2,
    Download,
    X,
    ArrowRight,
    FileSpreadsheet,
    Package,
    Database,
    FileCode,
    Sparkles,
    FilterX,
    MessagesSquare,
    Loader2,
    MoreVertical,
    Inbox,
    CheckCircle2,
    Footprints,
    ChevronDown,
    BarChart3,
} from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AdminService } from '@/api/admin';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
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
import { Badge } from '@/components/ui/badge';

import * as Collapsible from '@radix-ui/react-collapsible';
import { QuestionDistributionCharts } from './charts/QuestionDistributionCharts';
import { SubmissionsTimelineChart } from './charts/SubmissionsTimelineChart';
import { DeviceBreakdownChart } from './charts/DeviceBreakdownChart';
import { EmptyState } from '@/components/ui/empty-state';
import { ExportPackageDialog } from './ExportPackageDialog';
import { useInteractiveDataView } from '@/hooks/admin/useInteractiveDataView';

interface InteractiveDataViewProps {
    slug: string;
    participants?: ParticipantRead[];
}

function CollapsibleSection({
    title,
    icon,
    children,
    defaultOpen = true,
}: {
    title: string;
    icon: ReactNode;
    children: ReactNode;
    defaultOpen?: boolean;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <Collapsible.Root open={open} onOpenChange={setOpen}>
            <Collapsible.Trigger asChild>
                <button
                    type="button"
                    className="flex items-center gap-2 w-full text-left py-2 cursor-pointer"
                >
                    {icon}
                    <h2 className="text-sm font-bold text-slate-700 flex-1">{title}</h2>
                    <ChevronDown
                        className={cn(
                            'h-4 w-4 text-slate-400 transition-transform duration-200',
                            open && 'rotate-180'
                        )}
                    />
                </button>
            </Collapsible.Trigger>
            <Collapsible.Content className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                <div className="pt-2 pb-1">{children}</div>
            </Collapsible.Content>
        </Collapsible.Root>
    );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: P5 — JSX shell: complexity is structural (many conditional render branches for filter badges, stat cards, table pagination) not algorithmic; matchers, cells and columns extracted to helpers/sub-components above
export default function InteractiveDataView({
    slug,
    participants: initialParticipants,
}: InteractiveDataViewProps) {
    const { t, i18n } = useTranslation();
    const {
        status: { isLoading, error },
        data,
        rawData,
        table,
        columns,
        pagination,
        liveParticipants,
        submittedParticipants,
        stepLabels,
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
    } = useInteractiveDataView({ slug, initialParticipants });

    if (isLoading && !data) {
        return (
            <div className="space-y-6">
                <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
                    {[1, 2, 3, 4].map((i) => (
                        <Skeleton key={i} className="h-24 sm:h-32 rounded-2xl" />
                    ))}
                </div>
                <div className="space-y-3">
                    <Skeleton className="h-10 w-full rounded-lg" />
                    <Skeleton className="h-[400px] w-full rounded-xl" />
                </div>
            </div>
        );
    }

    if ((error && !data) || (!data && !isLoading)) {
        return (
            <div className="rounded-2xl border-2 border-dashed border-red-100 bg-red-50/50 p-12 text-center">
                <div className="inline-flex p-4 bg-red-100 text-red-600 rounded-full mb-4">
                    <AlertTriangle className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-black text-red-900 mb-2">{t('common.error')}</h3>
                <p className="text-red-600 font-medium max-w-xs mx-auto">
                    {t('admin.data.errors.load_failed')}
                </p>
                <Button
                    variant="outline"
                    className="mt-6 border-red-200 text-red-700 hover:bg-red-100"
                    onClick={() => window.location.reload()}
                >
                    {t('common.errors.retry')}
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Section 1: Key indicators */}
            <CollapsibleSection
                title={t('admin.data.sections.key_indicators', 'Key indicators')}
                icon={<BarChart3 className="h-4 w-4 text-slate-400" />}
            >
                <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
                    {/* Primary Metrics: Completed & In Progress */}

                    {/* Completed Card */}
                    <button
                        type="button"
                        onClick={() =>
                            setStatusFilter((prev) => (prev === 'completed' ? 'all' : 'completed'))
                        }
                        className={cn(
                            'group relative overflow-hidden bg-white p-3 sm:p-5 rounded-2xl border-2 shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between min-h-[100px] sm:min-h-[140px]',
                            statusFilter === 'completed'
                                ? 'border-emerald-500 ring-4 ring-emerald-50/50'
                                : 'border-slate-100 hover:border-emerald-200'
                        )}
                    >
                        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity hidden sm:block">
                            <CheckCircle2 className="w-24 h-24 text-emerald-500 -mr-6 -mt-6" />
                        </div>

                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <div
                                    className={cn(
                                        'p-2 rounded-lg transition-colors',
                                        statusFilter === 'completed'
                                            ? 'bg-emerald-100 text-emerald-700'
                                            : 'bg-emerald-50 text-emerald-600'
                                    )}
                                >
                                    <CheckCircle2 className="w-5 h-5" />
                                </div>
                                <span className="text-xs font-bold text-slate-500">
                                    {t('admin.data.stats.completed', 'Completed')}
                                </span>
                            </div>

                            <div className="flex items-baseline gap-2">
                                <span className="text-xl sm:text-4xl font-black text-slate-900 tracking-tight">
                                    {completedCount}
                                </span>
                            </div>
                        </div>

                        <div className="mt-2 sm:mt-4 hidden sm:flex items-center text-xs font-semibold text-emerald-600 gap-1 opacity-0 group-hover:opacity-100 transition-opacity translate-y-1 group-hover:translate-y-0 duration-300">
                            {t('admin.data.stats.click_to_filter', 'Filter table')}
                            <ArrowRight className="w-3 h-3" />
                        </div>
                    </button>

                    {/* In Progress Card */}
                    <button
                        type="button"
                        onClick={() =>
                            setStatusFilter((prev) =>
                                prev === 'in_progress' ? 'all' : 'in_progress'
                            )
                        }
                        className={cn(
                            'group relative overflow-hidden bg-white p-3 sm:p-5 rounded-2xl border-2 shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between min-h-[100px] sm:min-h-[140px]',
                            statusFilter === 'in_progress'
                                ? 'border-sky-500 ring-4 ring-sky-50/50'
                                : 'border-slate-100 hover:border-sky-200'
                        )}
                    >
                        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity hidden sm:block">
                            <Clock className="w-24 h-24 text-sky-500 -mr-6 -mt-6" />
                        </div>

                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <div
                                    className={cn(
                                        'p-2 rounded-lg transition-colors',
                                        statusFilter === 'in_progress'
                                            ? 'bg-sky-100 text-sky-700'
                                            : 'bg-sky-50 text-sky-600'
                                    )}
                                >
                                    <Clock className="w-5 h-5" />
                                </div>
                                <span className="text-xs font-bold text-slate-500">
                                    {t('admin.data.stats.in_progress', 'In Progress')}
                                </span>
                            </div>

                            <div className="flex items-baseline gap-2">
                                <span className="text-xl sm:text-4xl font-black text-slate-900 tracking-tight">
                                    {inProgressCount}
                                </span>
                            </div>
                        </div>

                        <div className="mt-2 sm:mt-4 hidden sm:flex items-center text-xs font-semibold text-sky-600 gap-1 opacity-0 group-hover:opacity-100 transition-opacity translate-y-1 group-hover:translate-y-0 duration-300">
                            {t('admin.data.stats.click_to_filter', 'Filter table')}
                            <ArrowRight className="w-3 h-3" />
                        </div>
                    </button>

                    {/* Interview Consent Card */}
                    <button
                        type="button"
                        onClick={() => toggleConsent('interview')}
                        className={cn(
                            'group relative overflow-hidden bg-white p-3 sm:p-5 rounded-2xl border-2 shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between min-h-[100px] sm:min-h-[140px]',
                            consentFilters.has('interview')
                                ? 'border-amber-500 ring-4 ring-amber-50/50'
                                : 'border-slate-100 hover:border-amber-200'
                        )}
                    >
                        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity hidden sm:block">
                            <MessagesSquare className="w-24 h-24 text-amber-500 -mr-6 -mt-6" />
                        </div>

                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <div
                                    className={cn(
                                        'p-2 rounded-lg transition-colors',
                                        consentFilters.has('interview')
                                            ? 'bg-amber-100 text-amber-700'
                                            : 'bg-amber-50 text-amber-600'
                                    )}
                                >
                                    <MessagesSquare className="w-5 h-5" />
                                </div>
                                <span className="text-xs font-bold text-slate-500">
                                    {t(
                                        'admin.data.stats.interview_interested',
                                        'Accepts follow-up'
                                    )}
                                </span>
                            </div>

                            <div className="flex items-baseline gap-2">
                                <span className="text-xl sm:text-4xl font-black text-slate-900 tracking-tight">
                                    {interviewCount}
                                </span>
                            </div>
                        </div>

                        <div className="mt-2 sm:mt-4 hidden sm:flex items-center text-xs font-semibold text-amber-600 gap-1 opacity-0 group-hover:opacity-100 transition-opacity translate-y-1 group-hover:translate-y-0 duration-300">
                            {t('admin.data.stats.click_to_filter', 'Filter table')}
                            <ArrowRight className="w-3 h-3" />
                        </div>
                    </button>

                    {/* Newsletter Consent Card — exports email list */}
                    <button
                        type="button"
                        onClick={exportNewsletterList}
                        disabled={newsletterCount === 0}
                        aria-label={t('admin.data.stats.click_to_export', 'Click to export list')}
                        className="group relative overflow-hidden bg-white p-3 sm:p-5 rounded-2xl border-2 border-slate-100 hover:border-indigo-200 shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between min-h-[100px] sm:min-h-[140px] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity hidden sm:block">
                            <FileText className="w-24 h-24 text-indigo-500 -mr-6 -mt-6" />
                        </div>

                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <div className="p-2 rounded-lg transition-colors bg-indigo-50 text-indigo-600">
                                    <FileText className="w-5 h-5" />
                                </div>
                                <span className="text-xs font-bold text-slate-500">
                                    {t('admin.data.stats.newsletter', 'Wants results')}
                                </span>
                                <Download className="w-3.5 h-3.5 text-indigo-400 ml-auto sm:hidden" />
                            </div>

                            <div className="flex items-baseline gap-2">
                                <span className="text-xl sm:text-4xl font-black text-slate-900 tracking-tight">
                                    {newsletterCount}
                                </span>
                            </div>
                        </div>

                        <div className="mt-2 sm:mt-4 hidden sm:flex items-center text-xs font-semibold text-indigo-600 gap-1 opacity-0 group-hover:opacity-100 transition-opacity translate-y-1 group-hover:translate-y-0 duration-300">
                            {t('admin.data.stats.click_to_export', 'Click to export list')}
                            <Download className="w-3 h-3" />
                        </div>
                    </button>
                </div>
            </CollapsibleSection>

            {/* Section 2: Responses */}
            <CollapsibleSection
                title={t('admin.data.sections.responses', 'Responses')}
                icon={<Users className="h-4 w-4 text-slate-400" />}
            >
                {hasActiveFilters && (
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-600">
                            {t('admin.data.filters.active', 'Active filters')}:
                        </span>
                        {consentFilters.has('email') && (
                            <Badge
                                variant="secondary"
                                className="h-7 px-3 gap-2 bg-indigo-100 text-indigo-700 border-indigo-200 font-semibold"
                            >
                                <Mail className="w-3 h-3" />
                                {t('admin.data.filters.has_email', 'Email provided')}
                                <button
                                    type="button"
                                    onClick={() => toggleConsent('email')}
                                    aria-label={t(
                                        'admin.data.filters.remove_filter',
                                        'Remove filter'
                                    )}
                                    className="hover:bg-indigo-200 rounded-full p-1.5 -m-1 transition-colors"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </Badge>
                        )}
                        {consentFilters.has('newsletter') && (
                            <Badge
                                variant="secondary"
                                className="h-7 px-3 gap-2 bg-emerald-100 text-emerald-700 border-emerald-200 font-semibold"
                            >
                                <FileText className="w-3 h-3" />
                                {t('admin.data.filters.newsletter', 'Wants results')}
                                <button
                                    type="button"
                                    onClick={() => toggleConsent('newsletter')}
                                    aria-label={t(
                                        'admin.data.filters.remove_filter',
                                        'Remove filter'
                                    )}
                                    className="hover:bg-emerald-200 rounded-full p-1.5 -m-1 transition-colors"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </Badge>
                        )}
                        {consentFilters.has('interview') && (
                            <Badge
                                variant="secondary"
                                className="h-7 px-3 gap-2 bg-amber-100 text-amber-700 border-amber-200 font-semibold"
                            >
                                <MessagesSquare className="w-3 h-3" />
                                {t('admin.data.filters.interview', 'Accepts follow-up')}
                                <button
                                    type="button"
                                    onClick={() => toggleConsent('interview')}
                                    aria-label={t(
                                        'admin.data.filters.remove_filter',
                                        'Remove filter'
                                    )}
                                    className="hover:bg-amber-200 rounded-full p-1.5 -m-1 transition-colors"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </Badge>
                        )}
                        {qualityFilter !== 'all' && (
                            <Badge
                                variant="secondary"
                                className="h-7 px-3 gap-2 bg-amber-100 text-amber-700 border-amber-200 font-semibold"
                            >
                                <AlertTriangle className="w-3 h-3" />
                                {qualityFilter === 'flagged'
                                    ? t('admin.data.filters.flagged', 'Flagged')
                                    : qualityFilter === 'has_comments'
                                      ? t('admin.data.filters.has_comments', 'Has comments')
                                      : qualityFilter === 'has_audio'
                                        ? t('admin.data.filters.has_audio', 'Has audio')
                                        : t(
                                              'admin.data.filters.has_recruitment',
                                              'Has recruitment link'
                                          )}
                                <button
                                    type="button"
                                    onClick={() => setQualityFilter('all')}
                                    aria-label={t(
                                        'admin.data.filters.remove_filter',
                                        'Remove filter'
                                    )}
                                    className="hover:bg-amber-200 rounded-full p-1.5 -m-1 transition-colors"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </Badge>
                        )}
                        {stepFilter !== 'all' && (
                            <Badge
                                variant="secondary"
                                className="h-7 px-3 gap-2 bg-indigo-100 text-indigo-700 border-indigo-200 font-semibold"
                            >
                                <Footprints className="w-3 h-3" />
                                {stepFilter === 'completed'
                                    ? t('admin.data.status.completed', 'Completed')
                                    : stepLabels[stepFilter]
                                      ? t(...stepLabels[stepFilter])
                                      : stepFilter}
                                <button
                                    type="button"
                                    onClick={() => setStepFilter('all')}
                                    aria-label={t(
                                        'admin.data.filters.remove_filter',
                                        'Remove filter'
                                    )}
                                    className="hover:bg-indigo-200 rounded-full p-1.5 -m-1 transition-colors"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </Badge>
                        )}
                        {statusFilter !== 'all' && (
                            <Badge
                                variant="secondary"
                                className={cn(
                                    'h-7 px-3 gap-2 font-semibold',
                                    statusFilter === 'completed'
                                        ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                        : statusFilter === 'in_progress'
                                          ? 'bg-sky-100 text-sky-700 border-sky-200'
                                          : 'bg-rose-100 text-rose-700 border-rose-200'
                                )}
                            >
                                <Sparkles className="w-3 h-3" />
                                {t(`admin.data.status.${statusFilter}`, statusFilter)}
                                <button
                                    type="button"
                                    onClick={() => setStatusFilter('all')}
                                    aria-label={t(
                                        'admin.data.filters.remove_filter',
                                        'Remove filter'
                                    )}
                                    className={cn(
                                        'rounded-full p-1.5 -m-1 transition-colors',
                                        statusFilter === 'completed'
                                            ? 'hover:bg-emerald-200'
                                            : statusFilter === 'in_progress'
                                              ? 'hover:bg-sky-200'
                                              : 'hover:bg-rose-200'
                                    )}
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </Badge>
                        )}
                        {globalFilter && (
                            <Badge
                                variant="secondary"
                                className="h-7 px-3 gap-2 bg-slate-100 text-slate-700 border-slate-200 font-semibold"
                            >
                                <Search className="w-3 h-3" />
                                &ldquo;{globalFilter}&rdquo;
                                <button
                                    type="button"
                                    onClick={() => setGlobalFilter('')}
                                    aria-label={t(
                                        'admin.data.filters.remove_filter',
                                        'Remove filter'
                                    )}
                                    className="hover:bg-slate-200 rounded-full p-1.5 -m-1 transition-colors"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </Badge>
                        )}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={clearAllFilters}
                            className="h-7 text-xs font-semibold text-slate-600 gap-1.5"
                        >
                            <FilterX className="w-3.5 h-3.5" />
                            {t('admin.data.filters.clear_all', 'Clear all')}
                        </Button>
                    </div>
                )}

                <div className="flex flex-row items-center justify-between gap-2 sm:gap-3 w-full bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
                    {/* Left Group: Search */}
                    <div className="flex items-center gap-3 flex-1 min-w-0 sm:max-w-sm lg:max-w-2xl">
                        <div className="relative group w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors pointer-events-none" />
                            <Input
                                placeholder={t(
                                    'admin.data.search.placeholder',
                                    'Search by ID, email...'
                                )}
                                aria-label={t(
                                    'admin.data.search.placeholder',
                                    'Search by ID, email...'
                                )}
                                value={globalFilter ?? ''}
                                onChange={(e) => setGlobalFilter(e.target.value)}
                                className="pl-10 h-10 bg-slate-50 border-slate-200 focus-visible:ring-indigo-500 rounded-lg shadow-none focus:bg-white transition-all font-medium text-sm w-full"
                            />
                        </div>
                    </div>
                    {/* Right Group: Actions */}
                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                        {/* Export Dropdown */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    className="h-10 w-10 sm:w-auto sm:h-9 bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-sm gap-2 text-xs"
                                    disabled={isExportLoading}
                                    aria-label={t('admin.export.label', 'Export')}
                                >
                                    {isExportLoading ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <Download className="h-3.5 w-3.5" />
                                    )}
                                    <span className="hidden sm:inline">
                                        {t('admin.export.label', 'Export')}
                                    </span>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                align="end"
                                className="w-56 rounded-xl"
                                collisionPadding={8}
                            >
                                <DropdownMenuItem
                                    disabled={isExportLoading}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        setPackageDialogOpen(true);
                                    }}
                                    className="font-bold cursor-pointer text-indigo-600 bg-indigo-50/50 gap-2"
                                >
                                    <Package className="h-4 w-4" />
                                    {t('admin.export.formats.package', 'Research Package (ZIP)')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    disabled={isExportLoading}
                                    onClick={() =>
                                        runExport(async () => {
                                            const blob = await AdminService.exportCSV(slug);
                                            downloadBlob(blob, `${slug}_data.csv`);
                                        })
                                    }
                                    className="font-medium cursor-pointer gap-2"
                                >
                                    <FileSpreadsheet className="h-4 w-4" />
                                    {t('admin.export.formats.csv', 'CSV')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    disabled={isExportLoading}
                                    onClick={() =>
                                        runExport(async () => {
                                            const blob = await AdminService.exportPQMethod(slug);
                                            downloadBlob(blob, `${slug}_pqmethod.zip`);
                                        })
                                    }
                                    className="font-medium cursor-pointer gap-2"
                                >
                                    <Database className="h-4 w-4" />
                                    {t('admin.export.formats.pqmethod', 'PQMethod (ZIP)')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    disabled={isExportLoading}
                                    onClick={() =>
                                        runExport(async () => {
                                            const blob = await AdminService.exportRKit(slug);
                                            downloadBlob(blob, `${slug}_r_kit.zip`);
                                        })
                                    }
                                    className="font-medium cursor-pointer gap-2"
                                >
                                    <FileCode className="h-4 w-4" />
                                    {t('admin.export.formats.rkit', 'R-Kit (ZIP)')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    disabled={isExportLoading}
                                    onClick={() =>
                                        runExport(async () => {
                                            const blob = new Blob(
                                                [JSON.stringify(rawData, null, 2)],
                                                {
                                                    type: 'application/json',
                                                }
                                            );
                                            downloadBlob(blob, `${slug}_dump.json`);
                                        })
                                    }
                                    className="font-medium cursor-pointer gap-2"
                                >
                                    <FileCode className="h-4 w-4" />
                                    {t('admin.export.formats.json', 'JSON Dump')}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        {liveCount > 0 && data.study.state === 'draft' && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-9 w-9 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                                    >
                                        <MoreVertical className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                    align="end"
                                    className="w-52 rounded-xl"
                                    collisionPadding={8}
                                >
                                    <DropdownMenuItem
                                        onClick={() => setClearAllDialogOpen(true)}
                                        className="font-semibold cursor-pointer gap-2 text-rose-600 focus:text-rose-600 focus:bg-rose-50"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                        {t('admin.data.actions.clear_all')}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                    </div>
                </div>

                <ExportPackageDialog
                    open={packageDialogOpen}
                    onOpenChange={setPackageDialogOpen}
                    isExportLoading={isExportLoading}
                    onDownload={(includeDiscussion) =>
                        runExport(async () => {
                            const blob = await AdminService.exportResearchPackage(slug, {
                                includeDiscussion,
                            });
                            downloadBlob(blob, `${slug}_research_package.zip`);
                        })
                    }
                />

                <AlertDialog open={clearAllDialogOpen} onOpenChange={setClearAllDialogOpen}>
                    <AlertDialogContent className="border-none shadow-2xl">
                        <AlertDialogHeader>
                            <AlertDialogTitle className="text-xl font-black text-slate-900 flex items-center gap-3">
                                <div className="p-2 bg-rose-100 text-rose-600 rounded-xl">
                                    <Trash2 className="w-5 h-5" />
                                </div>
                                {t('admin.data.actions.clear_all')}
                            </AlertDialogTitle>
                            <AlertDialogDescription className="text-slate-500 font-semibold text-base py-4">
                                {t('admin.data.actions.clear_all_confirm')}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="gap-2">
                            <AlertDialogCancel className="rounded-2xl font-bold h-12">
                                {t('common.cancel')}
                            </AlertDialogCancel>
                            <AlertDialogAction
                                onClick={handleClearAllParticipants}
                                className="rounded-2xl font-bold h-12 bg-rose-600 hover:bg-rose-700"
                            >
                                {t('common.confirm_delete')}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                {/* Table View */}
                <div className="bg-white border border-slate-200 shadow-xl shadow-slate-200/50 overflow-x-auto ring-1 ring-slate-100 rounded-xl sm:rounded-2xl">
                    <Table className="min-w-[800px]">
                        <TableHeader className="bg-slate-50/80">
                            {table.getHeaderGroups().map((headerGroup) => (
                                <TableRow
                                    key={headerGroup.id}
                                    className="hover:bg-transparent border-slate-100"
                                >
                                    {headerGroup.headers.map((header) => (
                                        <TableHead
                                            key={header.id}
                                            className="h-14 text-xs font-semibold text-slate-600 px-2 sm:px-6 whitespace-nowrap"
                                        >
                                            {header.isPlaceholder
                                                ? null
                                                : flexRender(
                                                      header.column.columnDef.header,
                                                      header.getContext()
                                                  )}
                                        </TableHead>
                                    ))}
                                </TableRow>
                            ))}
                        </TableHeader>
                        <TableBody>
                            {table.getRowModel().rows.length ? (
                                table.getRowModel().rows.map((row) => (
                                    <TableRow
                                        key={row.id}
                                        className={cn(
                                            'cursor-pointer hover:bg-indigo-50/40 transition-all border-slate-50 group border-b last:border-0',
                                            !!row.original.is_discarded &&
                                                'opacity-60 grayscale-[0.5]'
                                        )}
                                        onClick={() => handleViewParticipant(row.original)}
                                    >
                                        {row.getVisibleCells().map((cell) => (
                                            <TableCell
                                                key={cell.id}
                                                className="px-2 sm:px-6 py-4 sm:py-5 whitespace-nowrap"
                                            >
                                                {flexRender(
                                                    cell.column.columnDef.cell,
                                                    cell.getContext()
                                                )}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell
                                        colSpan={columns.length}
                                        className="h-64 text-center"
                                    >
                                        {liveCount === 0 ? (
                                            // Wave E (E2): migrated to <EmptyState>.
                                            <EmptyState
                                                icon={Inbox}
                                                title={t(
                                                    'admin.data.empty.no_participants_title',
                                                    'No participants yet'
                                                )}
                                                body={t(
                                                    'admin.data.empty.no_participants_desc',
                                                    'Share your study link to start collecting responses.'
                                                )}
                                                variant="inline"
                                            />
                                        ) : (
                                            <div className="flex flex-col items-center justify-center gap-4 text-slate-400">
                                                <div className="p-4 bg-slate-50 rounded-full">
                                                    <Search className="w-8 h-8 opacity-20" />
                                                </div>
                                                <p className="font-bold">
                                                    {t('admin.data.search.no_results')}
                                                </p>
                                                {hasActiveFilters && (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={clearAllFilters}
                                                        className="mt-2"
                                                    >
                                                        {t(
                                                            'admin.data.filters.clear_all',
                                                            'Clear filters'
                                                        )}
                                                    </Button>
                                                )}
                                            </div>
                                        )}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>

                    {/* Pagination */}
                    {table.getPageCount() > 1 && (
                        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100">
                            <p className="text-xs text-slate-500 font-medium">
                                {t(
                                    'admin.data.pagination.showing',
                                    'Showing {{from}}\u2013{{to}} of {{total}}',
                                    {
                                        from: pagination.pageIndex * pagination.pageSize + 1,
                                        to: Math.min(
                                            (pagination.pageIndex + 1) * pagination.pageSize,
                                            table.getRowCount()
                                        ),
                                        total: table.getRowCount(),
                                    }
                                )}
                            </p>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => table.previousPage()}
                                    disabled={!table.getCanPreviousPage()}
                                    className="h-8 w-8 p-0 rounded-lg"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <span className="text-xs font-bold text-slate-600 min-w-[4rem] text-center">
                                    {pagination.pageIndex + 1} / {table.getPageCount()}
                                </span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => table.nextPage()}
                                    disabled={!table.getCanNextPage()}
                                    className="h-8 w-8 p-0 rounded-lg"
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </CollapsibleSection>

            {/* Section 3: Key statistics */}
            <CollapsibleSection
                title={t('admin.data.sections.key_statistics', 'Key statistics')}
                icon={<BarChart3 className="h-4 w-4 text-slate-400" />}
            >
                {liveParticipants.length > 0 && (
                    <div className="grid gap-4 md:grid-cols-12 mb-4">
                        <div className="col-span-12 md:col-span-8">
                            <SubmissionsTimelineChart
                                participants={liveParticipants}
                                className="border-none shadow-sm bg-white rounded-2xl h-full"
                            />
                        </div>
                        <div className="col-span-12 md:col-span-4">
                            <DeviceBreakdownChart
                                deviceBreakdown={deviceBreakdown}
                                className="border-none shadow-sm bg-white rounded-2xl h-full"
                            />
                        </div>
                    </div>
                )}
                <QuestionDistributionCharts
                    presortConfig={data.study.presort_config}
                    postsortConfig={data.study.postsort_config}
                    filteredParticipants={submittedParticipants}
                    language={i18n.language}
                />
            </CollapsibleSection>
        </div>
    );
}
