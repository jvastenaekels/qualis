import { ClipboardList, Construction, Home, LockKeyhole, SearchX } from 'lucide-react';
import type React from 'react';
import { useTranslation } from 'react-i18next';

export type StudyStatusType = 'not_found' | 'draft' | 'paused' | 'closed';

interface StudyStatusPageProps {
    type?: StudyStatusType;
    onRetry?: () => void;
}

interface StatusConfig {
    icon: React.ReactNode;
    title: string;
    message: string;
    actionLabel: string;
    actionHref?: string;
    onClick?: () => void;
}

const StudyStatusPage: React.FC<StudyStatusPageProps> = ({ type = 'not_found', onRetry }) => {
    const { t } = useTranslation();

    const config: Record<StudyStatusType, StatusConfig> = {
        not_found: {
            icon: <SearchX size={40} className="text-slate-400" />,
            title: t('common.errors.study_not_found.title'),
            message: t('common.errors.study_not_found.message'),
            actionLabel: t('common.errors.study_not_found.action'),
            actionHref: '/',
        },
        draft: {
            icon: <ClipboardList size={40} className="text-amber-500" />,
            title: t('common.status.draft.title'),
            message: t('common.status.draft.message'),
            actionLabel: t('common.status.draft.action'),
            actionHref: '/',
        },
        paused: {
            icon: <Construction size={40} className="text-blue-500" />,
            title: t('common.status.paused.title'),
            message: t('common.status.paused.message'),
            actionLabel: t('common.status.paused.action'),
            onClick: onRetry,
        },
        closed: {
            icon: <LockKeyhole size={40} className="text-slate-500" />,
            title: t('common.status.closed.title'),
            message: t('common.status.closed.message'),
            actionLabel: t('common.status.closed.action'),
            actionHref: '/',
        },
    };

    const current = config[type];

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 max-w-md w-full flex flex-col items-center space-y-6 animate-in fade-in zoom-in-95 duration-300">
                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-2">
                    {current.icon}
                </div>

                <div className="space-y-2">
                    <h1 className="text-2xl font-bold text-slate-800">{current.title}</h1>
                    <p className="text-slate-600">{current.message}</p>
                </div>

                {current.onClick ? (
                    <button
                        type="button"
                        onClick={current.onClick}
                        className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-full transition-all duration-200 active:scale-95 shadow-lg shadow-blue-600/20"
                    >
                        {current.actionLabel}
                    </button>
                ) : (
                    <a
                        href={current.actionHref || '/'}
                        className="flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-900 text-white font-semibold rounded-full transition-all duration-200 active:scale-95 shadow-lg shadow-slate-800/20"
                    >
                        <Home size={18} />
                        {current.actionLabel}
                    </a>
                )}
            </div>

            <p className="mt-8 text-sm text-slate-400">Qualis Platform</p>
        </div>
    );
};

export default StudyStatusPage;
