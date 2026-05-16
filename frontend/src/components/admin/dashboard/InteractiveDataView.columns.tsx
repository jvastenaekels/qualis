/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * InteractiveDataView column factory + cell sub-components.
 *
 * Extracted verbatim from InteractiveDataView.tsx so that both the
 * useInteractiveDataView hook and the InteractiveDataView JSX shell can
 * import buildColumns / getDisplayStatus / the icon maps / thresholds
 * from one place, breaking the hook -> component import cycle. No
 * behaviour change: bodies are an unmodified relocation.
 */

import type { TFunction } from 'i18next';
import { createColumnHelper } from '@tanstack/react-table';
import {
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    Clock,
    Globe,
    AlertTriangle,
    Monitor,
    Smartphone,
    Tablet,
    MessageSquare,
    Mail,
    FileText,
    Users,
    Calendar,
    Mic,
    UserCheck,
    Sparkles,
    Filter,
    Tag,
    MessagesSquare,
    CheckCircle2,
} from 'lucide-react';
import {
    FaWindows,
    FaApple,
    FaLinux,
    FaAndroid,
    FaChrome,
    FaFirefoxBrowser,
    FaSafari,
    FaEdge,
    FaOpera,
    FaInternetExplorer,
} from 'react-icons/fa6';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { parseUA } from '@/utils/uaParser';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import type { Locale } from 'date-fns/locale';
import type { DumpParticipant } from './types';
import type {
    ConsentType,
    QualityFilter,
    StatusFilter,
    StepFilter,
} from './InteractiveDataView.helpers';

export const DEVICE_ICONS = { mobile: Smartphone, tablet: Tablet, desktop: Monitor } as const;
export const OS_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
    Windows: FaWindows,
    macOS: FaApple,
    iOS: FaApple,
    Linux: FaLinux,
    Android: FaAndroid,
};
export const BROWSER_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
    Chrome: FaChrome,
    Firefox: FaFirefoxBrowser,
    Safari: FaSafari,
    Edge: FaEdge,
    Opera: FaOpera,
    'Internet Explorer': FaInternetExplorer,
};

export const SUSPECT_DURATION_THRESHOLD = 120;
export const ABANDONED_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24h

export function getDisplayStatus(p: DumpParticipant): 'completed' | 'in_progress' | 'abandoned' {
    if (p.status === 'completed') return 'completed';
    // Use last_step_reached_at if available, fallback to created_at
    const lastActive = p.last_step_reached_at || p.created_at;
    if (lastActive) {
        const age = Date.now() - new Date(lastActive).getTime();
        if (age > ABANDONED_THRESHOLD_MS) return 'abandoned';
    }
    return 'in_progress';
}

// Step labels derive at render time from the study config
// (see `getStepLabels` — step 3 vanishes when rough_sort_enabled=false).
// Step 1 (consent) is omitted from the filter dropdown by historical convention.
export const FILTERABLE_STEP_KEYS = new Set(['presort', 'rough', 'fine', 'post'] as const);
export const PAGE_SIZE = 25;
const columnHelper = createColumnHelper<DumpParticipant>();

// ---------------------------------------------------------------------------
// ParticipantCell — sub-component for the "Participant" id column cell (P2).
// Renders the id badge, OS/browser icons with UA tooltip, discarded badge,
// and a duplicate-IP warning badge when applicable.
// ---------------------------------------------------------------------------

export interface ParticipantCellProps {
    participantId: string;
    participant: DumpParticipant;
    duplicateIpGroups: Map<string, number>;
}

