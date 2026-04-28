import { useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    ChartColumnStacked,
    Play,
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
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
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
import { ScreePlot } from '@/components/admin/analysis/ScreePlot';
import { FactorLoadingsTable } from '@/components/admin/analysis/FactorLoadingsTable';
import { FactorArraysView } from '@/components/admin/analysis/FactorArraysView';
import { StatementsTable } from '@/components/admin/analysis/StatementsTable';
import { FactorCharacteristicsTable } from '@/components/admin/analysis/FactorCharacteristicsTable';
import { AnalysisHistoryPanel } from '@/components/admin/analysis/AnalysisHistoryPanel';
import { FactorVoicesPanel } from '@/components/admin/analysis/FactorVoicesPanel';
import { useAnalysisPage } from '@/hooks/admin/useAnalysisPage';

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: JSX shell complexity from 4 tab panels + conditional error/loading states; all logic lives in useAnalysisPage
export default function AnalysisPage() {
    const { studySlug, projectSlug } = useParams();
    const slug = studySlug ?? '';
    const { t } = useTranslation();

    // Active results tab persisted to ?tab= so reload + share-links are stable.
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

    const api = useAnalysisPage(slug);
    // Capture result in local const so TypeScript narrows it through JSX callback boundaries
    const analysisResult = api.result;

    // ── Empty-state contract: not enough participants for factor analysis ──
    // Wave A — UX progressive-disclosure audit. The configuration card walls
    // (4 dropdowns + rationale paragraphs) above a disabled "Run Analysis"
    // button are noise on a study with 0–1 completed sorts. Render an honest
    // contract instead. The history panel below preserves access to past runs
    // and its own pedagogical empty state with Watts & Stenner / Sneegas
    // citations.
    if (api.isTooFewParticipants && !analysisResult && !api.isRunning) {
        return (
            <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6 pt-2">
                <StudyPageHeader
                    title={t('admin.analysis.title', 'Analysis')}
                    description={t(
                        'admin.analysis.description',
                        'Factor analysis of Q-sort data — extract viewpoints from participant responses'
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
                    onLoadRun={api.handleLoadHistoricalRun}
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
                    'Factor analysis of Q-sort data — extract viewpoints from participant responses'
                )}
                icon={ChartColumnStacked}
            />

            {/* Controls */}
            <Card className="border-none shadow-sm bg-white rounded-2xl">
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-black">
                        {t('admin.analysis.configuration', 'Configuration')}
                    </CardTitle>
                    <CardDescription>
                        {t(
                            'admin.analysis.configuration_description',
                            'Select extraction method, number of factors, and rotation'
                        )}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    {api.isTooFewParticipants && (
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

                    {api.isEigenvalueError && (
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
                                onClick={api.handleRefetchEigenvalues}
                                className="gap-1.5 shrink-0"
                            >
                                <RefreshCw className="size-3.5" aria-hidden="true" />
                                {t('admin.analysis.retry', 'Retry')}
                            </Button>
                        </div>
                    )}

                    {api.eigenvaluesIsLoading && (
                        <div
                            className="flex items-center justify-center py-8 text-slate-400"
                            role="status"
                            aria-live="polite"
                        >
                            <Loader2 className="size-5 animate-spin mr-2" aria-hidden="true" />
                            {t('admin.analysis.loading_eigenvalues', 'Loading eigenvalues...')}
                        </div>
                    )}

                    {/* Scree plot + parameters: side-by-side on lg+ */}
                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 items-start">
                        {/* Scree plot */}
                        {api.hasEigenvalues &&
                            api.eigenvalues &&
                            api.suggestedNFactors !== undefined && (
                                <ScreePlot
                                    eigenvalues={api.eigenvalues}
                                    suggestedNFactors={api.suggestedNFactors}
                                    selectedNFactors={api.nFactors}
                                    onSelectNFactors={api.setNFactors}
                                />
                            )}
                        {!api.hasEigenvalues && !api.eigenvaluesIsLoading && <div />}

                        {/* Parameters — Wave C: only Extraction + Facteurs are
                            primary-visible. Rotation / Flagging / Bootstrap
                            move into the "Advanced settings" Accordion below
                            (audit REPORT.md finding 🔴3, when analysis IS
                            possible). Reduces decision surface from 4 dropdowns
                            + 4 rationale paragraphs to 2 dropdowns. */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 lg:w-[320px]">
                            <div className="space-y-1.5">
                                <Label
                                    htmlFor="extraction-select"
                                    className="text-2xs font-black text-slate-500"
                                >
                                    {t('admin.analysis.extraction_method', 'Extraction')}
                                </Label>
                                <Select
                                    value={api.extraction}
                                    onValueChange={api.setExtraction}
                                    disabled={api.isRunning}
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
                                    value={String(api.nFactors)}
                                    onValueChange={(v) => api.setNFactors(Number(v))}
                                    disabled={api.isRunning}
                                >
                                    <SelectTrigger id="factors-select">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Array.from({ length: api.maxFactors }, (_, i) => (
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
                    </div>

                    {/* Wave C — Advanced settings Accordion. Defaults open
                        when the user previously chose non-default values
                        (judgmental rotation, manual flagging, or bootstrap),
                        otherwise closed so most studies start clean. */}
                    <Accordion
                        type="multiple"
                        defaultValue={
                            api.rotation !== 'varimax' ||
                            api.flagging !== 'auto' ||
                            api.bootstrapEnabled
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
                                        {t('admin.analysis.advanced.title', 'Advanced settings')}
                                    </span>
                                    <span className="text-xs font-medium text-slate-500 mt-0.5">
                                        {t(
                                            'admin.analysis.advanced.summary',
                                            'Rotation: {{rotation}} · Flagging: {{flagging}} · Bootstrap: {{bootstrap}}',
                                            {
                                                rotation:
                                                    api.rotation === 'varimax'
                                                        ? t('admin.analysis.varimax', 'Varimax')
                                                        : api.rotation === 'none'
                                                          ? t('admin.analysis.none', 'None')
                                                          : t(
                                                                'admin.analysis.rotation.judgmental.short',
                                                                'Judgmental'
                                                            ),
                                                flagging:
                                                    api.flagging === 'auto'
                                                        ? t('admin.analysis.auto', 'Auto')
                                                        : t('admin.analysis.manual', 'Manual'),
                                                bootstrap: api.bootstrapEnabled
                                                    ? t(
                                                          'admin.analysis.advanced.bootstrap_on',
                                                          '{{n}} iterations',
                                                          { n: api.bootstrapIterations }
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
                                                {t('admin.analysis.rotation_method', 'Rotation')}
                                            </Label>
                                            <Select
                                                value={api.rotation}
                                                onValueChange={api.setRotation}
                                                disabled={api.isRunning}
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
                                                {t('admin.analysis.flagging_method', 'Flagging')}
                                            </Label>
                                            <Select
                                                value={api.flagging}
                                                onValueChange={(v) => {
                                                    api.setFlagging(v as 'auto' | 'manual');
                                                }}
                                                disabled={api.isRunning}
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
                                    {api.rotation === 'judgmental' && (
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

                                            {api.manualRotations.length === 0 && (
                                                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                                                    {t(
                                                        'admin.analysis.manual_rotations.empty',
                                                        'Add at least one rotation to run the analysis.'
                                                    )}
                                                </p>
                                            )}

                                            <ul className="space-y-2">
                                                {api.manualRotations.map((mr, idx) => (
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
                                                            max={api.nFactors}
                                                            step={1}
                                                            value={mr.factor_a}
                                                            onChange={(e) =>
                                                                api.updateManualRotation(idx, {
                                                                    factor_a: Number(
                                                                        e.target.value
                                                                    ),
                                                                })
                                                            }
                                                            disabled={api.isRunning}
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
                                                                api.updateManualRotation(idx, {
                                                                    angle_deg: Number(
                                                                        e.target.value
                                                                    ),
                                                                })
                                                            }
                                                            disabled={api.isRunning}
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
                                                            max={api.nFactors}
                                                            step={1}
                                                            value={mr.factor_b}
                                                            onChange={(e) =>
                                                                api.updateManualRotation(idx, {
                                                                    factor_b: Number(
                                                                        e.target.value
                                                                    ),
                                                                })
                                                            }
                                                            disabled={api.isRunning}
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
                                                                api.removeManualRotation(idx)
                                                            }
                                                            disabled={api.isRunning}
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
                                                onClick={api.addManualRotation}
                                                disabled={api.isRunning}
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
                                                checked={api.bootstrapEnabled}
                                                onChange={(e) =>
                                                    api.setBootstrapEnabled(e.target.checked)
                                                }
                                                disabled={api.isRunning}
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

                                        {api.bootstrapEnabled && (
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
                                                    value={api.bootstrapIterations}
                                                    onChange={(e) =>
                                                        api.setBootstrapIterations(
                                                            Number(e.target.value)
                                                        )
                                                    }
                                                    disabled={api.isRunning}
                                                    className="w-24 h-8 text-sm"
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>

                    {/* Warn before re-running when a result is already on screen */}
                    {analysisResult && (
                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 flex items-start gap-2">
                            <AlertTriangle
                                className="size-3.5 mt-0.5 shrink-0"
                                aria-hidden="true"
                            />
                            <span>
                                {t(
                                    'admin.analysis.run_will_replace',
                                    'Running again will replace the current results view. Use the history panel to compare runs.'
                                )}
                            </span>
                        </p>
                    )}

                    {/* Action buttons — visually separated */}
                    <div className="flex items-center gap-3 pt-1 border-t border-slate-100">
                        <Button
                            onClick={api.handleRunAnalysis}
                            disabled={
                                api.isRunning ||
                                !api.hasEigenvalues ||
                                api.isJudgmentalWithoutRotations
                            }
                            className="gap-2"
                        >
                            {api.isRunning ? (
                                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                            ) : (
                                <Play className="size-4" aria-hidden="true" />
                            )}
                            {api.isRunning
                                ? api.bootstrapEnabled
                                    ? t('admin.analysis.bootstrap.running', 'Running bootstrap…')
                                    : t('admin.analysis.running', 'Analyzing...')
                                : t('admin.analysis.run', 'Run Analysis')}
                        </Button>

                        {api.result && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" className="gap-2">
                                        <Download className="size-4" aria-hidden="true" />
                                        {t('admin.analysis.export', 'Export')}
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start">
                                    <DropdownMenuItem
                                        onClick={() => void api.handleExport('xlsx')}
                                        disabled={api.isExporting}
                                    >
                                        {api.isExporting && (
                                            <Loader2
                                                className="size-3.5 animate-spin mr-1.5"
                                                aria-hidden="true"
                                            />
                                        )}
                                        {t(
                                            'admin.analysis.export_xlsx',
                                            'XLSX — Complete Analysis'
                                        )}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        onClick={() => void api.handleExport('loadings')}
                                    >
                                        {t(
                                            'admin.analysis.export_loadings',
                                            'CSV — Factor Loadings'
                                        )}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() => void api.handleExport('scores')}
                                    >
                                        {t(
                                            'admin.analysis.export_scores',
                                            'CSV — Statement Scores'
                                        )}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Analysis history */}
            <AnalysisHistoryPanel
                slug={slug}
                currentRunId={api.viewingRun?.id ?? null}
                onLoadRun={api.handleLoadHistoricalRun}
            />

            {/* Historical run banner */}
            {api.viewingRun && (
                <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                    <History className="size-4 flex-shrink-0" aria-hidden="true" />
                    <span className="flex-1">
                        {t(
                            'admin.analysis.history.viewing_banner',
                            'Viewing run from {{date}} — {{extraction}} · {{n}}F · {{rotation}}',
                            {
                                date: new Date(api.viewingRun.ran_at).toLocaleString(undefined, {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                }),
                                extraction: api.viewingRun.extraction_method.toUpperCase(),
                                n: api.viewingRun.n_factors,
                                rotation: api.viewingRun.rotation_method,
                            }
                        )}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={api.handleClearHistoricalView}
                        className="gap-1.5 shrink-0 text-amber-700 border-amber-300 hover:bg-amber-100"
                    >
                        <X className="size-3.5" aria-hidden="true" />
                        {t('admin.analysis.history.back_to_current', 'Back to current')}
                    </Button>
                </div>
            )}

            {/* Results */}
            {analysisResult && (
                <Card className="border-none shadow-sm bg-white rounded-2xl relative">
                    {api.isRunning && (
                        <div
                            className="absolute inset-0 bg-white/75 z-10 flex items-center justify-center rounded-2xl"
                            role="status"
                            aria-live="polite"
                        >
                            <div className="flex items-center gap-2 text-slate-500">
                                <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                                <span className="text-sm">
                                    {t('admin.analysis.reanalyzing', 'Re-analyzing...')}
                                </span>
                            </div>
                        </div>
                    )}
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
                                        <li>
                                            {t(
                                                'admin.analysis.guide_loadings_3',
                                                'A "flagged" participant defines that factor. Look for clean structure: each person on one factor.'
                                            )}
                                        </li>
                                        <li>
                                            {t(
                                                'admin.analysis.guide_loadings_4',
                                                'Participants not flagged on any factor hold a unique view not captured by the solution.'
                                            )}
                                        </li>
                                    </ul>
                                </GuidanceCard>
                                <FactorLoadingsTable
                                    result={analysisResult}
                                    flaggingMode={api.flagging}
                                    manualFlags={api.manualFlags}
                                    onToggleFlag={api.handleToggleFlag}
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
                                        <li>
                                            {t(
                                                'admin.analysis.guide_arrays_3',
                                                'Amber-highlighted statements are distinguishing — placed significantly differently compared to other factors.'
                                            )}
                                        </li>
                                        <li>
                                            {t(
                                                'admin.analysis.guide_arrays_4',
                                                'Compare arrays across factors to see where viewpoints diverge and converge.'
                                            )}
                                        </li>
                                    </ul>
                                </GuidanceCard>
                                <FactorArraysView
                                    result={analysisResult}
                                    currentRun={api.currentRun}
                                    slug={slug}
                                    showFactorNarratives={api.showFactorNarratives}
                                    onToggleFactorNarratives={() =>
                                        api.setShowFactorNarratives(!api.showFactorNarratives)
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
                                        <li>
                                            {t(
                                                'admin.analysis.guide_statements_3',
                                                "C = consensus (all factors agree on placement). These don't help differentiate viewpoints."
                                            )}
                                        </li>
                                        <li>
                                            {t(
                                                'admin.analysis.guide_statements_4',
                                                'D statements reveal what makes each viewpoint unique. C statements show where viewpoints converge.'
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
                                        <li>
                                            {t(
                                                'admin.analysis.guide_summary_3',
                                                'Factor correlations show how much overlap exists between viewpoints. Higher correlations mean the factors share more common ground; lower correlations mean they are more distinct.'
                                            )}
                                        </li>
                                        <li>
                                            {t(
                                                'admin.analysis.guide_summary_4',
                                                'Total variance explained indicates how much of the overall variation in sorting patterns is captured by your solution.'
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

            {/* Empty state */}
            {!api.result && !api.isRunning && api.hasEigenvalues && (
                <div className="text-center py-12 text-slate-400">
                    <ChartColumnStacked className="size-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">
                        {t(
                            'admin.analysis.empty_state',
                            'Configure parameters above and click "Run Analysis" to extract factors from your Q-sort data.'
                        )}
                    </p>
                </div>
            )}
        </div>
    );
}
