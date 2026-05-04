import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Rocket, PowerOff, Sparkles, Loader2, Lock } from 'lucide-react';
import {
    useChangeStudyStateApiAdminStudiesSlugStatePost,
    getListStudiesApiAdminStudiesGetQueryKey,
    getGetStudyApiAdminStudiesSlugGetQueryKey,
} from '@/api/generated';
import { useQueryClient } from '@tanstack/react-query';
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
import { useTranslation } from 'react-i18next';

type StudyState = 'draft' | 'active' | 'paused' | 'closed';

// ---------------------------------------------------------------------------
// Pure helper: state-machine transition guard
// ---------------------------------------------------------------------------

/**
 * Returns true when transitioning from `from` to `to` is allowed.
 * Extracted so the map callback stays below the complexity threshold.
 *
 * Reverting to draft is allowed from every non-draft state (active, paused,
 * closed) — confirmed by the existing `renderActionDialog` "Revert to Draft?"
 * confirmation entry.
 */
export function isTransitionAllowed(from: string, to: string): boolean {
    if (from === to) return false;
    if (from === 'draft') return to === 'active';
    if (from === 'active') return to === 'paused' || to === 'closed' || to === 'draft';
    if (from === 'paused') return to === 'active' || to === 'closed' || to === 'draft';
    if (from === 'closed') return to === 'active' || to === 'draft';
    return false;
}

// ---------------------------------------------------------------------------
// Sub-component: single status step tile
// ---------------------------------------------------------------------------

interface StepConfig {
    readonly id: string;
    readonly label: string;
    readonly icon: React.ElementType;
    readonly description: string;
    readonly color: string;
    readonly bg: string;
    readonly border: string;
    readonly activeClass: string;
}

interface StatusStepButtonProps {
    step: StepConfig;
    currentState: string;
    renderActionDialog: (targetState: StudyState, children: React.ReactNode) => React.ReactNode;
}

