import { useState } from 'react';
import { useParams } from 'react-router-dom';
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
    X,
} from 'lucide-react';

import { StudyPageHeader } from '@/components/admin/layout/StudyPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { GuidanceCard } from '@/components/admin/GuidanceCard';
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
    const { studySlug } = useParams();
    const slug = studySlug ?? '';
    const { t } = useTranslation();

    // Visual-only state: active results tab (Radix UI, not testable logic)
    const [activeTab, setActiveTab] = useState('loadings');

    const api = useAnalysisPage(slug);
    // Capture result in local const so TypeScript narrows it through JSX callback boundaries
    const analysisResult = api.result;

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

                        {/* Parameters */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-x-4 gap-y-3 lg:w-[320px]">
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
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground leading-snug">
                                    {t(
                                        'admin.analysis.help_rotation',
                                        'Varimax maximizes the separation between factors, producing simpler structure. No rotation preserves the original mathematical solution.'
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
                    </div>

                    {/* Action buttons — visually separated */}
                    <div className="flex items-center gap-3 pt-1 border-t border-slate-100">
                        <Button
                            onClick={api.handleRunAnalysis}
                            disabled={api.isRunning || !api.hasEigenvalues}
                            className="gap-2"
                        >
                            {api.isRunning ? (
                                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                            ) : (
                                <Play className="size-4" aria-hidden="true" />
                            )}
                            {api.isRunning
                                ? t('admin.analysis.running', 'Analyzing...')
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
