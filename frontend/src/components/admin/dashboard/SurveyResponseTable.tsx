import type { StudyRead } from '@/api/model';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
    User as UserIcon,
    ClipboardList as SurveyIcon,
    MessageSquare as MessageIcon,
    HelpCircle as FeedbackIcon,
} from 'lucide-react';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { getLocalizedText } from '@/utils/localization';
import { MultiLangFieldIcon } from '@/components/admin/designer/MultiLangFieldIcon';

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

    if (!answers || Object.keys(answers).length === 0) {
        return (
            <div
                className={cn(
                    'p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200',
                    className
                )}
            >
                <FeedbackIcon className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-500">
                    {t(
                        'admin.participant.survey.no_answers',
                        'No answers recorded for this section.'
                    )}
                </p>
            </div>
        );
    }

    // --- Config & Question Logic ---
    const config = (type === 'presort' ? study.presort_config : study.postsort_config) || {};
    // biome-ignore lint/suspicious/noExplicitAny: dynamic config structure
    const cfg = config as any;
    const rawQuestions = cfg?.questions || cfg?.fields || (Array.isArray(cfg) ? cfg : []);

    // Transform questions into a map for fast lookup
    // biome-ignore lint/suspicious/noExplicitAny: dynamic config
    const questionsMap: Record<string, any> = {};
    if (Array.isArray(rawQuestions)) {
        for (const q of rawQuestions) {
            questionsMap[String(q.id)] = q;
        }
    } else if (typeof rawQuestions === 'object') {
        for (const [id, q] of Object.entries(rawQuestions)) {
            // biome-ignore lint/suspicious/noExplicitAny: dynamic config
            questionsMap[id] = { id, ...(q as any) };
        }
    }

    // --- Helpers ---
    const getResolvedLabel = (key: string) => {
        const q = questionsMap[key];
        if (q) {
            return getLocalizedText(q.label || q.text, language, key);
        }

        // Special Post-Sort Fields
        if (key === 'email') return t('post.contact.email_label', 'Email Address');
        if (key === 'interview_consent') return t('post.contact.interview_consent', 'Interview');
        if (key === 'newsletter_consent') return t('post.contact.newsletter_consent', 'Newsletter');
        if (key === '_recruitment_token')
            return t('admin.participant.metadata.recruitment_token', 'Ref');
        if (key === 'missing_statement')
            return t('post.extreme.missing_statement', 'Missing Statement');
        if (key === 'general_comment') return t('post.extreme.general_comment', 'General Comment');

        return key;
    };

    // biome-ignore lint/suspicious/noExplicitAny: dynamic survey values
    const getResolvedValue = (key: string, value: any) => {
        if (value === true)
            return (
                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50">
                    {t('common.yes', 'Yes')}
                </Badge>
            );
        if (value === false)
            return (
                <Badge variant="outline" className="text-slate-400 border-slate-200">
                    {t('common.no', 'No')}
                </Badge>
            );
        if (value === null || value === undefined || value === '')
            return <span className="text-slate-300">—</span>;

        const q = questionsMap[key];
        if (q?.options && Array.isArray(q.options)) {
            // Resolve options for single or multi choice
            const resolveOptionNode = (val: string | number) => {
                // biome-ignore lint/suspicious/noExplicitAny: dynamic option structure
                const opt = q.options.find((o: any) =>
                    typeof o === 'object'
                        ? String(o.value) === String(val)
                        : String(o) === String(val)
                );
                if (opt) {
                    return typeof opt === 'object'
                        ? getLocalizedText(opt.label, language, String(val))
                        : String(opt);
                }
                return String(val);
            };

            if (Array.isArray(value)) {
                return (
                    <div className="flex flex-wrap gap-1">
                        {value.map((v) => (
                            <Badge
                                key={v}
                                variant="secondary"
                                className="text-[10px] font-medium bg-indigo-50 text-indigo-700 border-indigo-100"
                            >
                                {resolveOptionNode(v)}
                            </Badge>
                        ))}
                    </div>
                );
            }
            return resolveOptionNode(value);
        }

        if (Array.isArray(value)) return value.join(', ');
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
    };

    // --- Grouping Logic ---
    const groups: {
        id: string;
        title: string;
        icon: React.ReactNode;
        items: {
            key: string;
            label: string;
            value: React.ReactNode;
            id?: string;
            rawTranslations?: Record<string, string> | { language_code: string; text?: string }[];
        }[];
    }[] = [];

    // biome-ignore lint/suspicious/noExplicitAny: generic value
    const addItem = (groupId: string, key: string, val: any) => {
        const group = groups.find((g) => g.id === groupId);
        if (group) {
            // Extract raw multilingual label for translation overlay
            const q = questionsMap[key];
            const rawLabel = q?.label || q?.text;
            const rawTranslations =
                rawLabel && typeof rawLabel === 'object' && !Array.isArray(rawLabel)
                    ? rawLabel
                    : undefined;

            group.items.push({
                key,
                label: getResolvedLabel(key),
                value: getResolvedValue(key, val),
                id: key,
                rawTranslations,
            });
        }
    };

    // Define potential groups
    groups.push({
        id: 'identity',
        title: t('admin.participant.survey.categories.identity', 'Identity & Contact'),
        icon: <UserIcon className="w-4 h-4" />,
        items: [],
    });
    groups.push({
        id: 'questions',
        title: t('admin.participant.survey.categories.questions', 'Questionnaire Responses'),
        icon: <SurveyIcon className="w-4 h-4" />,
        items: [],
    });
    groups.push({
        id: 'comments',
        title: t('admin.participant.survey.categories.comments', 'Card Comments'),
        icon: <MessageIcon className="w-4 h-4" />,
        items: [],
    });
    groups.push({
        id: 'feedback',
        title: t('admin.participant.survey.categories.feedback', 'General Feedback'),
        icon: <FeedbackIcon className="w-4 h-4" />,
        items: [],
    });

    // Populate from answers
    const processedKeys = new Set<string>();

    // 1. Explicitly handle nested objects first (typical of postsort)
    if (type === 'postsort') {
        // questions_answers
        if (answers.questions_answers && typeof answers.questions_answers === 'object') {
            for (const [k, v] of Object.entries(answers.questions_answers)) {
                addItem('questions', k, v);
            }
            processedKeys.add('questions_answers');
        }

        // card_comments
        if (answers.card_comments && typeof answers.card_comments === 'object') {
            const commentsContainer = groups.find((g) => g.id === 'comments');
            if (commentsContainer) {
                for (const [sIdStr, comment] of Object.entries(answers.card_comments)) {
                    if (!comment) continue;
                    const sId = Number(sIdStr);
                    const statement = study.statements?.find((s) => s.id === sId);
                    const statementText = statement
                        ? statement.translations?.find((t) => t.language_code === language)?.text ||
                          statement.translations?.[0]?.text ||
                          statement.code
                        : `${t('admin.participant.metadata.id', 'ID')}: ${sId}`;

                    // Build translations array for MultiLangFieldIcon
                    const stmtTranslations = statement?.translations?.map((tr) => ({
                        language_code: tr.language_code,
                        text: tr.text,
                    }));

                    commentsContainer.items.push({
                        key: sIdStr,
                        label: statementText,
                        value: (
                            <p className="italic text-indigo-900 bg-indigo-50/30 p-3 rounded-lg border border-indigo-100/50">
                                "{comment as string}"
                            </p>
                        ),
                        id: sIdStr,
                        rawTranslations: stmtTranslations,
                    });
                }
            }
            processedKeys.add('card_comments');
        }

        // Skip audio_recordings — handled separately in the UI
        processedKeys.add('audio_recordings');
    }

    // 2. Map other top-level keys
    for (const [key, val] of Object.entries(answers)) {
        if (processedKeys.has(key)) continue;

        if (
            key === 'email' ||
            key === 'interview_consent' ||
            key === 'newsletter_consent' ||
            key === '_recruitment_token'
        ) {
            addItem('identity', key, val);
        } else if (key === 'missing_statement' || key === 'general_comment') {
            addItem('feedback', key, val);
        } else {
            // Fallback for flat presort or unexpected postsort keys
            addItem('questions', key, val);
        }
    }

    // Filter empty groups
    const activeGroups = groups.filter((g) => g.items.length > 0);

    return (
        <div className={cn('w-full space-y-4', className)}>
            <Accordion
                type="multiple"
                defaultValue={activeGroups.map((g) => g.id)}
                className="space-y-4"
            >
                {activeGroups.map((group) => (
                    <AccordionItem
                        key={group.id}
                        value={group.id}
                        className="border border-slate-100 bg-white rounded-2xl shadow-sm overflow-hidden"
                    >
                        <AccordionTrigger className="px-6 py-4 hover:no-underline hover:bg-slate-50/50 transition-all group active:scale-[0.99]">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-slate-100 rounded-xl text-slate-500 group-data-[state=open]:bg-indigo-100 group-data-[state=open]:text-indigo-600 transition-colors">
                                    {group.icon}
                                </div>
                                <span className="text-xs font-black uppercase tracking-widest text-slate-500 group-data-[state=open]:text-slate-900 transition-colors">
                                    {group.title}
                                </span>
                                <Badge
                                    variant="secondary"
                                    className="ml-2 bg-slate-100 text-slate-400 group-data-[state=open]:bg-indigo-50 group-data-[state=open]:text-indigo-400"
                                >
                                    {group.items.length}
                                </Badge>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-0 pb-0 border-t border-slate-50">
                            <div className="divide-y divide-slate-50">
                                {group.items.map((item) => (
                                    <div
                                        key={item.key}
                                        className="px-3 sm:px-6 py-3 sm:py-4 flex flex-col md:flex-row md:items-start gap-2 sm:gap-4 hover:bg-slate-50/30 transition-colors"
                                    >
                                        <div className="md:w-1/2">
                                            <div className="flex items-start gap-1.5">
                                                <p className="text-sm font-bold text-slate-800 leading-snug flex-1">
                                                    {item.label}
                                                </p>
                                                {item.rawTranslations && (
                                                    <MultiLangFieldIcon
                                                        translations={item.rawTranslations}
                                                        activeLocale={language}
                                                        className="shrink-0 mt-0.5"
                                                    />
                                                )}
                                            </div>
                                            <p className="text-[10px] font-mono text-slate-400 mt-1 uppercase tracking-tighter opacity-70">
                                                {t('admin.participant.metadata.id', 'ID')}:{' '}
                                                {item.id || item.key}
                                            </p>
                                        </div>
                                        <div className="md:w-1/2 text-sm text-slate-600 font-medium">
                                            {item.value}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                ))}
            </Accordion>
        </div>
    );
}
