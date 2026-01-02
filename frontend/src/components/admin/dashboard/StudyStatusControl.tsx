import type React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Rocket, PowerOff, AlertCircle, Loader2 } from 'lucide-react';
import { useChangeStudyStateApiAdminStudiesSlugStatePost } from '@/api/generated';
import { toast } from 'sonner';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface StudyStatusControlProps {
    slug: string;
    currentState: string;
    onStateChange: () => void;
}

const StudyStatusControl: React.FC<StudyStatusControlProps> = ({
    slug,
    currentState,
    onStateChange,
}) => {
    const changeStateMutation = useChangeStudyStateApiAdminStudiesSlugStatePost();

    const handleStateChange = async (action: 'activate' | 'close') => {
        try {
            await changeStateMutation.mutateAsync({
                slug,
                params: { action },
            });
            toast.success(`Study ${action === 'activate' ? 'launched' : 'closed'} successfully`);
            onStateChange();
        } catch (error) {
            toast.error(`Failed to ${action} study`);
            console.error(error);
        }
    };

    const isPending = changeStateMutation.isPending;

    return (
        <Card className="shadow-md border-none bg-white overflow-hidden h-fit">
            <CardHeader className="border-b border-slate-50 bg-slate-50/30">
                <div className="flex items-center gap-2 mb-1">
                    <Rocket className="h-5 w-5 text-indigo-500" />
                    <CardTitle className="text-lg">Study Lifecycle</CardTitle>
                </div>
                <CardDescription>Control the current state of your fieldwork.</CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="space-y-0.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Current Status
                        </span>
                        <div className="flex items-center gap-2">
                            <div
                                className={`h-2 w-2 rounded-full animate-pulse ${
                                    currentState === 'active'
                                        ? 'bg-emerald-500'
                                        : currentState === 'completed'
                                          ? 'bg-slate-400'
                                          : 'bg-amber-500'
                                }`}
                            />
                            <span className="font-bold text-slate-700 uppercase tracking-tight">
                                {currentState}
                            </span>
                        </div>
                    </div>
                </div>

                {currentState === 'draft' && (
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button
                                className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200 shadow-lg font-bold"
                                disabled={isPending}
                            >
                                {isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Rocket className="h-4 w-4" />
                                )}
                                Launch Study
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Ready to go live?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Activating the study will allow participants to submit
                                    responses. Ensure your configuration is final.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Wait, let me check</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleStateChange('activate')}>
                                    Yes, Launch Now
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                )}

                {currentState === 'active' && (
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button
                                variant="outline"
                                className="w-full gap-2 border-slate-200 text-slate-600 hover:bg-slate-50 font-bold"
                                disabled={isPending}
                            >
                                {isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <PowerOff className="h-4 w-4" />
                                )}
                                Close Fieldwork
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Close this study?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    New participants will no longer be able to enter. Existing
                                    sessions can still be completed.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Keep Active</AlertDialogCancel>
                                <AlertDialogAction
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    onClick={() => handleStateChange('close')}
                                >
                                    Close Study
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                )}

                {currentState === 'completed' && (
                    <div className="p-3 bg-slate-50 rounded-lg flex gap-3 items-start border border-slate-100">
                        <AlertCircle className="h-4 w-4 text-slate-400 mt-0.5" />
                        <p className="text-[11px] text-slate-500 leading-relaxed">
                            This study is closed. Data is preserved for export and archival. To
                            restart, contact the system administrator.
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

export default StudyStatusControl;
