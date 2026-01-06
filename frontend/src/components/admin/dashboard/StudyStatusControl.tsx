import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Rocket, PowerOff, Sparkles, Loader2, Lock } from 'lucide-react';
import { useChangeStudyStateApiAdminStudiesSlugStatePost } from '@/api/generated';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
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

    const handleStateChange = async (newState: 'draft' | 'active' | 'closed' | 'paused') => {
        try {
            await changeStateMutation.mutateAsync({
                slug,
                params: { new_state: newState },
            });
            const stateLabels = {
                draft: 'reverted to draft',
                active: 'launched',
                closed: 'closed',
                paused: 'paused',
            };
            toast.success(`Study ${stateLabels[newState]} successfully`);
            onStateChange();
        } catch (error) {
            toast.error(`Failed to change study state`);
            console.error(error);
        }
    };

    const isPending = changeStateMutation.isPending;

    const steps = [
        {
            id: 'draft',
            label: 'Draft',
            icon: Sparkles,
            description: 'Configuration & design',
            color: 'text-amber-600',
            bg: 'bg-amber-100',
            border: 'border-amber-200',
            activeClass: 'ring-2 ring-amber-500 bg-amber-50',
        },
        {
            id: 'active',
            label: 'Active',
            icon: Rocket,
            description: 'Collecting responses',
            color: 'text-emerald-600',
            bg: 'bg-emerald-100',
            border: 'border-emerald-200',
            activeClass: 'ring-2 ring-emerald-500 bg-emerald-50',
        },
        {
            id: 'paused',
            label: 'Paused',
            icon: PowerOff,
            description: 'On hold',
            color: 'text-orange-600',
            bg: 'bg-orange-100',
            border: 'border-orange-200',
            activeClass: 'ring-2 ring-orange-500 bg-orange-50',
        },
        {
            id: 'closed',
            label: 'Closed',
            icon: Lock,
            description: 'Analysis & export',
            color: 'text-slate-600',
            bg: 'bg-slate-100',
            border: 'border-slate-200',
            activeClass: 'ring-2 ring-slate-500 bg-slate-50',
        },
    ] as const;

    const renderActionDialog = (
        targetState: 'draft' | 'active' | 'paused' | 'closed',
        children: React.ReactNode
    ) => {
        const config = {
            draft: {
                title: 'Revert to Draft?',
                desc: 'This will stop data collection but allow you to modify the study design. Existing data is preserved.',
                action: 'Revert to Draft',
                variant: 'default',
            },
            active: {
                title: 'Launch Study?',
                desc: 'Activating the study will open it to participants.',
                action: 'Set to Active',
                variant: 'default',
            },
            paused: {
                title: 'Pause Study?',
                desc: 'Participants will not be able to enter the study while it is paused. You can resume later.',
                action: 'Pause Study',
                variant: 'destructive', // Warning color
            },
            closed: {
                title: 'Close Study?',
                desc: 'This will prevent new participants from entering. Existing sessions can still finish. You can reopen later.',
                action: 'Close Study',
                variant: 'destructive',
            },
        }[targetState];

        if (!config) return children;

        return (
            <AlertDialog>
                <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{config.title}</AlertDialogTitle>
                        <AlertDialogDescription>{config.desc}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => handleStateChange(targetState)}
                            className={cn(
                                config.variant === 'destructive' &&
                                    'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                            )}
                        >
                            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            {config.action}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        );
    };

    return (
        <Card className="shadow-sm border border-slate-200 bg-white mb-6">
            <CardContent className="p-1">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-1">
                    {steps.map((step) => {
                        const isActive = currentState === step.id;
                        // Determine if this step is targetable

                        let isClickable = false;
                        // Logic matrix (allow most transitions for flexibility)
                        if (currentState === 'draft' && step.id === 'active') isClickable = true;
                        if (
                            currentState === 'active' &&
                            (step.id === 'paused' || step.id === 'closed')
                        )
                            isClickable = true;
                        if (
                            currentState === 'paused' &&
                            (step.id === 'active' || step.id === 'closed' || step.id === 'draft')
                        )
                            isClickable = true;
                        if (
                            currentState === 'closed' &&
                            (step.id === 'active' || step.id === 'draft')
                        )
                            isClickable = true;

                        // Always allow reverting to draft if not already draft (except maybe from active? warning needed)
                        if (currentState !== 'draft' && step.id === 'draft') isClickable = true;

                        // Allow clicking current state? No.
                        if (isActive) isClickable = false;

                        const content = (
                            <div
                                className={cn(
                                    'relative flex flex-col items-center justify-center p-4 rounded-lg transition-all border',
                                    isActive
                                        ? cn(
                                              'bg-white shadow-sm z-10',
                                              step.activeClass,
                                              step.border
                                          )
                                        : 'bg-transparent border-transparent hover:bg-slate-50 text-slate-400 opacity-60 hover:opacity-100',
                                    isClickable &&
                                        'cursor-pointer hover:border-slate-200 hover:shadow-sm hover:opacity-100'
                                )}
                            >
                                <div
                                    className={cn(
                                        'h-8 w-8 rounded-full flex items-center justify-center mb-2 transition-colors',
                                        isActive ? step.bg : 'bg-slate-100'
                                    )}
                                >
                                    <step.icon
                                        className={cn(
                                            'h-4 w-4',
                                            isActive ? step.color : 'text-slate-400'
                                        )}
                                    />
                                </div>
                                <div className="text-sm font-bold tracking-tight mb-0.5">
                                    {step.label}
                                </div>
                                <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                                    {step.description}
                                </div>

                                {isActive && (
                                    <div className="absolute top-2 right-2">
                                        <div
                                            className={cn(
                                                'h-2 w-2 rounded-full',
                                                step.id === 'active'
                                                    ? 'bg-emerald-500 animate-pulse'
                                                    : 'bg-slate-300'
                                            )}
                                        />
                                    </div>
                                )}
                            </div>
                        );

                        if (isClickable) {
                            return (
                                <React.Fragment key={step.id}>
                                    {renderActionDialog(
                                        step.id as any,
                                        <div role="button" tabIndex={0} className="outline-none">
                                            {content}
                                        </div>
                                    )}
                                </React.Fragment>
                            );
                        }

                        return (
                            <div
                                key={step.id}
                                className={
                                    isActive ? '' : 'pointer-events-none grayscale opacity-40'
                                }
                            >
                                {content}
                            </div>
                        );
                    })}
                </div>
            </CardContent>
        </Card>
    );
};

export default StudyStatusControl;
