import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
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
} from 'lucide-react';
import { ApiError } from '@/api/client';

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

import {
    useGetEigenvaluesApiAdminStudiesSlugAnalysisEigenvaluesGet,
    useRunFactorAnalysisApiAdminStudiesSlugAnalysisRunPost,
} from '@/api/generated';
import type { AnalysisResult } from '@/api/model';

import { generateAnalysisXlsx } from '@/utils/analysisXlsxExport';
import { GuidanceCard } from '@/components/admin/GuidanceCard';
import { ScreePlot } from '@/components/admin/analysis/ScreePlot';
import { FactorLoadingsTable } from '@/components/admin/analysis/FactorLoadingsTable';
import { FactorArraysView } from '@/components/admin/analysis/FactorArraysView';
import { StatementsTable } from '@/components/admin/analysis/StatementsTable';
import { FactorCharacteristicsTable } from '@/components/admin/analysis/FactorCharacteristicsTable';

function downloadBlob(blob: Blob, filename: string) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
}

function generateLoadingsCsv(result: AnalysisResult): string {
    const headers = [
        'Participant',
        ...Array.from({ length: result.n_factors }, (_, f) => `F${f + 1}`),
        'Flagged',
    ];
    const rows = result.participants.map((p) => [
        p.label,
        ...p.loadings.map((l) => l.toFixed(4)),
        (p.flagged_factors ?? []).map((f) => `F${f}`).join(';') || '',
    ]);
    return [headers, ...rows].map((r) => r.join(',')).join('\n');
}

function generateScoresCsv(result: AnalysisResult): string {
    const dIds = new Set(result.distinguishing.map((d) => d.statement_id));
    const cIds = new Set(result.consensus.map((c) => c.statement_id));
    const headers = [
        'Code',
        'Statement',
        ...Array.from({ length: result.n_factors }, (_, f) => `F${f + 1} Z-Score`),
        ...Array.from({ length: result.n_factors }, (_, f) => `F${f + 1} Array`),
        'Type',
    ];
    const rows = result.statement_scores.map((s) => [
        s.code,
        `"${s.text.replace(/"/g, '""')}"`,
        ...s.z_scores.map((z) => z.toFixed(2)),
        ...s.factor_arrays.map(String),
        dIds.has(s.statement_id) ? 'D' : cIds.has(s.statement_id) ? 'C' : '',
    ]);
    return [headers, ...rows].map((r) => r.join(',')).join('\n');
}

