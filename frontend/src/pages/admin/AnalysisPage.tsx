import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { TFunction } from 'i18next';
import {
    ChartColumnStacked,
    Loader2,
    BarChart3,
    Grid3X3,
    List,
    Info,
    AlertTriangle,
    Download,
    RefreshCw,
    History,
    Plus,
    Users,
    X,
} from 'lucide-react';

import { StudyPageHeader } from '@/components/admin/layout/StudyPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
    Accordion,
    AccordionItem,
    AccordionTrigger,
    AccordionContent,
} from '@/components/ui/accordion';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { GuidanceCard } from '@/components/admin/GuidanceCard';
import { EmptyStateContract } from '@/components/admin/EmptyStateContract';
import { ExplorerPanel } from '@/components/admin/analysis/ExplorerPanel';
import { FactorLoadingsTable } from '@/components/admin/analysis/FactorLoadingsTable';
import { FactorArraysView } from '@/components/admin/analysis/FactorArraysView';
import { StatementsTable } from '@/components/admin/analysis/StatementsTable';
import { FactorCharacteristicsTable } from '@/components/admin/analysis/FactorCharacteristicsTable';
import { AnalysisHistoryPanel } from '@/components/admin/analysis/AnalysisHistoryPanel';
import { FactorVoicesPanel } from '@/components/admin/analysis/FactorVoicesPanel';
import { FactorCanvas } from '@/components/admin/analysis/FactorCanvas';
import { useExplorePhase, type ExplorePhaseApi } from '@/hooks/admin/useExplorePhase';
import { useInterpretPhase, type InterpretPhaseApi } from '@/hooks/admin/useInterpretPhase';
import { useListAnalysisRunsApiAdminStudiesSlugAnalysisRunsGet } from '@/api/generated';
import type { AnalysisResult, AnalysisRunRead, AnalysisRunSummary } from '@/api/model';
import { downloadBlob, generateLoadingsCsv, generateScoresCsv } from '@/utils/analysisCsvExport';
import { generateAnalysisXlsx } from '@/utils/analysisXlsxExport';

function parseRunIdParam(raw: string | null): number | null {
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
}

export default function AnalysisPage() {
    const { studySlug, projectSlug } = useParams();
    const slug = studySlug ?? '';
    const { t } = useTranslation();
    const [searchParams, setSearchParams] = useSearchParams();

    const phase = searchParams.get('phase') ?? 'explore';
    const runId = parseRunIdParam(searchParams.get('runId'));
    const focus = searchParams.get('focus') ?? 'f1';
    const compareTo = parseRunIdParam(searchParams.get('compareTo'));

    const navigateToInterpret = useCallback(
        (newRunId: number) => {
            setSearchParams(
                (prev) => {
                    const p = new URLSearchParams(prev);
                    p.set('phase', 'interpret');
                    p.set('runId', String(newRunId));
                    p.delete('extraction');
                    p.delete('nFactors');
                    p.delete('rotation');
                    p.delete('flagging');
                    return p;
                },
                { replace: true }
            );
        },
        [setSearchParams]
    );

    const navigateToHistoricalRun = useCallback(
        (id: number) => {
            setSearchParams(
                (prev) => {
                    const p = new URLSearchParams(prev);
                    p.set('phase', 'interpret');
                    p.set('runId', String(id));
                    return p;
                },
                { replace: true }
            );
        },
        [setSearchParams]
    );

    const navigateToExplore = useCallback(() => {
        setSearchParams(
            (prev) => {
                const p = new URLSearchParams(prev);
                p.delete('phase');
                p.delete('runId');
                p.delete('focus');
                p.delete('compareTo');
                return p;
            },
            { replace: true }
        );
    }, [setSearchParams]);

    const setFocusFromCanvas = useCallback(
        (factor: number) => {
            setSearchParams(
                (prev) => {
                    const p = new URLSearchParams(prev);
                    p.set('focus', `f${factor}`);
                    return p;
                },
                { replace: true }
            );
        },
        [setSearchParams]
    );

    const handlePin = useCallback(
        (id: number) => {
            setSearchParams(
                (prev) => {
                    const p = new URLSearchParams(prev);
                    p.set('compareTo', String(id));
                    return p;
                },
                { replace: true }
            );
        },
        [setSearchParams]
    );

    const handleUnpin = useCallback(() => {
        setSearchParams(
            (prev) => {
                const p = new URLSearchParams(prev);
                p.delete('compareTo');
                return p;
            },
            { replace: true }
        );
    }, [setSearchParams]);

    const explore = useExplorePhase(slug, navigateToInterpret);
    const interpret = useInterpretPhase(slug, runId, focus, compareTo);

    // Run history for the compare-pin picker. The same query hook backs
    // AnalysisHistoryPanel; React Query dedupes concurrent fetches so this
    // is effectively a free read off the cache.
    const runsQuery = useListAnalysisRunsApiAdminStudiesSlugAnalysisRunsGet(slug, {
        query: { enabled: !!slug },
    });
    const runs = runsQuery.data ?? [];

    // ── Empty-state contract: not enough participants for factor analysis ──
    // Wave A — UX progressive-disclosure audit. The configuration card walls
    // (4 dropdowns + rationale paragraphs) above a disabled "Run Analysis"
    // button are noise on a study with 0–1 completed sorts. Render an honest
    // contract instead. The history panel below preserves access to past runs
    // and its own pedagogical empty state with Watts & Stenner / Sneegas
    // citations.
    if (explore.isTooFewParticipants && !interpret.run && !explore.isRunning) {
        return (
            <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6 pt-2">
                <StudyPageHeader
                    title={t('admin.analysis.title', 'Analysis')}
                    description={t(
                        'admin.analysis.description',
                        'Factor analysis of Q-sort data: extract viewpoints from participant responses'
                    )}
                    icon={ChartColumnStacked}
                />
                <EmptyStateContract
                    icon={Users}
                    title={t('admin.analysis.empty.contract_title', 'Not enough Q-sort data yet')}
                    body={t(
                        'admin.analysis.empty.contract_body',
                        'Q-methodology factor analysis requires at least 2 participants who have completed the sort. Configuration choices (extraction, factors, rotation, flagging) carry meaning once data exists. Share the study link from the overview to start collecting responses.'
                    )}
                    ctaLabel={t('admin.analysis.empty.contract_cta', 'Open study overview')}
                    ctaTo={`/app/${projectSlug ?? ''}/studies/${slug}`}
                />
                <AnalysisHistoryPanel
                    slug={slug}
                    currentRunId={null}
                    onLoadRun={(_result, run) => {
                        // The legacy callback signature passes (result, run); we
                        // only need the id to route. The panel may also call this
                        // with `(null, null)` after deleting the active run — in
                        // that case, do nothing (we're already in empty state).
                        if (run) navigateToHistoricalRun(run.id);
                    }}
                />
            </div>
        );
    }

    if (phase === 'interpret' && runId !== null) {
        return (
            <InterpretShell
                slug={slug}
                runId={runId}
                interpret={interpret}
                t={t}
                onSelectHistoricalRun={navigateToHistoricalRun}
                onBackToExplore={navigateToExplore}
                onFocusChange={setFocusFromCanvas}
                runs={runs}
                compareTo={compareTo}
                onPin={handlePin}
                onUnpin={handleUnpin}
            />
        );
    }

    return (
        <ExploreShell
            slug={slug}
            explore={explore}
            t={t}
            onSelectHistoricalRun={navigateToHistoricalRun}
        />
    );
}