export function ParticipantCell({
    participantId,
    participant: p,
    duplicateIpGroups,
}: ParticipantCellProps) {
    const { t } = useTranslation();
    const ua = p.user_agent ? parseUA(p.user_agent) : null;
    const DeviceIcon = ua ? DEVICE_ICONS[ua.device] : null;
    const OsIcon = ua ? OS_ICONS[ua.os] : null;
    const BrowserIcon = ua ? BROWSER_ICONS[ua.browser] : null;
    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                    {participantId}
                </span>
                {ua && DeviceIcon && (
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className="flex items-center gap-1">
                                    <span className="inline-flex items-center text-slate-400">
                                        {OsIcon ? (
                                            <OsIcon className="w-3 h-3" />
                                        ) : (
                                            <DeviceIcon className="w-3 h-3" />
                                        )}
                                    </span>
                                    {ua.browser !== 'Unknown' && (
                                        <span className="inline-flex items-center text-slate-400">
                                            {BrowserIcon ? (
                                                <BrowserIcon className="w-3 h-3" />
                                            ) : (
                                                <Globe className="w-3 h-3" />
                                            )}
                                        </span>
                                    )}
                                </div>
                            </TooltipTrigger>
                            <TooltipContent
                                side="bottom"
                                className="max-w-xs break-all font-mono text-2xs"
                            >
                                {p.user_agent}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}
                {p.is_discarded && (
                    <Badge variant="destructive" className="h-4 text-2xs px-1.5 font-semibold">
                        {t('admin.data.detail.discarded_badge')}
                    </Badge>
                )}
            </div>
            {p.ip_address && duplicateIpGroups.has(p.ip_address) && (
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger>
                            <Badge
                                variant="outline"
                                className="h-4 text-2xs px-1.5 font-semibold bg-amber-50 text-amber-600 border-amber-200"
                            >
                                {t('admin.data.table.duplicate_ip', 'Duplicate IP')} #
                                {duplicateIpGroups.get(p.ip_address)}
                            </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                            {t(
                                'admin.data.table.duplicate_ip_hint',
                                'Shares IP hash with other participants'
                            )}{' '}
                            ({p.ip_address.substring(0, 8)}...)
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// buildColumns — column factory (extracted from InteractiveDataView body).
// Moving all column-header/cell branching out of the component body reduces
// the component's cognitive complexity score.
// ---------------------------------------------------------------------------

export interface BuildColumnsParams {
    t: TFunction;
    currentLocale: Locale;
    duplicateIpGroups: Map<string, number>;
    showLanguageColumn: boolean;
    statusFilter: StatusFilter;
    consentFilters: Set<ConsentType>;
    qualityFilter: QualityFilter;
    stepFilter: StepFilter;
    stepLabels: Record<number, [string, string]>;
    toggleConsent: (type: ConsentType) => void;
    setStatusFilter: (f: StatusFilter) => void;
    setStepFilter: (f: StepFilter) => void;
    setConsentFilters: (s: Set<ConsentType>) => void;
    setQualityFilter: (f: QualityFilter) => void;
}

export function buildColumns({
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
}: BuildColumnsParams) {
    return [
        columnHelper.accessor('id', {
            header: () => (
                <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    <span>{t('admin.data.table.participant')}</span>
                </div>
            ),
            cell: (info) => (
                <ParticipantCell
                    participantId={info.getValue()}
                    participant={info.row.original}
                    duplicateIpGroups={duplicateIpGroups}
                />
            ),
        }),
        ...(showLanguageColumn
            ? [
                  columnHelper.accessor('language', {
                      header: ({ column }) => (
                          <Button
                              variant="ghost"
                              onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                              className="h-8 text-xs font-semibold p-0 hover:bg-transparent flex items-center gap-1.5"
                          >
                              <Globe className="w-3.5 h-3.5 text-slate-400" />
                              {t('admin.data.table.lang')}
                              {column.getIsSorted() === 'asc' ? (
                                  <ArrowUp className="ml-2 h-3 w-3 text-indigo-500" />
                              ) : column.getIsSorted() === 'desc' ? (
                                  <ArrowDown className="ml-2 h-3 w-3 text-indigo-500" />
                              ) : (
                                  <ArrowUpDown className="ml-2 h-3 w-3 text-slate-300" />
                              )}
                          </Button>
                      ),
                      cell: (info) => (
                          <div className="flex items-center gap-2 text-slate-600 font-medium">
                              <Globe className="h-3.5 w-3.5 text-slate-300" />
                              <span className="text-xs font-medium">
                                  {info.getValue() === 'US' ? 'EN' : info.getValue()}
                              </span>
                          </div>
                      ),
                  }),
              ]
            : []),
        columnHelper.accessor('status', {
            header: ({ column }) => (
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                        className="h-8 text-xs font-semibold p-0 hover:bg-transparent flex items-center gap-1.5"
                    >
                        <Sparkles className="w-3.5 h-3.5 text-slate-400" />
                        {t('admin.data.table.status', 'Status')}
                        {column.getIsSorted() === 'asc' ? (
                            <ArrowUp className="ml-1 h-3 w-3 text-indigo-500" />
                        ) : column.getIsSorted() === 'desc' ? (
                            <ArrowDown className="ml-1 h-3 w-3 text-indigo-500" />
                        ) : (
                            <ArrowUpDown className="ml-1 h-3 w-3 text-slate-300" />
                        )}
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                aria-label={t('admin.data.table.status', 'Status')}
                                className={cn(
                                    'h-6 w-6 p-0 rounded',
                                    statusFilter !== 'all' || stepFilter !== 'all'
                                        ? 'text-indigo-600 bg-indigo-50'
                                        : 'text-slate-400 hover:text-slate-600'
                                )}
                            >
                                <Filter className="h-3 w-3" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-48" collisionPadding={8}>
                            <DropdownMenuItem
                                onClick={() => {
                                    setStatusFilter('all');
                                    setStepFilter('all');
                                }}
                            >
                                {t('admin.data.filters.all_statuses', 'All')}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel className="text-2xs text-slate-400">
                                {t('admin.data.table.status', 'Status')}
                            </DropdownMenuLabel>
                            <DropdownMenuItem
                                onClick={() => {
                                    setStatusFilter('completed');
                                    setStepFilter('all');
                                }}
                                className={cn(
                                    'text-emerald-600',
                                    statusFilter === 'completed' && 'bg-emerald-50'
                                )}
                            >
                                <CheckCircle2 className="w-3.5 h-3.5 mr-2" />
                                {t('admin.data.status.completed', 'Completed')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => {
                                    setStatusFilter('in_progress');
                                    setStepFilter('all');
                                }}
                                className={cn(
                                    'text-sky-600',
                                    statusFilter === 'in_progress' && 'bg-sky-50'
                                )}
                            >
                                <Clock className="w-3.5 h-3.5 mr-2" />
                                {t('admin.data.status.in_progress', 'In Progress')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => {
                                    setStatusFilter('abandoned');
                                    setStepFilter('all');
                                }}
                                className={cn(
                                    'text-rose-600',
                                    statusFilter === 'abandoned' && 'bg-rose-50'
                                )}
                            >
                                <AlertTriangle className="w-3.5 h-3.5 mr-2" />
                                {t('admin.data.status.abandoned', 'Abandoned')}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel className="text-2xs text-slate-400">
                                {t('admin.data.table.current_step', 'Current step')}
                            </DropdownMenuLabel>
                            {Object.entries(stepLabels).map(([step, [key, fallback]]) => (
                                <DropdownMenuItem
                                    key={step}
                                    onClick={() => {
                                        setStepFilter(Number(step) as 1 | 2 | 3 | 4 | 5);
                                        setStatusFilter('all');
                                    }}
                                    className={cn(
                                        stepFilter === Number(step) &&
                                            'bg-indigo-50 text-indigo-700'
                                    )}
                                >
                                    {t(key, fallback)}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            ),
            cell: ({ row }) => {
                const p = row.original;
                const displayStatus = getDisplayStatus(p);
                const currentStep =
                    displayStatus !== 'completed' && p.last_step_reached != null
                        ? p.last_step_reached
                        : null;
                return (
                    <div className="flex items-center gap-1.5">
                        <Badge
                            variant="outline"
                            className={cn(
                                'h-5 text-2xs px-2 font-semibold border-none',
                                displayStatus === 'completed'
                                    ? 'bg-emerald-50 text-emerald-600'
                                    : displayStatus === 'abandoned'
                                      ? 'bg-rose-50 text-rose-500'
                                      : 'bg-sky-50 text-sky-600'
                            )}
                        >
                            {t(`admin.data.status.${displayStatus}`, displayStatus)}
                        </Badge>
                        {currentStep != null && stepLabels[currentStep] && (
                            <Badge
                                variant="outline"
                                className="h-5 text-2xs px-2 font-semibold border-slate-200 text-slate-500"
                            >
                                {t(...stepLabels[currentStep])}
                            </Badge>
                        )}
                    </div>
                );
            },
        }),
        columnHelper.display({
            id: 'consent_indicators',
            header: () => (
                <div className="flex items-center gap-1">
                    <div className="flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>{t('admin.data.table.consent', 'Consent')}</span>
                    </div>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                aria-label={t('admin.data.table.consent', 'Consent')}
                                className={cn(
                                    'h-6 w-6 p-0 rounded',
                                    consentFilters.size > 0
                                        ? 'text-indigo-600 bg-indigo-50'
                                        : 'text-slate-400 hover:text-slate-600'
                                )}
                            >
                                <Filter className="h-3 w-3" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-48" collisionPadding={8}>
                            <DropdownMenuItem onClick={() => setConsentFilters(new Set())}>
                                {t('admin.data.filters.all_consents', 'All')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => toggleConsent('email')}
                                className={cn(
                                    consentFilters.has('email') && 'bg-indigo-50 text-indigo-700'
                                )}
                            >
                                <Mail className="w-3.5 h-3.5 mr-2" />
                                {t('admin.data.filters.has_email', 'Email provided')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => toggleConsent('newsletter')}
                                className={cn(
                                    consentFilters.has('newsletter') &&
                                        'bg-emerald-50 text-emerald-700'
                                )}
                            >
                                <FileText className="w-3.5 h-3.5 mr-2" />
                                {t('admin.data.filters.newsletter', 'Wants results')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => toggleConsent('interview')}
                                className={cn(
                                    consentFilters.has('interview') && 'bg-amber-50 text-amber-700'
                                )}
                            >
                                <MessagesSquare className="w-3.5 h-3.5 mr-2" />
                                {t('admin.data.filters.interview', 'Follow-up')}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            ),
            cell: ({ row }) => {
                const p = row.original;
                return (
                    <TooltipProvider>
                        <div className="flex items-center gap-1.5">
                            {p.postsort.email && (
                                <Tooltip>
                                    <TooltipTrigger>
                                        <div className="p-1 bg-indigo-50 rounded text-indigo-600 border border-indigo-100">
                                            <Mail className="h-3 w-3" />
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        {t('admin.data.tooltips.email_provided', 'Email provided')}
                                    </TooltipContent>
                                </Tooltip>
                            )}
                            {p.postsort.newsletter_consent && (
                                <Tooltip>
                                    <TooltipTrigger>
                                        <div className="p-1 bg-emerald-50 rounded text-emerald-600 border border-emerald-100">
                                            <FileText className="h-3 w-3" />
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        {t(
                                            'admin.data.tooltips.newsletter_consent',
                                            'Wants results'
                                        )}
                                    </TooltipContent>
                                </Tooltip>
                            )}
                            {p.postsort.interview_consent && (
                                <Tooltip>
                                    <TooltipTrigger>
                                        <div className="p-1 bg-amber-50 rounded text-amber-600 border border-amber-100">
                                            <MessagesSquare className="h-3 w-3" />
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        {t(
                                            'admin.data.tooltips.interview_consent',
                                            'Accepts follow-up'
                                        )}
                                    </TooltipContent>
                                </Tooltip>
                            )}
                            {!p.postsort.email &&
                                !p.postsort.newsletter_consent &&
                                !p.postsort.interview_consent && (
                                    <span className="text-2xs text-slate-300 font-medium">—</span>
                                )}
                        </div>
                    </TooltipProvider>
                );
            },
        }),
        columnHelper.display({
            id: 'quality',
            header: () => (
                <div className="flex items-center gap-1">
                    <div className="flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-slate-400" />
                        <span>{t('admin.data.table.flags')}</span>
                    </div>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                aria-label={t('admin.data.table.flags')}
                                className={cn(
                                    'h-6 w-6 p-0 rounded',
                                    qualityFilter !== 'all'
                                        ? 'text-indigo-600 bg-indigo-50'
                                        : 'text-slate-400 hover:text-slate-600'
                                )}
                            >
                                <Filter className="h-3 w-3" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-52" collisionPadding={8}>
                            <DropdownMenuItem onClick={() => setQualityFilter('all')}>
                                {t('admin.data.filters.all_indicators', 'All')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => setQualityFilter('flagged')}
                                className={cn(
                                    qualityFilter === 'flagged' && 'bg-amber-50 text-amber-700'
                                )}
                            >
                                <AlertTriangle className="w-3.5 h-3.5 mr-2" />
                                {t('admin.data.filters.flagged', 'Flagged')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => setQualityFilter('has_comments')}
                                className={cn(
                                    qualityFilter === 'has_comments' && 'bg-blue-50 text-blue-700'
                                )}
                            >
                                <MessageSquare className="w-3.5 h-3.5 mr-2" />
                                {t('admin.data.filters.has_comments', 'Has comments')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => setQualityFilter('has_audio')}
                                className={cn(
                                    qualityFilter === 'has_audio' && 'bg-purple-50 text-purple-700'
                                )}
                            >
                                <Mic className="w-3.5 h-3.5 mr-2" />
                                {t('admin.data.filters.has_audio', 'Has audio')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => setQualityFilter('has_recruitment')}
                                className={cn(
                                    qualityFilter === 'has_recruitment' &&
                                        'bg-slate-100 text-slate-700'
                                )}
                            >
                                <Tag className="w-3.5 h-3.5 mr-2" />
                                {t('admin.data.filters.has_recruitment', 'Has recruitment link')}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            ),
            cell: ({ row }) => {
                const p = row.original;
                const isSuspect =
                    p.duration_seconds !== null && p.duration_seconds < SUSPECT_DURATION_THRESHOLD;
                const hasComments = Object.keys(p.postsort.card_comments || {}).length > 0;
                const hasAudio = p.audio_recordings && Object.keys(p.audio_recordings).length > 0;
                const hasRecruitmentLink = !!p.recruitment_token;

                return (
                    <div className="flex items-center gap-1.5">
                        <TooltipProvider>
                            {hasRecruitmentLink && (
                                <Tooltip>
                                    <TooltipTrigger>
                                        <div className="p-1 bg-slate-50 rounded text-slate-500 border border-slate-200">
                                            <Tag className="h-3 w-3" />
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        {t(
                                            'admin.data.tooltips.recruitment_link',
                                            'Recruitment link'
                                        )}
                                        : {p.recruitment_token}
                                    </TooltipContent>
                                </Tooltip>
                            )}
                            {isSuspect && (
                                <Tooltip>
                                    <TooltipTrigger>
                                        <div className="p-1 bg-amber-50 rounded text-amber-500 border border-amber-100">
                                            <AlertTriangle className="h-3 w-3" />
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        {t('admin.data.tooltips.suspect')}
                                    </TooltipContent>
                                </Tooltip>
                            )}
                            {hasComments && (
                                <Tooltip>
                                    <TooltipTrigger>
                                        <div className="p-1 bg-blue-50 rounded text-blue-500 border border-blue-100">
                                            <MessageSquare className="h-3 w-3" />
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        {t('admin.data.tooltips.has_comments')}
                                    </TooltipContent>
                                </Tooltip>
                            )}
                            {hasAudio && (
                                <Tooltip>
                                    <TooltipTrigger>
                                        <div className="p-1 bg-purple-50 rounded text-purple-500 border border-purple-100">
                                            <Mic className="h-3 w-3" />
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        {t('admin.data.tooltips.has_audio', 'Has audio responses')}
                                    </TooltipContent>
                                </Tooltip>
                            )}
                            {!isSuspect && !hasComments && !hasAudio && !hasRecruitmentLink && (
                                <span className="text-2xs text-slate-300 font-medium">—</span>
                            )}
                        </TooltipProvider>
                    </div>
                );
            },
        }),
        columnHelper.accessor('duration_seconds', {
            header: ({ column }) => (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                    className="h-8 text-xs font-semibold p-0 hover:bg-transparent flex items-center justify-end gap-1.5 w-full text-right"
                >
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    {t('admin.data.table.duration')}
                    {column.getIsSorted() === 'asc' ? (
                        <ArrowUp className="ml-2 h-3 w-3 text-indigo-500" />
                    ) : column.getIsSorted() === 'desc' ? (
                        <ArrowDown className="ml-2 h-3 w-3 text-indigo-500" />
                    ) : (
                        <ArrowUpDown className="ml-2 h-3 w-3 text-slate-300" />
                    )}
                </Button>
            ),
            cell: (info) => {
                const seconds = info.getValue();
                if (seconds === null)
                    return <span className="text-slate-300 text-right block">—</span>;
                return (
                    <div className="flex items-center justify-end gap-1.5 font-mono text-xs text-slate-600">
                        {seconds >= 3600
                            ? t('common.duration_long', '{{h}}h {{m}}m {{s}}s', {
                                  h: Math.floor(seconds / 3600),
                                  m: Math.floor((seconds % 3600) / 60),
                                  s: Math.floor(seconds % 60),
                              })
                            : t('common.duration_short', '{{m}}m {{s}}s', {
                                  m: Math.floor(seconds / 60),
                                  s: Math.floor(seconds % 60),
                              })}
                    </div>
                );
            },
        }),
        columnHelper.accessor('submitted_at', {
            id: 'submitted_at',
            header: ({ column }) => (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                    className="h-8 text-xs font-semibold p-0 hover:bg-transparent flex items-center gap-1.5"
                >
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    {t('admin.data.table.submitted')}
                    {column.getIsSorted() === 'asc' ? (
                        <ArrowUp className="ml-2 h-3 w-3 text-indigo-500" />
                    ) : column.getIsSorted() === 'desc' ? (
                        <ArrowDown className="ml-2 h-3 w-3 text-indigo-500" />
                    ) : (
                        <ArrowUpDown className="ml-2 h-3 w-3 text-slate-300" />
                    )}
                </Button>
            ),
            cell: (info) => {
                const val = info.getValue();
                if (!val) return <span className="text-slate-300">—</span>;
                const date = new Date(val);
                return (
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger>
                                <div className="flex flex-col text-xs text-slate-500 font-medium">
                                    <span>
                                        {format(date, 'MMM d, HH:mm', { locale: currentLocale })}
                                    </span>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent>
                                {format(date, 'PPpp', { locale: currentLocale })}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                );
            },
        }),
    ];
}