export default function AnalysisPage() {
    const { studySlug } = useParams();
    const slug = studySlug ?? '';
    const { t } = useTranslation();
    const [searchParams, setSearchParams] = useSearchParams();

    // Restore parameters from URL or use defaults
    const [extraction, setExtraction] = useState(searchParams.get('extraction') || 'pca');
    const [nFactors, setNFactors] = useState(Number(searchParams.get('nFactors')) || 3);
    const [rotation, setRotation] = useState(searchParams.get('rotation') || 'varimax');
    const [flagging, setFlagging] = useState<'auto' | 'manual'>(
        (searchParams.get('flagging') as 'auto' | 'manual') || 'auto'
    );
    const [manualFlags, setManualFlags] = useState<Record<number, number[]>>({});
    const manualFlagsInitialized = useRef(false);
    const [activeTab, setActiveTab] = useState('loadings');
    const [isExporting, setIsExporting] = useState(false);

    // Analysis result state
    const [result, setResult] = useState<AnalysisResult | null>(null);

    // Persist control state to URL params
    const syncParams = useCallback(
        (ext: string, nf: number, rot: string, flag: string) => {
            setSearchParams(
                { extraction: ext, nFactors: String(nf), rotation: rot, flagging: flag },
                { replace: true }
            );
        },
        [setSearchParams]
    );

    // Eigenvalues query (for scree plot)
    const eigenvaluesQuery = useGetEigenvaluesApiAdminStudiesSlugAnalysisEigenvaluesGet(slug, {
        query: { enabled: !!slug },
    });

    // Cap factor dropdown at (n_participants - 1) or 10, whichever is smaller
    const maxFactors = useMemo(() => {
        if (!eigenvaluesQuery.data) return 10;
        return Math.min(Math.max(eigenvaluesQuery.data.eigenvalues.length - 1, 1), 10);
    }, [eigenvaluesQuery.data]);

    // Update nFactors when eigenvalues load with suggestion
    useEffect(() => {
        if (eigenvaluesQuery.data && !result) {
            const suggested = eigenvaluesQuery.data.suggested_n_factors;
            const capped = Math.min(suggested, maxFactors);
            setNFactors(capped);
        }
    }, [eigenvaluesQuery.data, result, maxFactors]);

    // Clamp nFactors when maxFactors changes
    useEffect(() => {
        if (nFactors > maxFactors) {
            setNFactors(maxFactors);
        }
    }, [maxFactors, nFactors]);

    // Analysis mutation (no retry for expensive CPU-bound request)
    const analysisMutation = useRunFactorAnalysisApiAdminStudiesSlugAnalysisRunPost({
        mutation: { retry: false },
    });

    const isRunning = analysisMutation.isPending;

    const handleRunAnalysis = useCallback(() => {
        // Build manual_flags payload: { participant_db_id: factor_number }
        const manualFlagsPayload: Record<string, number> | undefined =
            flagging === 'manual'
                ? Object.fromEntries(
                      Object.entries(manualFlags).flatMap(([dbId, factors]) =>
                          factors.map((f) => [dbId, f])
                      )
                  )
                : undefined;

        analysisMutation.mutate(
            {
                slug,
                data: {
                    extraction,
                    n_factors: nFactors,
                    rotation,
                    flagging,
                    manual_flags: manualFlagsPayload,
                },
            },
            {
                onSuccess: (data) => {
                    setResult(data);
                    syncParams(extraction, nFactors, rotation, flagging);
                    toast.success(
                        t('admin.analysis.success', 'Analysis complete — {{n}} factors extracted', {
                            n: data.n_factors,
                        })
                    );
                },
                onError: (error) => {
                    const message = error instanceof Error ? error.message : String(error);
                    toast.error(
                        t('admin.analysis.error', 'Analysis failed: {{message}}', { message })
                    );
                },
            }
        );
    }, [
        slug,
        extraction,
        nFactors,
        rotation,
        flagging,
        manualFlags,
        analysisMutation,
        syncParams,
        t,
    ]);

    const handleToggleFlag = useCallback((participantDbId: number, factorNumber: number) => {
        setManualFlags((prev) => {
            const current = prev[participantDbId] ?? [];
            const has = current.includes(factorNumber);
            // Toggle: only one factor per participant (Q-method standard)
            const next = has ? [] : [factorNumber];
            return { ...prev, [participantDbId]: next };
        });
    }, []);

    // Initialize manual flags from auto-flagging result when switching to manual mode
    useEffect(() => {
        if (result && flagging === 'manual' && !manualFlagsInitialized.current) {
            const flags: Record<number, number[]> = {};
            for (const p of result.participants) {
                if (p.flagged_factors && p.flagged_factors.length > 0) {
                    flags[p.db_id] = [...p.flagged_factors];
                }
            }
            setManualFlags(flags);
            manualFlagsInitialized.current = true;
        }
        if (flagging === 'auto') {
            manualFlagsInitialized.current = false;
        }
    }, [result, flagging]);

    const handleExport = useCallback(
        async (type: 'loadings' | 'scores' | 'xlsx') => {
            if (!result) return;
            if (type === 'xlsx') {
                setIsExporting(true);
                try {
                    const blob = await generateAnalysisXlsx(result);
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
                type === 'loadings' ? generateLoadingsCsv(result) : generateScoresCsv(result);
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            downloadBlob(blob, `${slug}_analysis_${type}.csv`);
        },
        [result, slug, t]
    );

    const hasEigenvalues = eigenvaluesQuery.isSuccess && eigenvaluesQuery.data;

    // Differentiate eigenvalue errors: 400 = too few participants, other = generic error
    const isTooFewParticipants =
        eigenvaluesQuery.isError &&
        eigenvaluesQuery.error instanceof ApiError &&
        eigenvaluesQuery.error.status === 400;
    const isEigenvalueError = eigenvaluesQuery.isError && !isTooFewParticipants;

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
                    {isTooFewParticipants && (
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

                    {isEigenvalueError && (
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
                                onClick={() => eigenvaluesQuery.refetch()}
                                className="gap-1.5 shrink-0"
                            >
                                <RefreshCw className="size-3.5" aria-hidden="true" />
                                {t('admin.analysis.retry', 'Retry')}
                            </Button>
                        </div>
                    )}

                    {eigenvaluesQuery.isLoading && (
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
                        {hasEigenvalues && (
                            <ScreePlot
                                eigenvalues={eigenvaluesQuery.data.eigenvalues}
                                suggestedNFactors={eigenvaluesQuery.data.suggested_n_factors}
                                selectedNFactors={nFactors}
                                onSelectNFactors={setNFactors}
                            />
                        )}
                        {!hasEigenvalues && !eigenvaluesQuery.isLoading && <div />}

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
                                    value={extraction}
                                    onValueChange={setExtraction}
                                    disabled={isRunning}
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
                                    value={String(nFactors)}
                                    onValueChange={(v) => setNFactors(Number(v))}
                                    disabled={isRunning}
                                >
                                    <SelectTrigger id="factors-select">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Array.from({ length: maxFactors }, (_, i) => (
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
                                    value={rotation}
                                    onValueChange={setRotation}
                                    disabled={isRunning}
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
                                    value={flagging}
                                    onValueChange={(v) => {
                                        setFlagging(v as 'auto' | 'manual');
                                        if (v === 'auto') setManualFlags({});
                                    }}
                                    disabled={isRunning}
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
                            onClick={handleRunAnalysis}
                            disabled={isRunning || !hasEigenvalues}
                            className="gap-2"
                        >
                            {isRunning ? (
                                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                            ) : (
                                <Play className="size-4" aria-hidden="true" />
                            )}
                            {isRunning
                                ? t('admin.analysis.running', 'Analyzing...')
                                : t('admin.analysis.run', 'Run Analysis')}
                        </Button>

                        {result && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" className="gap-2">
                                        <Download className="size-4" aria-hidden="true" />
                                        {t('admin.analysis.export', 'Export')}
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start">
                                    <DropdownMenuItem
                                        onClick={() => handleExport('xlsx')}
                                        disabled={isExporting}
                                    >
                                        {isExporting && (
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
                                    <DropdownMenuItem onClick={() => handleExport('loadings')}>
                                        {t(
                                            'admin.analysis.export_loadings',
                                            'CSV — Factor Loadings'
                                        )}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleExport('scores')}>
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

            {/* Results */}
            {result && (
                <Card className="border-none shadow-sm bg-white rounded-2xl relative">
                    {isRunning && (
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
                                    result={result}
                                    flaggingMode={flagging}
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
                                <FactorArraysView result={result} />
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
                                <StatementsTable result={result} />
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
                                <FactorCharacteristicsTable result={result} />
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>
            )}

            {/* Empty state */}
            {!result && !isRunning && hasEigenvalues && (
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
