import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useConfigStore } from '@/store/useConfigStore';
import { LayoutProvider } from '@/contexts/LayoutContext';
import WelcomePage from '@/pages/WelcomePage';
import PreSortPage from '@/pages/PreSortPage';
import RoughSortPage from '@/pages/RoughSortPage';
import PostSortPage from '@/pages/PostSortPage';
import { Smartphone, Monitor, RefreshCw, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const DesignerPreviewPage = () => {
    const { slug } = useParams<{ slug: string }>();
    const setConfig = useConfigStore((state) => state.setConfig);
    const [activeStep, setActiveStep] = useState<string>('intro');
    const [viewMode, setViewMode] = useState<'mobile' | 'desktop'>('mobile');

    useEffect(() => {
        if (!slug) return;

        const bc = new BroadcastChannel(`open-q-designer-${slug}`);

        bc.onmessage = (event) => {
            const { type, payload } = event.data;
            if (type === 'SYNC_DRAFT') {
                setConfig(payload.config);
                setActiveStep(payload.activeStep);
            }
        };

        // Also check if there's an initial state in localStorage
        const initial = localStorage.getItem(`open-q-designer-sync-${slug}`);
        if (initial) {
            const data = JSON.parse(initial);
            setConfig(data.config);
            setActiveStep(data.activeStep);
        }

        return () => bc.close();
    }, [slug, setConfig]);

    const renderContent = () => {
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
    };

    return (
        <div className="h-screen w-screen bg-slate-100 flex flex-col">
            {/* Toolbar */}
            <div className="bg-white border-b px-6 py-2 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Live Designer Preview
                    </span>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 bg-muted/50 p-1 rounded-lg">
                        <Button
                            size="icon"
                            variant={viewMode === 'mobile' ? 'secondary' : 'ghost'}
                            className="h-7 w-7"
                            onClick={() => setViewMode('mobile')}
                        >
                            <Smartphone className="h-4 w-4" />
                        </Button>
                        <Button
                            size="icon"
                            variant={viewMode === 'desktop' ? 'secondary' : 'ghost'}
                            className="h-7 w-7"
                            onClick={() => setViewMode('desktop')}
                        >
                            <Monitor className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Preview Area */}
            <div className="flex-1 overflow-hidden p-8 flex items-center justify-center">
                <div
                    className={cn(
                        'bg-background rounded-2xl shadow-2xl border overflow-hidden flex flex-col relative transition-all duration-300',
                        viewMode === 'mobile'
                            ? 'w-[375px] aspect-[9/19.5]'
                            : 'w-full h-full max-w-6xl max-h-[90vh]'
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
                            open-q.sh/study/{slug}/preview
                        </div>
                        <RefreshCw className="h-3 w-3 text-muted-foreground opacity-30" />
                    </div>

                    <div className="flex-1 overflow-y-auto bg-background">
                        <LayoutProvider>{renderContent()}</LayoutProvider>
                    </div>

                    {viewMode === 'mobile' && (
                        <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none">
                            <div className="bg-primary/90 text-primary-foreground text-[10px] py-1 px-3 rounded-full backdrop-blur shadow-lg flex items-center gap-2">
                                <CheckCircle2 className="h-3 w-3" />
                                Synchronizing...
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DesignerPreviewPage;
