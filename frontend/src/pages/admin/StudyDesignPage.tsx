import { useNavigate, useParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
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
    AlertTriangle,
    ExternalLink,
    Palette,
} from 'lucide-react';
import Frame from 'react-frame-component';
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
import PostSortConfigEditor from '@/components/admin/designer/PostSortConfigEditor';
import BrandingEditor from '@/components/admin/designer/BrandingEditor';
import InterfaceEditor from '@/components/admin/designer/InterfaceEditor';
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

            // Broadcast to detachable preview windows
            if (slug) {
                const bc = new BroadcastChannel(`open-q-designer-${slug}`);
                bc.postMessage({
                    type: 'SYNC_DRAFT',
                    payload: {
                        config: syntheticStudy,
                        activeStep,
                    },
                });
                // Persist for initial load of new popups
                localStorage.setItem(
                    `open-q-designer-sync-${slug}`,
                    JSON.stringify({
                        config: syntheticStudy,
                        activeStep,
                    })
                );
                bc.close();
            }
        }
    }, [draft, activeLocale, activeStep, setConfig, slug]);

    // Dirty State Detection
    const isDirty = JSON.stringify(draft) !== JSON.stringify(study);

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isDirty]);

    // Grid Validation
    const statementsCount = draft?.statements?.length || 0;
    const gridCapacity = (draft?.grid_config || []).reduce(
        (acc, col) => acc + (col.capacity || 0),
        0
    );
    const isGridValid = statementsCount === gridCapacity;

    const handleSave = async () => {
        if (!slug || !draft) return;

        try {
            await updateMutation.mutateAsync({
                slug,
                // biome-ignore lint/suspicious/noExplicitAny: schema cast
                data: draft as any,
            });
            toast.success('Study design saved successfully');
        } catch (error) {
            toast.error('Failed to save study design');
            console.error(error);
        }
    };

    const handleTestRun = () => {
        if (!draft || !slug) return;

        // 1. Build synthetic config (same logic as side-preview)
        const translation = (draft.translations as any[])?.find(
            (t: any) => t.language_code === activeLocale
        );

        const syntheticConfig = {
            ...draft,
            title: translation?.title || 'No Title',
            subtitle: translation?.subtitle,
            description: translation?.description,
            objective: translation?.objective,
            instructions: translation?.instructions,
            consent: {
                title: translation?.consent_title,
                description: translation?.consent_description,
                accept: translation?.consent_accept,
                decline: translation?.consent_decline,
            },
            ui_labels: translation?.ui_labels || {},
            language: activeLocale,
            statements: (draft.statements || []).map((s: any) => {
                const st = s.translations?.find((t: any) => t.language_code === activeLocale);
                return {
                    id: Math.floor(Math.random() * 1000000), // Mock numerical ID
                    code: s.code,
                    text: st?.text || '',
                };
            }),
        };

        // 2. Persist to localStorage
        localStorage.setItem(`open-q-test-config-${slug}`, JSON.stringify(syntheticConfig));

        // 3. Open in new tab with mode=test
        window.open(`/study/${slug}?mode=test`, '_blank');
        toast.info('Opening study in pilot mode...');
    };

    if (isLoading) {
        return <DesignerSkeleton />;
    }

    if (!draft) return <div>Study not found</div>;

    const renderPreview = () => {
        // Collect styles for the iframe
        const head = (
            <>
                {/* Dev mode fallback */}
                <link href="/src/index.css" rel="stylesheet" />
                {/* Capture all style tags (Vite dev & some prod) */}
                {Array.from(document.querySelectorAll('style')).map((style, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: stable enough for dev preview
                    <style
                        key={`style-${i}`}
                        // biome-ignore lint/security/noDangerouslySetInnerHtml: injecting styles to preview
                        dangerouslySetInnerHTML={{ __html: style.innerHTML }}
                    />
                ))}
                {/* Capture all linked stylesheets (Prod bundles) */}
                {Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((link, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: stable
                    <link
                        key={`link-${i}`}
                        rel="stylesheet"
                        href={(link as HTMLLinkElement).href}
                    />
                ))}
            </>
        );

        return (
            <Frame
                initialContent='<!DOCTYPE html><html><head></head><body><div id="mount"></div></body></html>'
                head={head}
                style={{
                    width: '100%',
                    height: '100%',
                    border: 'none',
                    backgroundColor: 'white',
                }}
            >
                <LayoutProvider>
                    <div className="h-full w-full bg-background text-foreground">
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
                                case 'branding':
                                    return <BrandingEditor />;
                                case 'interface': // Show Welcome page for interface edits
                                    return <WelcomePage />;
                                default:
                                    return <WelcomePage />;
                            }
                        })()}
                    </div>
                </LayoutProvider>
            </Frame>
        );
    };

    return (
        <div className="flex flex-col h-[calc(100vh-theme(spacing.16))]">
            {/* Toolbar */}
            <div className="border-b bg-background px-6 py-2 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 px-3 py-1 bg-primary/5 rounded-md border border-primary/10">
                        <Wand2 className="h-4 w-4 text-primary" />
                        <span className="text-sm font-semibold">Study Designer</span>
                    </div>
                    <div className="h-4 w-px bg-border" />
                    <h2 className="text-sm font-medium truncate max-w-[200px] font-mono">
                        {draft.slug}
                    </h2>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 mr-4 bg-muted/50 rounded-lg p-1">
                        {draft?.supported_languages?.map((lang: string) => (
                            <Button
                                key={lang}
                                variant={activeLocale === lang ? 'secondary' : 'ghost'}
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => setActiveLocale(lang)}
                            >
                                {lang.toUpperCase()}
                            </Button>
                        )) || (
                            <Button
                                variant={activeLocale === 'en' ? 'secondary' : 'ghost'}
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => setActiveLocale('en')}
                            >
                                EN
                            </Button>
                        )}
                    </div>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsPreviewVisible(!isPreviewVisible)}
                        className="hidden lg:flex"
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

                    <Button variant="secondary" size="sm" onClick={handleTestRun} className="gap-2">
                        <Eye className="h-4 w-4" />
                        <span className="hidden sm:inline">Test Run</span>
                    </Button>

                    <Button
                        size="sm"
                        onClick={handleSave}
                        disabled={updateMutation.isPending}
                        className={cn(
                            'transition-all',
                            isDirty && 'ring-2 ring-primary ring-offset-2 shadow-lg'
                        )}
                    >
                        {updateMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                            <Save className="h-4 w-4 mr-2" />
                        )}
                        <span className="hidden sm:inline">
                            {isDirty ? 'Save Design*' : 'Save Design'}
                        </span>
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
                        <TabsList className="flex flex-nowrap overflow-x-auto w-full max-w-4xl mx-auto shadow-sm mb-8 scrollbar-hide snap-x">
                            <TabsTrigger
                                value="intro"
                                className="gap-2 min-w-fit px-4 flex-none snap-start"
                            >
                                👋 Welcome
                            </TabsTrigger>
                            <TabsTrigger
                                value="pre-sort"
                                className="gap-2 min-w-fit px-4 flex-none snap-start"
                            >
                                📋 Questionnaire
                            </TabsTrigger>
                            <TabsTrigger
                                value="q-sort"
                                className="gap-2 min-w-fit px-4 flex-none snap-start"
                            >
                                🃏 Q-Sort Task
                            </TabsTrigger>
                            <TabsTrigger
                                value="post-sort"
                                className="gap-2 min-w-fit px-4 flex-none snap-start"
                            >
                                📝 Post-Interview
                            </TabsTrigger>
                            <TabsTrigger
                                value="interface"
                                className="gap-2 min-w-fit px-4 flex-none snap-start"
                            >
                                🎨 Interface
                            </TabsTrigger>
                            <TabsTrigger
                                value="branding"
                                className="gap-2 min-w-fit px-4 flex-none snap-start"
                            >
                                <Palette className="h-4 w-4" /> Theme
                            </TabsTrigger>
                        </TabsList>

                        <div className="max-w-3xl mx-auto pb-20">
                            {!isGridValid && (
                                <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
                                    <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                                    <div>
                                        <h4 className="text-sm font-semibold text-amber-900">
                                            Grid Configuration Mismatch
                                        </h4>
                                        <p className="text-sm text-amber-700 mt-1">
                                            You have <strong>{statementsCount}</strong> statements
                                            but the grid only has slots for{' '}
                                            <strong>{gridCapacity}</strong> items. Please adjust the
                                            columns in the "Q-Sort Task" tab.
                                        </p>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="ml-auto bg-amber-100 hover:bg-amber-200 border-amber-300 text-amber-900"
                                        onClick={() => setActiveStep('q-sort')}
                                    >
                                        Fix
                                    </Button>
                                </div>
                            )}

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
                                <PostSortConfigEditor />
                            </TabsContent>

                            <TabsContent value="interface" className="mt-0 outline-none">
                                <InterfaceEditor />
                            </TabsContent>

                            <TabsContent value="branding" className="mt-0 outline-none">
                                <BrandingEditor />
                            </TabsContent>
                        </div>
                    </Tabs>
                </div>

                {/* Right Pane: Preview */}
                {isPreviewVisible && (
                    <div
                        className={cn(
                            'border-l bg-muted/10 flex-col shrink-0 transition-[width] duration-300 ease-in-out hidden lg:flex',
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
                                <div className="w-px h-3 bg-border mx-1" />
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6"
                                    onClick={() =>
                                        window.open(
                                            `/admin/studies/${slug}/design/preview`,
                                            '_blank',
                                            'width=1200,height=800'
                                        )
                                    }
                                    title="Pop out Preview"
                                >
                                    <ExternalLink className="h-3 w-3" />
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