function StatusStepButton({ step, currentState, renderActionDialog }: StatusStepButtonProps) {
    const isActive = currentState === step.id;
    const isClickable = isTransitionAllowed(currentState, step.id);

    const content = (
        <div
            className={cn(
                'relative flex flex-col items-center justify-center p-2.5 rounded-lg transition-all border',
                isActive
                    ? cn('bg-white shadow-sm z-10', step.activeClass, step.border)
                    : 'bg-transparent border-transparent hover:bg-slate-50 text-slate-400 opacity-60 hover:opacity-100',
                isClickable &&
                    'cursor-pointer hover:border-slate-200 hover:shadow-sm hover:opacity-100'
            )}
        >
            <div
                className={cn(
                    'h-7 w-7 rounded-full flex items-center justify-center mb-1.5 transition-colors',
                    isActive ? step.bg : 'bg-slate-100'
                )}
            >
                <step.icon className={cn('h-4 w-4', isActive ? step.color : 'text-slate-400')} />
            </div>
            <div className="text-sm font-bold tracking-tight mb-0.5">{step.label}</div>
            <div className="text-2xs text-muted-foreground font-medium text-center">
                {step.description}
            </div>
            {isActive && (
                <div className="absolute top-2 right-2">
                    <div
                        className={cn(
                            'h-2 w-2 rounded-full',
                            step.id === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'
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
                    // biome-ignore lint/suspicious/noExplicitAny: generic ID
                    step.id as any,
                    <div role="button" tabIndex={0} className="outline-none">
                        {content}
                    </div>
                )}
            </React.Fragment>
        );
    }

    return (
        <div key={step.id} className={isActive ? '' : 'pointer-events-none grayscale opacity-40'}>
            {content}
        </div>
    );
}

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
    const { t } = useTranslation();
    const changeStateMutation = useChangeStudyStateApiAdminStudiesSlugStatePost();
    const queryClient = useQueryClient();

    const handleStateChange = async (newState: 'draft' | 'active' | 'closed' | 'paused') => {
        try {
            await changeStateMutation.mutateAsync({
                slug,
                params: { new_state: newState },
            });

            toast.success(t(`admin.study_status.notifications.success.${newState}`));

            // Invalidate queries more explicitly to ensure cache refresh
            // 1. Invalidate the specific study query
            await queryClient.invalidateQueries({
                queryKey: getGetStudyApiAdminStudiesSlugGetQueryKey(slug),
            });

            // 2. Also invalidate the studies list (for sidebar/switcher)
            await queryClient.invalidateQueries({
                queryKey: getListStudiesApiAdminStudiesGetQueryKey(),
            });

            onStateChange();
        } catch (error) {
            toast.error(
                t(
                    'admin.study_status.notifications.error',
                    'Could not change study state. Check your permissions and try again.'
                )
            );
            console.error(error);
        }
    };

    const isPending = changeStateMutation.isPending;

    const steps = [
        {
            id: 'draft',
            label: t('admin.study_status.steps.draft.label', 'Draft'),
            icon: Sparkles,
            description: t('admin.study_status.steps.draft.description', 'Configuration & design'),
            color: 'text-amber-600',
            bg: 'bg-amber-100',
            border: 'border-amber-200',
            activeClass: 'ring-2 ring-amber-500 bg-amber-50',
        },
        {
            id: 'active',
            label: t('admin.study_status.steps.active.label', 'Active'),
            icon: Rocket,
            description: t('admin.study_status.steps.active.description', 'Collecting responses'),
            color: 'text-emerald-600',
            bg: 'bg-emerald-100',
            border: 'border-emerald-200',
            activeClass: 'ring-2 ring-emerald-500 bg-emerald-50',
        },
        {
            id: 'paused',
            label: t('admin.study_status.steps.paused.label', 'Paused'),
            icon: PowerOff,
            description: t('admin.study_status.steps.paused.description', 'On hold'),
            color: 'text-orange-600',
            bg: 'bg-orange-100',
            border: 'border-orange-200',
            activeClass: 'ring-2 ring-orange-500 bg-orange-50',
        },
        {
            id: 'closed',
            label: t('admin.study_status.steps.closed.label', 'Closed'),
            icon: Lock,
            description: t('admin.study_status.steps.closed.description', 'Analysis & export'),
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
                title: t('admin.study_status.dialog.draft.title', 'Revert to Draft?'),
                desc: t(
                    'admin.study_status.dialog.draft.desc',
                    'This will stop data collection but allow you to modify the study design. Existing data is preserved.'
                ),
                action: t('admin.study_status.dialog.draft.action', 'Revert to Draft'),
                variant: 'default' as const,
            },
            active: {
                title: t('admin.study_status.dialog.active.title', 'Launch Study?'),
                desc: t(
                    'admin.study_status.dialog.active.desc',
                    'Activating the study will open it to participants.'
                ),
                action: t('admin.study_status.dialog.active.action', 'Set to Active'),
                variant: 'default' as const,
            },
            paused: {
                title: t('admin.study_status.dialog.paused.title', 'Pause Study?'),
                desc: t(
                    'admin.study_status.dialog.paused.desc',
                    'Participants will not be able to enter the study while it is paused. You can resume later.'
                ),
                action: t('admin.study_status.dialog.paused.action', 'Pause Study'),
                variant: 'destructive', // Warning color
            },
            closed: {
                title: t('admin.study_status.dialog.closed.title', 'Close Study?'),
                desc: t(
                    'admin.study_status.dialog.closed.desc',
                    'This will prevent new participants from entering. Existing sessions can still finish. You can reopen later.'
                ),
                action: t('admin.study_status.dialog.closed.action', 'Close Study'),
                variant: 'destructive',
            },
        }[targetState];

        if (!config) return children;

        return (
            <AlertDialog>
                <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
                <AlertDialogContent className="z-[9999] max-w-[95vw] sm:max-w-lg">
                    <AlertDialogHeader>
                        <AlertDialogTitle>{config.title}</AlertDialogTitle>
                        <AlertDialogDescription>{config.desc}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
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
        <Card className="shadow-sm border border-slate-200 bg-white">
            <CardContent className="p-1">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-1">
                    {steps.map((step) => (
                        <StatusStepButton
                            key={step.id}
                            step={step}
                            currentState={currentState}
                            renderActionDialog={renderActionDialog}
                        />
                    ))}
                </div>
            </CardContent>
        </Card>
    );
};

export default StudyStatusControl;
