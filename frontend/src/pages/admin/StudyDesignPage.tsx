import { useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
    Wand2,
    Save,
    Eye,
    EyeOff,
    RefreshCw,
    CheckCircle2,
    RotateCcw,
    Loader2,
    Smartphone,
    Monitor,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    useGetStudyApiAdminStudiesSlugGet,
    useUpdateStudyApiAdminStudiesSlugPatch,
} from '@/api/generated';
import { DesignerSkeleton } from '@/components/admin/DashboardSkeleton';
import { useStudyDesigner } from '@/store/useStudyDesigner';
import IntroductionEditor from '@/components/admin/designer/IntroductionEditor';
import QuestionBuilder from '@/components/admin/designer/QuestionBuilder';
import QSortEditor from '@/components/admin/designer/QSortEditor';
import WelcomePage from '@/pages/WelcomePage';
import PreSortPage from '@/pages/PreSortPage';
import RoughSortPage from '@/pages/RoughSortPage';
import PostSortPage from '@/pages/PostSortPage';
import { useConfigStore } from '@/store/useConfigStore';
import { LayoutProvider } from '@/contexts/LayoutContext';
import { toast } from 'sonner';

const StudyDesignPage = () => {
    const { slug } = useParams<{ slug: string }>();
    const _navigate = useNavigate();
    const {
        draft,
        activeStep,
        activeLocale,
        setStudy,
        setActiveStep,
        setActiveLocale,
        resetDraft,
    } = useStudyDesigner();

    const [isPreviewVisible, setIsPreviewVisible] = useState(true);
    const [viewMode, setViewMode] = useState<'mobile' | 'desktop'>('mobile');
    const setConfig = useConfigStore((state) => state.setConfig);

    const { data: study, isLoading } = useGetStudyApiAdminStudiesSlugGet(slug ?? '', {
        query: {
            enabled: !!slug,
        },
    });

    const updateMutation = useUpdateStudyApiAdminStudiesSlugPatch();

    // Initialize designer state when study is loaded
    useEffect(() => {
        if (study) {
            setStudy(study);
        }
    }, [study, setStudy]);

    // Sync draft with ConfigStore for preview components
    useEffect(() => {
        if (draft) {
            // Find active translation
            // biome-ignore lint/suspicious/noExplicitAny: translation map
            const translation = (draft.translations as any[])?.find(
                // biome-ignore lint/suspicious/noExplicitAny: complex type
                (t: any) => t.language_code === activeLocale
            );

            // Construct a "synthetic" study object for components
            const syntheticStudy = {
                ...draft,
                title: translation?.title || 'No Title',
                subtitle: translation?.subtitle,
                description: translation?.description,
                objective: translation?.objective,
                instructions: translation?.instructions,
                consent_title: translation?.consent_title,
                consent_description: translation?.consent_description,
                // biome-ignore lint/suspicious/noExplicitAny: simulation context
            } as any; // Using any for simulation context to avoid complex schema mismatches

            // Map statements for preview
            // biome-ignore lint/suspicious/noExplicitAny: statement mapping
            syntheticStudy.statements = (draft.statements || []).map((s: any) => {
                // biome-ignore lint/suspicious/noExplicitAny: translation mapping
                const st = s.translations?.find((t: any) => t.language_code === activeLocale);
                return {
                    id: s.code, // Participant components use ID but we use code in designer
                    code: s.code,
                    text: st?.text || '',
                };
            });

            setConfig(syntheticStudy);
        }
    }, [draft, activeLocale, setConfig]);

    const handleSave = async () => {
        if (!slug || !draft) return;

        try {
            await updateMutation.mutateAsync({
                slug,
                // biome-ignore lint/suspicious/noExplicitAny: schema cast
                data: draft as any,
            });
            toast.success('Study configuration saved successfully');
        } catch (error) {
            toast.error('Failed to save study configuration');
            console.error(error);
        }
    };

    if (isLoading) {
        return <DesignerSkeleton />;
    }

    if (!draft) return <div>Study not found</div>;

    const renderPreview = () => {
        return (
            <LayoutProvider>
                <div className="h-full w-full">
                    {(() => {
                        switch (activeStep) {
                            case 'intro':
                                return <WelcomePage />;
                            case 'pre-sort':
                                return <PreSortPage />;
                            case 'q-sort':
                                return <RoughSortPage />;
                            case 'post-sort':
                                return <PostSortPage />;
                            default:
                                return <WelcomePage />;
                        }
                    })()}
                </div>
            </LayoutProvider>
        );
    };

    return (
        <div className="flex flex-col h-[calc(100vh-theme(spacing.16))]">
            {/* Toolbar */}
            <div className="border-b bg-background px-6 py-2 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 px-3 py-1 bg-primary/5 rounded-md border border-primary/10">
                        <Wand2 className="h-4 w-4 text-primary" />
                        <span className="text-sm font-semibold">Flow Designer</span>
                    </div>
                    <div className="h-4 w-px bg-border" />
                    <h2 className="text-sm font-medium truncate max-w-[200px] font-mono">
                        {draft.slug}
                    </h2>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 mr-4 bg-muted/50 rounded-lg p-1">
                        <Button
                            variant={activeLocale === 'en' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => setActiveLocale('en')}
                        >
                            EN
                        </Button>
                        <Button
                            variant={activeLocale === 'fr' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => setActiveLocale('fr')}
                        >
                            FR
                        </Button>
                    </div>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsPreviewVisible(!isPreviewVisible)}
                    >
                        {isPreviewVisible ? (
                            <EyeOff className="h-4 w-4 mr-2" />
                        ) : (
                            <Eye className="h-4 w-4 mr-2" />
                        )}
                        {isPreviewVisible ? 'Hide Preview' : 'Show Preview'}
                    </Button>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={resetDraft}
                        title="Discard unsaved changes"
                    >
                        <RotateCcw className="h-4 w-4" />
                    </Button>

                    <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
                        {updateMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                            <Save className="h-4 w-4 mr-2" />
                        )}
                        Save Changes
                    </Button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left Pane: Editor */}
                <div className="flex-1 overflow-y-auto bg-muted/30 p-6">
                    <Tabs
                        value={activeStep}
                        // biome-ignore lint/suspicious/noExplicitAny: enum cast
                        onValueChange={(v: string) => setActiveStep(v as any)}
                        className="w-full"
                    >
                        <TabsList className="grid grid-cols-4 mb-8 w-full max-w-2xl mx-auto shadow-sm">
                            <TabsTrigger value="intro" className="gap-2">
                                👋 Welcome
                            </TabsTrigger>
                            <TabsTrigger value="pre-sort" className="gap-2">
                                📋 Questionnaire
                            </TabsTrigger>
                            <TabsTrigger value="q-sort" className="gap-2">
                                🃏 Q-Sort Task
                            </TabsTrigger>
                            <TabsTrigger value="post-sort" className="gap-2">
                                📝 Post-Interview
                            </TabsTrigger>
                        </TabsList>

                        <div className="max-w-3xl mx-auto pb-20">
                            <TabsContent value="intro" className="mt-0 outline-none">
                                <IntroductionEditor />
                            </TabsContent>

                            <TabsContent value="pre-sort" className="mt-0 outline-none">
                                <QuestionBuilder type="pre" />
                            </TabsContent>

                            <TabsContent value="q-sort" className="mt-0 outline-none">
                                <QSortEditor />
                            </TabsContent>

                            <TabsContent value="post-sort" className="mt-0 outline-none">
                                <QuestionBuilder type="post" />
                            </TabsContent>
                        </div>
                    </Tabs>
                </div>

                {/* Right Pane: Preview */}
                {isPreviewVisible && (
                    <div
                        className={cn(
                            'border-l bg-muted/10 flex flex-col shrink-0 transition-[width] duration-300 ease-in-out',
                            viewMode === 'mobile' ? 'w-[450px]' : 'w-[50vw]'
                        )}
                    >
                        <div className="p-4 border-b bg-background/50 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-2 bg-muted/50 p-1 rounded-lg">
                                <Button
                                    size="icon"
                                    variant={viewMode === 'mobile' ? 'default' : 'ghost'}
                                    className="h-6 w-6"
                                    onClick={() => setViewMode('mobile')}
                                    title="Mobile View"
                                >
                                    <Smartphone className="h-3 w-3" />
                                </Button>
                                <Button
                                    size="icon"
                                    variant={viewMode === 'desktop' ? 'default' : 'ghost'}
                                    className="h-6 w-6"
                                    onClick={() => setViewMode('desktop')}
                                    title="Desktop View"
                                >
                                    <Monitor className="h-3 w-3" />
                                </Button>
                            </div>
                            <div className="text-[10px] text-muted-foreground px-2 py-0.5 bg-background rounded border font-mono">
                                {activeLocale.toUpperCase()}
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 flex items-start justify-center bg-slate-100/50">
                            <div
                                className={cn(
                                    'bg-background rounded-2xl shadow-2xl border overflow-hidden flex flex-col relative transition-all duration-300',
                                    viewMode === 'mobile'
                                        ? 'w-[375px] aspect-[9/19.5]'
                                        : 'w-full h-full rounded-lg'
                                )}
                            >
                                {/* Browser Chrome Mockup */}
                                <div className="h-8 bg-muted/30 border-b flex items-center px-4 gap-2 shrink-0">
                                    <div className="flex gap-1.5">
                                        <div className="w-2 h-2 rounded-full bg-red-400/50" />
                                        <div className="w-2 h-2 rounded-full bg-amber-400/50" />
                                        <div className="w-2 h-2 rounded-full bg-emerald-400/50" />
                                    </div>
                                    <div className="h-5 flex-1 bg-background rounded border px-2 flex items-center mx-2 text-[10px] text-muted-foreground opacity-50 font-mono">
                                        open-q.sh/study/{draft.slug}
                                    </div>
                                    <RefreshCw className="h-3 w-3 text-muted-foreground opacity-30" />
                                </div>

                                {/* Simulation Content */}
                                <div className="flex-1 overflow-y-auto bg-background isolate">
                                    {renderPreview()}
                                </div>

                                {viewMode === 'mobile' && (
                                    <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none">
                                        <div className="bg-primary/90 text-primary-foreground text-[10px] py-1 px-3 rounded-full backdrop-blur shadow-lg flex items-center gap-2">
                                            <CheckCircle2 className="h-3 w-3" />
                                            Preview Mode
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default StudyDesignPage;