// ────────────────────────────────────────────────────────────────
// ExploreShell — configuration card + history panel + empty state
// ────────────────────────────────────────────────────────────────

interface ExploreShellProps {
    slug: string;
    explore: ExplorePhaseApi;
    t: TFunction;
    onSelectHistoricalRun: (runId: number) => void;
}

function ExploreShell({ slug, explore, t, onSelectHistoricalRun }: ExploreShellProps) {
    return (
        <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6 pt-2">
            <StudyPageHeader
                title={t('admin.analysis.title', 'Analysis')}
                description={t(
                    'admin.analysis.description',
                    'Factor analysis of Q-sort data: extract viewpoints from participant responses'
                )}
                icon={ChartColumnStacked}
            />

            {/* Gate banners — kept above ExplorerPanel because they govern
                whether the new diagnostics + preview-range surfaces should
                even render. */}
            {explore.isTooFewParticipants && (
                <div
                    className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800"
                    role="alert"
                >
                    <Info className="size-4 flex-shrink-0" aria-hidden="true" />
                    {t(
                        'admin.analysis.too_few_participants',
                        'Need at least 2 completed participants to run analysis.'
                    )}
                </div>
            )}

            {explore.isEigenvalueError && (
                <div
                    className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800"
                    role="alert"
                >
                    <AlertTriangle className="size-4 flex-shrink-0" aria-hidden="true" />
                    <span className="flex-1">
                        {t(
                            'admin.analysis.eigenvalue_error',
                            'Failed to load analysis data. Please try again.'
                        )}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={explore.handleRefetchEigenvalues}
                        className="gap-1.5 shrink-0"
                    >
                        <RefreshCw className="size-3.5" aria-hidden="true" />
                        {t('admin.analysis.retry', 'Retry')}
                    </Button>
                </div>
            )}

            {explore.eigenvaluesIsLoading && (
                <div
                    className="flex items-center justify-center py-8 text-slate-400"
                    role="status"
                    aria-live="polite"
                >
                    <Loader2 className="size-5 animate-spin mr-2" aria-hidden="true" />
                    {t('admin.analysis.loading_eigenvalues', 'Loading eigenvalues...')}
                </div>
            )}

            {/* Phase 3 ExplorerPanel — primary surfaces (Diagnostics, Preview
                range) plus the legacy form controls routed through the
                advancedContent slot. The "Commit and interpret" CTA is owned
                by ExplorerPanel itself. */}
            <ExplorerPanel
                explore={explore}
                advancedContent={
                    <div className="space-y-5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                            <div className="space-y-1.5">
                                <Label
                                    htmlFor="extraction-select"
                                    className="text-2xs font-black text-slate-500"
                                >
                                    {t('admin.analysis.extraction_method', 'Extraction')}
                                </Label>
                                <Select
                                    value={explore.extraction}
                                    onValueChange={explore.setExtraction}
                                    disabled={explore.isRunning}
                                >
                                    <SelectTrigger id="extraction-select">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="pca">
                                            {t('admin.analysis.pca', 'PCA')}
                                        </SelectItem>
                                        <SelectItem value="centroid">
                                            {t('admin.analysis.centroid', 'Centroid')}
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground leading-snug">
                                    {t(
                                        'admin.analysis.help_extraction',
                                        'PCA maximizes explained variance across factors. Centroid produces less mathematically constrained factors, which some Q researchers prefer for theoretical reasons.'
                                    )}
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <Label
                                    htmlFor="factors-select"
                                    className="text-2xs font-black text-slate-500"
                                >
                                    {t('admin.analysis.n_factors', 'Factors')}
                                </Label>
                                <Select
                                    value={String(explore.nFactors)}
                                    onValueChange={(v) => explore.setNFactors(Number(v))}
                                    disabled={explore.isRunning}
                                >
                                    <SelectTrigger id="factors-select">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Array.from({ length: explore.maxFactors }, (_, i) => (
                                            <SelectItem key={i + 1} value={String(i + 1)}>
                                                {i + 1}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground leading-snug">
                                    {t(
                                        'admin.analysis.help_n_factors',
                                        'Each factor represents a distinct viewpoint. More factors capture more nuance but may split coherent views; fewer factors give broader groupings.'
                                    )}
                                </p>
                            </div>
                        </div>

                        {/* Wave C — inner Advanced settings Accordion. Defaults
                            open when the user previously chose non-default
                            values (judgmental rotation, manual flagging, or
                            bootstrap), otherwise closed so most studies start
                            clean. */}
                        <Accordion
                            type="multiple"
                            defaultValue={
                                explore.rotation !== 'varimax' ||
                                explore.flagging !== 'auto' ||
                                explore.bootstrapEnabled
                                    ? ['advanced']
                                    : []
                            }
                        >
                            <AccordionItem
                                value="advanced"
                                className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/30"
                            >
                                <AccordionTrigger className="px-4 py-3 hover:no-underline data-[state=open]:border-b data-[state=open]:border-slate-200">
                                    <div className="flex flex-col items-start text-left">
                                        <span className="text-sm font-bold text-slate-700">
                                            {t(
                                                'admin.analysis.advanced.title',
                                                'Advanced settings'
                                            )}
                                        </span>
                                        <span className="text-xs font-medium text-slate-500 mt-0.5">
                                            {t(
                                                'admin.analysis.advanced.summary',
                                                'Rotation: {{rotation}} · Flagging: {{flagging}} · Bootstrap: {{bootstrap}}',
                                                {
                                                    rotation:
                                                        explore.rotation === 'varimax'
                                                            ? t('admin.analysis.varimax', 'Varimax')
                                                            : explore.rotation === 'none'
                                                              ? t('admin.analysis.none', 'None')
                                                              : t(
                                                                    'admin.analysis.rotation.judgmental.short',
                                                                    'Judgmental'
                                                                ),
                                                    flagging:
                                                        explore.flagging === 'auto'
                                                            ? t('admin.analysis.auto', 'Auto')
                                                            : t('admin.analysis.manual', 'Manual'),
                                                    bootstrap: explore.bootstrapEnabled
                                                        ? t(
                                                              'admin.analysis.advanced.bootstrap_on',
                                                              '{{n}} iterations',
                                                              { n: explore.bootstrapIterations }
                                                          )
                                                        : t(
                                                              'admin.analysis.advanced.bootstrap_off',
                                                              'off'
                                                          ),
                                                }
                                            )}
                                        </span>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent>
                                    <div className="px-4 py-4 space-y-5">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                                            <div className="space-y-1.5">
                                                <Label
                                                    htmlFor="rotation-select"
                                                    className="text-2xs font-black text-slate-500"
                                                >
                                                    {t(
                                                        'admin.analysis.rotation_method',
                                                        'Rotation'
                                                    )}
                                                </Label>
                                                <Select
                                                    value={explore.rotation}
                                                    onValueChange={explore.setRotation}
                                                    disabled={explore.isRunning}
                                                >
                                                    <SelectTrigger id="rotation-select">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="varimax">
                                                            {t('admin.analysis.varimax', 'Varimax')}
                                                        </SelectItem>
                                                        <SelectItem value="none">
                                                            {t('admin.analysis.none', 'None')}
                                                        </SelectItem>
                                                        <SelectItem value="judgmental">
                                                            {t(
                                                                'admin.analysis.rotation.judgmental.label',
                                                                'Judgmental (manual)'
                                                            )}
                                                        </SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <p className="text-xs text-muted-foreground leading-snug">
                                                    {t(
                                                        'admin.analysis.help_rotation',
                                                        'Varimax maximizes the separation between factors, producing simpler structure. No rotation preserves the original mathematical solution. Judgmental lets you specify rotation angles manually.'
                                                    )}
                                                </p>
                                            </div>

                                            <div className="space-y-1.5">
                                                <Label
                                                    htmlFor="flagging-select"
                                                    className="text-2xs font-black text-slate-500"
                                                >
                                                    {t(
                                                        'admin.analysis.flagging_method',
                                                        'Flagging'
                                                    )}
                                                </Label>
                                                <Select
                                                    value={explore.flagging}
                                                    onValueChange={(v) => {
                                                        explore.setFlagging(v as 'auto' | 'manual');
                                                    }}
                                                    disabled={explore.isRunning}
                                                >
                                                    <SelectTrigger id="flagging-select">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="auto">
                                                            {t('admin.analysis.auto', 'Auto')}
                                                        </SelectItem>
                                                        <SelectItem value="manual">
                                                            {t('admin.analysis.manual', 'Manual')}
                                                        </SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <p className="text-xs text-muted-foreground leading-snug">
                                                    {t(
                                                        'admin.analysis.help_flagging',
                                                        'Auto flags participants whose loading exceeds the significance threshold on exactly one factor. Manual lets you override flagging based on your own judgment.'
                                                    )}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Judgmental rotations sub-panel — visible only when rotation === 'judgmental' */}
                                        {explore.rotation === 'judgmental' && (
                                            <div className="space-y-3 pt-2 border-t border-slate-100">
                                                <div>
                                                    <h3 className="text-sm font-black text-slate-800">
                                                        {t(
                                                            'admin.analysis.manual_rotations.title',
                                                            'Manual rotations'
                                                        )}
                                                    </h3>
                                                    <p className="text-xs text-muted-foreground leading-snug mt-1">
                                                        {t(
                                                            'admin.analysis.manual_rotations.helper',
                                                            "Specify rotations as 'rotate factor F by Δ° around factor G'. Rotations are applied in order. Used to align factors with substantively-meaningful positions (Brown 1980; Watts & Stenner 2012)."
                                                        )}
                                                    </p>
                                                </div>

                                                {explore.manualRotations.length === 0 && (
                                                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                                                        {t(
                                                            'admin.analysis.manual_rotations.empty',
                                                            'Add at least one rotation to run the analysis.'
                                                        )}
                                                    </p>
                                                )}

                                                <ul className="space-y-2">
                                                    {explore.manualRotations.map((mr, idx) => (
                                                        <li
                                                            key={mr.id}
                                                            className="flex flex-wrap items-center gap-2"
                                                        >
                                                            <span className="text-xs text-slate-600">
                                                                {t(
                                                                    'admin.analysis.manual_rotations.factor_a_label',
                                                                    'Rotate factor'
                                                                )}
                                                            </span>
                                                            <Input
                                                                type="number"
                                                                min={1}
                                                                max={explore.nFactors}
                                                                step={1}
                                                                value={mr.factor_a}
                                                                onChange={(e) =>
                                                                    explore.updateManualRotation(
                                                                        idx,
                                                                        {
                                                                            factor_a: Number(
                                                                                e.target.value
                                                                            ),
                                                                        }
                                                                    )
                                                                }
                                                                disabled={explore.isRunning}
                                                                className="w-16 h-8 text-sm"
                                                                aria-label={t(
                                                                    'admin.analysis.manual_rotations.factor_a_label',
                                                                    'Rotate factor'
                                                                )}
                                                            />
                                                            <span className="text-xs text-slate-600">
                                                                {t(
                                                                    'admin.analysis.manual_rotations.angle_label',
                                                                    'by'
                                                                )}
                                                            </span>
                                                            <Input
                                                                type="number"
                                                                min={-180}
                                                                max={180}
                                                                step={1}
                                                                value={mr.angle_deg}
                                                                onChange={(e) =>
                                                                    explore.updateManualRotation(
                                                                        idx,
                                                                        {
                                                                            angle_deg: Number(
                                                                                e.target.value
                                                                            ),
                                                                        }
                                                                    )
                                                                }
                                                                disabled={explore.isRunning}
                                                                className="w-20 h-8 text-sm"
                                                                aria-label={t(
                                                                    'admin.analysis.manual_rotations.angle_label',
                                                                    'by'
                                                                )}
                                                            />
                                                            <span className="text-xs text-slate-600">
                                                                °{' '}
                                                                {t(
                                                                    'admin.analysis.manual_rotations.factor_b_label',
                                                                    'around factor'
                                                                )}
                                                            </span>
                                                            <Input
                                                                type="number"
                                                                min={1}
                                                                max={explore.nFactors}
                                                                step={1}
                                                                value={mr.factor_b}
                                                                onChange={(e) =>
                                                                    explore.updateManualRotation(
                                                                        idx,
                                                                        {
                                                                            factor_b: Number(
                                                                                e.target.value
                                                                            ),
                                                                        }
                                                                    )
                                                                }
                                                                disabled={explore.isRunning}
                                                                className="w-16 h-8 text-sm"
                                                                aria-label={t(
                                                                    'admin.analysis.manual_rotations.factor_b_label',
                                                                    'around factor'
                                                                )}
                                                            />
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() =>
                                                                    explore.removeManualRotation(
                                                                        idx
                                                                    )
                                                                }
                                                                disabled={explore.isRunning}
                                                                aria-label={t(
                                                                    'admin.analysis.manual_rotations.remove_aria',
                                                                    'Remove rotation'
                                                                )}
                                                                className="h-8 w-8 p-0"
                                                            >
                                                                <X
                                                                    className="size-4"
                                                                    aria-hidden="true"
                                                                />
                                                            </Button>
                                                        </li>
                                                    ))}
                                                </ul>

                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={explore.addManualRotation}
                                                    disabled={explore.isRunning}
                                                    className="gap-1.5"
                                                >
                                                    <Plus className="size-3.5" aria-hidden="true" />
                                                    {t(
                                                        'admin.analysis.manual_rotations.add',
                                                        'Add rotation'
                                                    )}
                                                </Button>
                                            </div>
                                        )}

                                        {/* Bootstrap stability toggle (Zabala & Pascual 2016) */}
                                        <div className="space-y-3 pt-2 border-t border-slate-100">
                                            <div className="flex items-start gap-3">
                                                <input
                                                    id="bootstrap-toggle"
                                                    type="checkbox"
                                                    checked={explore.bootstrapEnabled}
                                                    onChange={(e) =>
                                                        explore.setBootstrapEnabled(
                                                            e.target.checked
                                                        )
                                                    }
                                                    disabled={explore.isRunning}
                                                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                                />
                                                <div className="flex-1 space-y-1.5">
                                                    <Label
                                                        htmlFor="bootstrap-toggle"
                                                        className="text-sm font-black text-slate-800 cursor-pointer"
                                                    >
                                                        {t(
                                                            'admin.analysis.bootstrap.toggle_label',
                                                            'Run bootstrap stability'
                                                        )}
                                                    </Label>
                                                    <p className="text-xs text-muted-foreground leading-snug">
                                                        {t(
                                                            'admin.analysis.bootstrap.helper',
                                                            'Optional. Bootstrap resamples your Q-sorts with replacement and re-runs the analysis B times to estimate standard errors on z-scores. Useful when you want confidence intervals on factor scores (Zabala & Pascual 2016).'
                                                        )}
                                                    </p>
                                                </div>
                                            </div>

                                            {explore.bootstrapEnabled && (
                                                <div className="flex flex-wrap items-center gap-2 pl-7">
                                                    <Label
                                                        htmlFor="bootstrap-iterations"
                                                        className="text-2xs font-black text-slate-500"
                                                    >
                                                        {t(
                                                            'admin.analysis.bootstrap.iterations_label',
                                                            'Iterations (B)'
                                                        )}
                                                    </Label>
                                                    <Input
                                                        id="bootstrap-iterations"
                                                        type="number"
                                                        min={100}
                                                        max={5000}
                                                        step={100}
                                                        value={explore.bootstrapIterations}
                                                        onChange={(e) =>
                                                            explore.setBootstrapIterations(
                                                                Number(e.target.value)
                                                            )
                                                        }
                                                        disabled={explore.isRunning}
                                                        className="w-24 h-8 text-sm"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                    </div>
                }
            />

            {/* Analysis history */}
            <AnalysisHistoryPanel
                slug={slug}
                currentRunId={null}
                onLoadRun={(_result, run) => {
                    if (run) onSelectHistoricalRun(run.id);
                }}
            />
        </div>
    );
}

// ────────────────────────────────────────────────────────────────
// InterpretShell — result tabs + history panel + per-factor voices
// ────────────────────────────────────────────────────────────────

interface InterpretShellProps {
    slug: string;
    runId: number;
    interpret: InterpretPhaseApi;
    t: TFunction;
    onSelectHistoricalRun: (runId: number) => void;
    onBackToExplore: () => void;
    onFocusChange: (factor: number) => void;
    runs: AnalysisRunSummary[];
    compareTo: number | null;
    onPin: (runId: number) => void;
    onUnpin: () => void;
}

function InterpretShell({
    slug,
    runId,
    interpret,
    t,
    onSelectHistoricalRun,
    onBackToExplore,
    onFocusChange,
    runs,
    compareTo,
    onPin,
    onUnpin,
}: InterpretShellProps) {
    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab = searchParams.get('tab') ?? 'loadings';
    const setActiveTab = useCallback(
        (next: string) => {
            setSearchParams(
                (prev) => {
                    const params = new URLSearchParams(prev);
                    if (next === 'loadings') {
                        params.delete('tab');
                    } else {
                        params.set('tab', next);
                    }
                    return params;
                },
                { replace: true }
            );
        },
        [setSearchParams]
    );

    // ── Mode toggle: Focus (FactorCanvas) is the default; Overview keeps
    // the legacy four-tab layout as a one-click escape hatch for
    // cross-factor views (loadings/arrays/statements/summary).
    const [mode, setMode] = useState<'focus' | 'overview'>('focus');

    const run = interpret.run;
    const analysisResult = run ? (run.result as unknown as AnalysisResult) : null;

    // ── Manual flag overrides (Phase 2: local state) ─────────────────
    // The interpret hook is pure read; manual flagging is being re-thought
    // in PR 4 with the canvas. For now, we keep a light local-state copy
    // seeded from the run's auto-flagged participants whenever the run
    // loads, so the
    // FactorLoadingsTable still has somewhere to write toggles. The
    // flagging mode is read off the persisted run.
    const flaggingMode: 'auto' | 'manual' = run?.flagging_mode === 'manual' ? 'manual' : 'auto';
    const [manualFlags, setManualFlags] = useState<Record<number, number[]>>({});
    const seededRunIdRef = useRef<number | null>(null);
    useEffect(() => {
        if (!analysisResult || flaggingMode !== 'manual') {
            setManualFlags({});
            seededRunIdRef.current = null;
            return;
        }
        if (seededRunIdRef.current === runId) return;
        const flags: Record<number, number[]> = {};
        for (const p of analysisResult.participants) {
            if (p.flagged_factors && p.flagged_factors.length > 0) {
                flags[p.db_id] = [...p.flagged_factors];
            }
        }
        setManualFlags(flags);
        seededRunIdRef.current = runId;
    }, [analysisResult, flaggingMode, runId]);

    const handleToggleFlag = useCallback((participantDbId: number, factorNumber: number) => {
        setManualFlags((prev) => {
            const current = prev[participantDbId] ?? [];
            const has = current.includes(factorNumber);
            const next = has ? [] : [factorNumber];
            return { ...prev, [participantDbId]: next };
        });
    }, []);

    // ── Export ───────────────────────────────────────────────────────
    const [isExporting, setIsExporting] = useState(false);
    const handleExport = useCallback(
        async (type: 'loadings' | 'scores' | 'xlsx') => {
            if (!analysisResult) return;
            if (type === 'xlsx') {
                setIsExporting(true);
                try {
                    const factorNotes = run?.factor_notes ?? undefined;
                    const blob = await generateAnalysisXlsx(analysisResult, factorNotes);
                    downloadBlob(blob, `${slug}_analysis.xlsx`);
                } catch {
                    toast.error(
                        t('admin.analysis.export_error', 'Failed to generate XLSX export.')
                    );
                } finally {
                    setIsExporting(false);
                }
                return;
            }
            const csv =
                type === 'loadings'
                    ? generateLoadingsCsv(analysisResult)
                    : generateScoresCsv(analysisResult);
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            downloadBlob(blob, `${slug}_analysis_${type}.csv`);
        },
        [analysisResult, run, slug, t]
    );

    // ── currentRun — passed to FactorArraysView for the per-factor
    //   narrative editor. AnalysisRunRead is structurally a superset of
    //   AnalysisRunSummary, so we widen via cast.
    const currentRun = useMemo<AnalysisRunSummary | null>(() => {
        if (!run) return null;
        const { result: _omitted, ...summary } = run as AnalysisRunRead & {
            result?: unknown;
        };
        return summary as AnalysisRunSummary;
    }, [run]);

    // ── Per-analyst, per-study UI preference for showing per-factor narratives.
    // Owned by useInterpretPhase so the localStorage contract (default-true,
    // per-slug key, quota/private-mode safe) is covered by hook tests.
    const { showFactorNarratives, setShowFactorNarratives } = interpret;

    // ── Loading / error gates ────────────────────────────────────────
    if (interpret.isLoading) {
        return (
            <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6 pt-2">
                <StudyPageHeader
                    title={t('admin.analysis.title', 'Analysis')}
                    description={t(
                        'admin.analysis.description',
                        'Factor analysis of Q-sort data: extract viewpoints from participant responses'
                    )}
                    icon={ChartColumnStacked}
                />
                <div
                    className="flex items-center justify-center py-12 text-slate-400"
                    role="status"
                    aria-live="polite"
                    data-testid="interpret-phase"
                >
                    <Loader2 className="size-5 animate-spin mr-2" aria-hidden="true" />
                    {t('admin.analysis.loading_run', 'Loading run…')}
                </div>
            </div>
        );
    }

    if (interpret.isError || !analysisResult || !run) {
        return (
            <div
                className="flex flex-1 flex-col gap-6 p-4 sm:p-6 pt-2"
                data-testid="interpret-phase"
            >
                <StudyPageHeader
                    title={t('admin.analysis.title', 'Analysis')}
                    description={t(
                        'admin.analysis.description',
                        'Factor analysis of Q-sort data: extract viewpoints from participant responses'
                    )}
                    icon={ChartColumnStacked}
                />
                <div
                    className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800"
                    role="alert"
                >
                    <AlertTriangle className="size-4 flex-shrink-0" aria-hidden="true" />
                    <span className="flex-1">
                        {t(
                            'admin.analysis.eigenvalue_error',
                            'Failed to load analysis data. Please try again.'
                        )}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onBackToExplore}
                        className="gap-1.5 shrink-0"
                    >
                        <X className="size-3.5" aria-hidden="true" />
                        {t('admin.analysis.history.back_to_current', 'Back to current')}
                    </Button>
                </div>
                <AnalysisHistoryPanel
                    slug={slug}
                    currentRunId={null}
                    onLoadRun={(_r, summary) => {
                        if (summary) onSelectHistoricalRun(summary.id);
                    }}
                />
            </div>
        );
    }

    return (
        <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6 pt-2">
            <StudyPageHeader
                title={t('admin.analysis.title', 'Analysis')}
                description={t(
                    'admin.analysis.description',
                    'Factor analysis of Q-sort data: extract viewpoints from participant responses'
                )}
                icon={ChartColumnStacked}
            />

            {/* Phase marker — used by routing tests to assert that the
                page entered the Interpret branch. Not visually intrusive. */}
            <div className="sr-only" data-testid="interpret-phase">
                {t('admin.analysis.history.run_label', 'Run #{{id}}', { id: runId })}
            </div>

            {/* Export controls — interpret phase exposes the same XLSX / CSV
                export dropdown the original page placed alongside the Run
                button. The "Back to current" affordance lives on the run banner
                below, mirroring legacy chrome. */}
            <div className="flex items-center gap-3 pt-1">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="gap-2">
                            <Download className="size-4" aria-hidden="true" />
                            {t('admin.analysis.export', 'Export')}
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                        <DropdownMenuItem
                            onClick={() => void handleExport('xlsx')}
                            disabled={isExporting}
                        >
                            {isExporting && (
                                <Loader2
                                    className="size-3.5 animate-spin mr-1.5"
                                    aria-hidden="true"
                                />
                            )}
                            {t('admin.analysis.export_xlsx', 'XLSX: Complete Analysis')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => void handleExport('loadings')}>
                            {t('admin.analysis.export_loadings', 'CSV: Factor Loadings')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void handleExport('scores')}>
                            {t('admin.analysis.export_scores', 'CSV: Statement Scores')}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Analysis history */}
            <AnalysisHistoryPanel
                slug={slug}
                currentRunId={runId}
                onLoadRun={(_result, summary) => {
                    if (summary) {
                        onSelectHistoricalRun(summary.id);
                    } else {
                        // Panel may pass `(null, null)` after deleting the
                        // currently-displayed run — bounce back to explore.
                        onBackToExplore();
                    }
                }}
            />

            {/* Run banner */}
            <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                <History className="size-4 flex-shrink-0" aria-hidden="true" />
                <span className="flex-1">
                    {t(
                        'admin.analysis.history.viewing_banner',
                        'Viewing run from {{date}}: {{extraction}} · {{n}}F · {{rotation}}',
                        {
                            date: new Date(run.ran_at).toLocaleString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                            }),
                            extraction: run.extraction_method.toUpperCase(),
                            n: run.n_factors,
                            rotation: run.rotation_method,
                        }
                    )}
                </span>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onBackToExplore}
                    className="gap-1.5 shrink-0 text-amber-700 border-amber-300 hover:bg-amber-100"
                >
                    <X className="size-3.5" aria-hidden="true" />
                    {t('admin.analysis.history.back_to_current', 'Back to current')}
                </Button>
            </div>

            {/* Mode toggle — Focus (FactorCanvas) by default, Overview restores
                the legacy four-tab layout. Sits above the results card. */}
            <div className="flex justify-end">
                <div
                    className="inline-flex rounded-md bg-slate-100 p-1"
                    role="group"
                    aria-label={t('admin.analysis.interpret.mode_toggle', 'View mode')}
                >
                    <button
                        type="button"
                        onClick={() => setMode('focus')}
                        className={
                            mode === 'focus'
                                ? 'px-3 py-1.5 text-xs font-medium rounded bg-white text-slate-900 shadow-sm'
                                : 'px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900'
                        }
                        aria-pressed={mode === 'focus'}
                    >
                        {t('admin.analysis.interpret.focus_mode', 'Per-factor focus')}
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode('overview')}
                        className={
                            mode === 'overview'
                                ? 'px-3 py-1.5 text-xs font-medium rounded bg-white text-slate-900 shadow-sm'
                                : 'px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900'
                        }
                        aria-pressed={mode === 'overview'}
                    >
                        {t('admin.analysis.interpret.overview_mode', 'Overview')}
                    </button>
                </div>
            </div>

            {/* Non-fatal analysis warnings (e.g. centroid non-convergence, F-06-010).
                Persistent rather than dismissible: a data-quality caveat should
                stay visible while the analyst interprets and writes up the run. */}
            {analysisResult.warnings && analysisResult.warnings.length > 0 ? (
                <div
                    className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900"
                    role="status"
                    aria-live="polite"
                    data-testid="analysis-warnings"
                >
                    <AlertTriangle className="size-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="flex-1">
                        <p className="font-semibold">
                            {t('admin.analysis.warnings_title', 'This analysis raised warnings')}
                        </p>
                        <ul className="mt-1 list-disc pl-5 space-y-0.5">
                            {analysisResult.warnings.map((w, i) => (
                                <li key={`${i}-${w}`}>{w}</li>
                            ))}
                        </ul>
                    </div>
                </div>
            ) : null}

            {/* Results */}
            {mode === 'focus' ? (
                <FactorCanvas
                    slug={slug}
                    interpret={interpret}
                    onFocusChange={onFocusChange}
                    runs={runs}
                    compareTo={compareTo}
                    onPin={onPin}
                    onUnpin={onUnpin}
                />
            ) : (
                <Card className="border-none shadow-sm bg-white rounded-2xl relative">
                    <CardContent className="pt-5 pb-5">
                        <Tabs value={activeTab} onValueChange={setActiveTab}>
                            <TabsList className="mb-5 flex-wrap h-auto gap-1">
                                <TabsTrigger value="loadings" className="gap-1.5">
                                    <BarChart3 className="size-3.5" aria-hidden="true" />
                                    {t('admin.analysis.tab_loadings', 'Loadings')}
                                </TabsTrigger>
                                <TabsTrigger value="arrays" className="gap-1.5">
                                    <Grid3X3 className="size-3.5" aria-hidden="true" />
                                    {t('admin.analysis.tab_factor_arrays', 'Factor Arrays')}
                                </TabsTrigger>
                                <TabsTrigger value="statements" className="gap-1.5">
                                    <List className="size-3.5" aria-hidden="true" />
                                    {t('admin.analysis.tab_statements', 'Statements')}
                                </TabsTrigger>
                                <TabsTrigger value="summary" className="gap-1.5">
                                    <Info className="size-3.5" aria-hidden="true" />
                                    {t('admin.analysis.tab_summary', 'Summary')}
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="loadings" className="space-y-3">
                                <GuidanceCard
                                    title={t(
                                        'admin.analysis.guide_loadings_title',
                                        'Reading Factor Loadings'
                                    )}
                                    type="info"
                                    collapsible
                                    defaultOpen={false}
                                >
                                    <ul className="text-xs leading-relaxed space-y-1 list-disc list-inside">
                                        <li>
                                            {t(
                                                'admin.analysis.guide_loadings_1',
                                                'Each loading is a correlation (-1 to +1) between a participant and a factor (shared viewpoint).'
                                            )}
                                        </li>
                                        <li>
                                            {t(
                                                'admin.analysis.guide_loadings_2',
                                                'Highlighted values exceed the significance threshold shown above the table.'
                                            )}
                                        </li>
                                    </ul>
                                </GuidanceCard>
                                <FactorLoadingsTable
                                    result={analysisResult}
                                    flaggingMode={flaggingMode}
                                    manualFlags={manualFlags}
                                    onToggleFlag={handleToggleFlag}
                                />
                            </TabsContent>

                            <TabsContent value="arrays" className="space-y-3">
                                <GuidanceCard
                                    title={t(
                                        'admin.analysis.guide_arrays_title',
                                        'Interpreting Factor Arrays'
                                    )}
                                    type="info"
                                    collapsible
                                    defaultOpen={false}
                                >
                                    <ul className="text-xs leading-relaxed space-y-1 list-disc list-inside">
                                        <li>
                                            {t(
                                                'admin.analysis.guide_arrays_1',
                                                'Each factor array is the composite Q-sort representing one shared viewpoint.'
                                            )}
                                        </li>
                                        <li>
                                            {t(
                                                'admin.analysis.guide_arrays_2',
                                                'Read left-to-right as most disagreed to most agreed. Extreme positions carry the strongest signal for interpretation.'
                                            )}
                                        </li>
                                    </ul>
                                </GuidanceCard>
                                <FactorArraysView
                                    result={analysisResult}
                                    currentRun={currentRun}
                                    slug={slug}
                                    showFactorNarratives={showFactorNarratives}
                                    onToggleFactorNarratives={() =>
                                        setShowFactorNarratives(!showFactorNarratives)
                                    }
                                />
                            </TabsContent>

                            <TabsContent value="statements" className="space-y-3">
                                <GuidanceCard
                                    title={t(
                                        'admin.analysis.guide_statements_title',
                                        'Understanding Statement Scores'
                                    )}
                                    type="info"
                                    collapsible
                                    defaultOpen={false}
                                >
                                    <ul className="text-xs leading-relaxed space-y-1 list-disc list-inside">
                                        <li>
                                            {t(
                                                'admin.analysis.guide_statements_1',
                                                'Z-scores show how strongly each factor agrees or disagrees with each statement (0 = neutral).'
                                            )}
                                        </li>
                                        <li>
                                            {t(
                                                'admin.analysis.guide_statements_2',
                                                'D = distinguishing (placed significantly differently across factors). Stars indicate significance level.'
                                            )}
                                        </li>
                                    </ul>
                                </GuidanceCard>
                                <StatementsTable result={analysisResult} />
                            </TabsContent>

                            <TabsContent value="summary" className="space-y-3">
                                <GuidanceCard
                                    title={t(
                                        'admin.analysis.guide_summary_title',
                                        'Evaluating Your Solution'
                                    )}
                                    type="info"
                                    collapsible
                                    defaultOpen={false}
                                >
                                    <ul className="text-xs leading-relaxed space-y-1 list-disc list-inside">
                                        <li>
                                            {t(
                                                'admin.analysis.guide_summary_1',
                                                'Eigenvalues measure how much variance a factor explains. The Kaiser criterion (eigenvalue > 1) is one common heuristic for deciding how many factors to retain.'
                                            )}
                                        </li>
                                        <li>
                                            {t(
                                                'admin.analysis.guide_summary_2',
                                                'Composite reliability reflects how consistently the flagged sorts define each factor. Higher values mean the factor estimate is based on more agreement among its defining sorts.'
                                            )}
                                        </li>
                                    </ul>
                                </GuidanceCard>
                                <FactorCharacteristicsTable result={analysisResult} />
                            </TabsContent>
                        </Tabs>

                        {/* Per-factor voices panels — always rendered below all tabs */}
                        <div className="mt-4 space-y-2">
                            {Array.from({ length: analysisResult.n_factors }, (_, f) => (
                                <FactorVoicesPanel
                                    key={f}
                                    slug={slug}
                                    factorIndex={f}
                                    participants={analysisResult.participants}
                                />
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
