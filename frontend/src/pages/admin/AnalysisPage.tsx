import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
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
    useGetEigenvaluesApiAdminStudiesSlugAnalysisEigenvaluesGet,
    useRunFactorAnalysisApiAdminStudiesSlugAnalysisRunPost,
} from '@/api/generated';
import type { AnalysisResult } from '@/api/model';

import { ScreePlot } from '@/components/admin/analysis/ScreePlot';
import { FactorLoadingsTable } from '@/components/admin/analysis/FactorLoadingsTable';
import { FactorArraysView } from '@/components/admin/analysis/FactorArraysView';
import { StatementsTable } from '@/components/admin/analysis/StatementsTable';
import { FactorCharacteristicsTable } from '@/components/admin/analysis/FactorCharacteristicsTable';

export default function AnalysisPage() {
    const { studySlug } = useParams();
    const slug = studySlug ?? '';
    const { t } = useTranslation();

    // Analysis parameters
    const [extraction, setExtraction] = useState('pca');
    const [nFactors, setNFactors] = useState(3);
    const [rotation, setRotation] = useState('varimax');
    const [activeTab, setActiveTab] = useState('loadings');

    // Analysis result state
    const [result, setResult] = useState<AnalysisResult | null>(null);

    // Eigenvalues query (for scree plot)
    const eigenvaluesQuery = useGetEigenvaluesApiAdminStudiesSlugAnalysisEigenvaluesGet(slug, {
        query: { enabled: !!slug },
    });

    // Update nFactors when eigenvalues load with suggestion
    useEffect(() => {
        if (eigenvaluesQuery.data && !result) {
            setNFactors(eigenvaluesQuery.data.suggested_n_factors);
        }
    }, [eigenvaluesQuery.data, result]);

    // Analysis mutation (no retry for expensive CPU-bound request)
    const analysisMutation = useRunFactorAnalysisApiAdminStudiesSlugAnalysisRunPost({
        mutation: { retry: false },
    });

    const handleRunAnalysis = () => {
        analysisMutation.mutate(
            {
                slug,
                data: {
                    extraction,
                    n_factors: nFactors,
                    rotation,
                    flagging: 'auto',
                },
            },
            {
                onSuccess: (data) => {
                    setResult(data);
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
    };

    const hasEigenvalues = eigenvaluesQuery.isSuccess && eigenvaluesQuery.data;

    // Differentiate eigenvalue errors: 400 = too few participants, other = generic error
    const isTooFewParticipants =
        eigenvaluesQuery.isError &&
        eigenvaluesQuery.error instanceof Error &&
        eigenvaluesQuery.error.message.includes('400');
    const isEigenvalueError = eigenvaluesQuery.isError && !isTooFewParticipants;

    return (
        <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
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
                    <CardTitle className="text-base">
                        {t('admin.analysis.configuration', 'Configuration')}
                    </CardTitle>
                    <CardDescription>
                        {t(
                            'admin.analysis.configuration_description',
                            'Select extraction method, number of factors, and rotation'
                        )}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Scree plot */}
                    {hasEigenvalues && (
                        <ScreePlot
                            eigenvalues={eigenvaluesQuery.data.eigenvalues}
                            suggestedNFactors={eigenvaluesQuery.data.suggested_n_factors}
                            selectedNFactors={nFactors}
                            onSelectNFactors={setNFactors}
                        />
                    )}

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
                            {t(
                                'admin.analysis.eigenvalue_error',
                                'Failed to load analysis data. Please try again.'
                            )}
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

                    {/* Parameters row */}
                    <div className="flex flex-wrap items-end gap-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="extraction-select" className="text-xs">
                                {t('admin.analysis.extraction_method', 'Extraction')}
                            </Label>
                            <Select value={extraction} onValueChange={setExtraction}>
                                <SelectTrigger id="extraction-select" className="w-[140px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="pca">PCA</SelectItem>
                                    <SelectItem value="centroid">
                                        {t('admin.analysis.centroid', 'Centroid')}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="factors-select" className="text-xs">
                                {t('admin.analysis.n_factors', 'Factors')}
                            </Label>
                            <Select
                                value={String(nFactors)}
                                onValueChange={(v) => setNFactors(Number(v))}
                            >
                                <SelectTrigger id="factors-select" className="w-[80px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Array.from({ length: 10 }, (_, i) => (
                                        <SelectItem key={i + 1} value={String(i + 1)}>
                                            {i + 1}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="rotation-select" className="text-xs">
                                {t('admin.analysis.rotation_method', 'Rotation')}
                            </Label>
                            <Select value={rotation} onValueChange={setRotation}>
                                <SelectTrigger id="rotation-select" className="w-[140px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="varimax">Varimax</SelectItem>
                                    <SelectItem value="none">
                                        {t('admin.analysis.none', 'None')}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <Button
                            onClick={handleRunAnalysis}
                            disabled={analysisMutation.isPending || !hasEigenvalues}
                            className="gap-2"
                        >
                            {analysisMutation.isPending ? (
                                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                            ) : (
                                <Play className="size-4" aria-hidden="true" />
                            )}
                            {analysisMutation.isPending
                                ? t('admin.analysis.running', 'Analyzing...')
                                : t('admin.analysis.run', 'Run Analysis')}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Results */}
            {result && (
                <Card className="border-none shadow-sm bg-white rounded-2xl">
                    <CardContent className="pt-6">
                        <Tabs value={activeTab} onValueChange={setActiveTab}>
                            <TabsList className="mb-4">
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

                            <TabsContent value="loadings">
                                <FactorLoadingsTable result={result} />
                            </TabsContent>

                            <TabsContent value="arrays">
                                <FactorArraysView result={result} />
                            </TabsContent>

                            <TabsContent value="statements">
                                <StatementsTable result={result} />
                            </TabsContent>

                            <TabsContent value="summary">
                                <FactorCharacteristicsTable result={result} />
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>
            )}

            {/* Empty state */}
            {!result && !analysisMutation.isPending && hasEigenvalues && (
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
