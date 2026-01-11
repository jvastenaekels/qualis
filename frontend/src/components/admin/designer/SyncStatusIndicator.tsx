import { useStudyDesigner } from '@/store/useStudyDesigner';
import { cn } from '@/lib/utils';
import { Check, CloudOff, CloudUpload, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';

export function SyncStatusIndicator({ className }: { className?: string }) {
    const { t } = useTranslation();
    const { syncStatus, lastSavedAt } = useStudyDesigner();

    const getStatusContent = () => {
        switch (syncStatus) {
            case 'saving':
                return {
                    icon: <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" />,
                    text: t('admin.design.sync.saving', 'Saving...'),
                    color: 'text-indigo-600',
                };
            case 'error':
                return {
                    icon: <CloudOff className="h-3.5 w-3.5 text-rose-500" />,
                    text: t('admin.design.sync.error', 'Save error'),
                    color: 'text-rose-600',
                };
            case 'modified':
                return {
                    icon: <CloudUpload className="h-3.5 w-3.5 text-amber-500" />,
                    text: t('admin.design.sync.modified', 'Unsaved changes'),
                    color: 'text-amber-600',
                };
            default:
                return {
                    icon: <Check className="h-3.5 w-3.5 text-emerald-500" />,
                    text: lastSavedAt
                        ? `${t('admin.design.sync.synced', 'Changes saved')} (${format(lastSavedAt, 'HH:mm')})`
                        : t('admin.design.sync.synced', 'Changes saved'),
                    color: 'text-slate-500',
                };
        }
    };

    const { icon, text, color } = getStatusContent();

    return (
        <div className={cn('flex items-center gap-1.5 px-2 py-1', className)}>
            {icon}
            {syncStatus !== 'synced' && syncStatus !== 'modified' && syncStatus !== 'saving' && (
                <span className={cn('text-[10px] font-black uppercase tracking-widest', color)}>
                    {text}
                </span>
            )}
        </div>
    );
}
