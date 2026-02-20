import type React from 'react';
import { useState } from 'react';
import { Lightbulb, Info, AlertTriangle, ChevronDown } from 'lucide-react';
import * as Collapsible from '@radix-ui/react-collapsible';
import { cn } from '@/lib/utils';

interface GuidanceCardProps {
    title: string;
    description?: string;
    children?: React.ReactNode;
    type?: 'info' | 'tip' | 'warning';
    collapsible?: boolean;
    defaultOpen?: boolean;
    className?: string;
}

export const GuidanceCard: React.FC<GuidanceCardProps> = ({
    title,
    description,
    children,
    type = 'tip',
    collapsible = false,
    defaultOpen = true,
    className,
}) => {
    const [open, setOpen] = useState(defaultOpen);

    const icons = {
        info: <Info className="size-4 text-blue-500" />,
        tip: <Lightbulb className="size-4 text-amber-500" />,
        warning: <AlertTriangle className="size-4 text-orange-500" />,
    };

    const nonCollapsibleStyles = {
        info: 'bg-indigo-50/50 border-indigo-100 dark:bg-indigo-900/10 dark:border-indigo-900/10 text-indigo-900',
        tip: 'bg-amber-50/50 border-amber-100 dark:bg-amber-900/10 dark:border-amber-900/10 text-amber-900',
        warning:
            'bg-orange-50/50 border-orange-100 dark:bg-orange-900/10 dark:border-orange-900/10 text-orange-900',
    };

    const borderAccent = {
        info: 'border-l-blue-400',
        tip: 'border-l-amber-400',
        warning: 'border-l-orange-400',
    };

    const body = children ?? (
        <p className="text-sm font-medium opacity-80 leading-relaxed max-w-2xl">{description}</p>
    );

    if (!collapsible) {
        return (
            <div
                className={cn(
                    'flex items-start gap-5 p-6 rounded-2xl border shadow-sm animate-in fade-in slide-in-from-top-4 duration-700',
                    nonCollapsibleStyles[type],
                    className
                )}
            >
                <div className="shrink-0 mt-0.5 p-2 bg-white rounded-xl shadow-sm border border-inherit">
                    {icons[type]}
                </div>
                <div className="space-y-1.5">
                    <h4 className="text-base font-bold tracking-tight">{title}</h4>
                    {body}
                </div>
            </div>
        );
    }

    return (
        <Collapsible.Root open={open} onOpenChange={setOpen} asChild>
            <div
                className={cn(
                    'rounded-lg border-l-[3px] bg-slate-50/60 border border-slate-200/80',
                    borderAccent[type],
                    className
                )}
            >
                <Collapsible.Trigger asChild>
                    <button
                        type="button"
                        className="flex items-center gap-2.5 w-full px-4 py-2.5 text-left cursor-pointer hover:bg-slate-100/60 transition-colors rounded-lg"
                    >
                        {icons[type]}
                        <span className="text-sm font-medium text-slate-600 flex-1">{title}</span>
                        <ChevronDown
                            className={cn(
                                'size-3.5 shrink-0 text-slate-400 transition-transform duration-200',
                                open && 'rotate-180'
                            )}
                        />
                    </button>
                </Collapsible.Trigger>
                <Collapsible.Content className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                    <div className="px-4 pb-3 pl-[2.375rem] text-slate-600">{body}</div>
                </Collapsible.Content>
            </div>
        </Collapsible.Root>
    );
};
