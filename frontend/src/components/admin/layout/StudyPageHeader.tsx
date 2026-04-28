import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface StudyPageHeaderProps {
    title: string;
    description?: string;
    icon?: LucideIcon;
    statusBadge?: React.ReactNode;
    actions?: React.ReactNode;
    className?: string;
}

export function StudyPageHeader({
    title,
    description,
    icon: Icon,
    statusBadge,
    actions,
    className,
}: StudyPageHeaderProps) {
    return (
        <header className={cn('flex flex-col gap-4 py-4 border-b border-slate-100', className)}>
            {/* Stack vertically until lg (1024px). Below that, the action group's
                expanded button labels (e.g. 'Bulk Import', 'Add Item') push past the
                title at narrow-but-not-tiny viewports (800-1024px), causing visual
                overlap. The original md (768px) breakpoint switched to horizontal
                layout too aggressively for that intermediate range. */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-3">
                        {Icon && (
                            <div className="p-2 bg-indigo-50 rounded-xl border border-indigo-100 shadow-sm hidden sm:block">
                                <Icon className="size-5 text-indigo-600" />
                            </div>
                        )}
                        <div className="space-y-1">
                            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
                                {title}
                                {statusBadge}
                            </h1>
                            {description && (
                                <p className="text-slate-600 text-sm font-medium">{description}</p>
                            )}
                        </div>
                    </div>
                </div>
                {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
            </div>
        </header>
    );
}
