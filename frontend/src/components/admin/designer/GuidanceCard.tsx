import type React from 'react';
import { Lightbulb, Info, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GuidanceCardProps {
    title: string;
    description: string;
    type?: 'info' | 'tip' | 'warning';
    className?: string;
}

export const GuidanceCard: React.FC<GuidanceCardProps> = ({
    title,
    description,
    type = 'tip',
    className,
}) => {
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
                <p className="text-sm font-medium opacity-80 leading-relaxed max-w-2xl">
                    {description}
                </p>
            </div>
        </div>
    );
};
