import type { StudyRead } from '@/api/model';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { HelpCircle, CheckSquare } from 'lucide-react';

interface SurveyResponseTableProps {
    study: StudyRead;
    // biome-ignore lint/suspicious/noExplicitAny: dynamic survey answer structure
    answers: Record<string, any>;
    type: 'presort' | 'postsort';
    language: string;
    className?: string;
}

export function SurveyResponseTable({
    study,
    answers,
    type,
    language,
    className,
}: SurveyResponseTableProps) {
    const { t } = useTranslation();

    // Extract questions from config
    const config = type === 'presort' ? study.presort_config : study.postsort_config;
    // biome-ignore lint/suspicious/noExplicitAny: dynamic config structure
    const questions = (config as any)?.questions || (config as any)?.fields || [];

    // If questions is an object (legacy/simple), convert to array-like entries
    // based on the answers keys to ensure everything is shown even if missing in config
    const answerKeys = Object.keys(answers || {});

    if (answerKeys.length === 0) {
        return (
            <div
                className={cn(
                    'p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200',
                    className
                )}
            >
                <HelpCircle className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-500">
                    {t(
                        'admin.participant.survey.no_answers',
                        'No answers recorded for this section.'
                    )}
                </p>
            </div>
        );
    }

    const resolveLabel = (key: string) => {
        // 1. Try to find in questions array
        // biome-ignore lint/suspicious/noExplicitAny: dynamic question structure
        const q = questions.find((q: any) => q.id === key);
        if (q?.text) {
            return q.text[language] || q.text.en || key;
        }
        if (q?.label) {
            return typeof q.label === 'object' ? q.label[language] || q.label.en || key : q.label;
        }

        // 2. Try to find directly in config object (if it's a map)
        // biome-ignore lint/suspicious/noExplicitAny: dynamic config structure
        const directQ = (config as any)[key];
        if (directQ?.label) {
            return directQ.label[language] || directQ.label.en || key;
        }

        // 3. Special cases for hardcoded post-sort fields
        if (key === 'feedback') return t('admin.participant.survey.feedback', 'General Feedback');
        if (key === 'email') return t('admin.participant.survey.email', 'Email Address');
        if (key === 'newsletter_consent')
            return t('admin.participant.survey.newsletter', 'Newsletter Consent');

        return key;
    };

    // biome-ignore lint/suspicious/noExplicitAny: dynamic survey value types
    const renderValue = (value: any) => {
        if (value === true) return <CheckSquare className="h-4 w-4 text-emerald-500" />;
        if (value === false) return <span className="text-slate-300">—</span>;
        if (Array.isArray(value)) return value.join(', ');
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
    };

    return (
        <div
            className={cn(
                'overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm',
                className
            )}
        >
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100">
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-slate-500 w-1/2">
                            {t('admin.participant.survey.question', 'Question / Field')}
                        </th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-slate-500">
                            {t('admin.participant.survey.answer', 'Response')}
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                    {answerKeys.map((key) => (
                        <tr key={key} className="group hover:bg-slate-50/30 transition-colors">
                            <td className="px-6 py-4">
                                <p className="text-sm font-bold text-slate-900 leading-tight">
                                    {resolveLabel(key)}
                                </p>
                                <p className="text-[10px] font-mono text-slate-400 mt-1 uppercase tracking-tighter">
                                    ID: {key}
                                </p>
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-600 font-medium">
                                {renderValue(answers[key])}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
