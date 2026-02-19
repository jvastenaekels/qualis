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
        info: <Info className="h-5 w-5 text-blue-500" />,
        tip: <Lightbulb className="h-5 w-5 text-amber-500" />,
        warning: <AlertTriangle className="h-5 w-5 text-orange-500" />,
    };

    const styles = {
        info: 'bg-indigo-50/50 border-indigo-100 dark:bg-indigo-900/10 dark:border-indigo-900/10 text-indigo-900',
        tip: 'bg-amber-50/50 border-amber-100 dark:bg-amber-900/10 dark:border-amber-900/10 text-amber-900',
        warning:
            'bg-orange-50/50 border-orange-100 dark:bg-orange-900/10 dark:border-orange-900/10 text-orange-900',
    };

    const body = children ?? (
        <p className="text-sm font-medium opacity-80 leading-relaxed max-w-2xl">{description}</p>
    );

    if (!collapsible) {
        return (
            <div
                className={cn(
                    'flex items-start gap-5 p-6 rounded-2xl border shadow-sm animate-in fade-in slide-in-from-top-4 duration-700',
                    styles[type],
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
                    'rounded-2xl border shadow-sm animate-in fade-in slide-in-from-top-4 duration-700',
                    styles[type],
                    className
                )}
            >
                <Collapsible.Trigger asChild>
                    <button
                        type="button"
                        className="flex items-center gap-5 w-full p-6 text-left cursor-pointer"
                    >
                        <div className="shrink-0 mt-0.5 p-2 bg-white rounded-xl shadow-sm border border-inherit">
                            {icons[type]}
                        </div>
                        <h4 className="text-base font-bold tracking-tight flex-1">{title}</h4>
                        <ChevronDown
                            className={cn(
                                'h-4 w-4 shrink-0 opacity-60 transition-transform duration-200',
                                open && 'rotate-180'
                            )}
                        />
                    </button>
                </Collapsible.Trigger>
                <Collapsible.Content className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                    <div className="px-6 pb-6 pl-[4.75rem]">{body}</div>
                </Collapsible.Content>
            </div>
        </Collapsible.Root>
    );
};
