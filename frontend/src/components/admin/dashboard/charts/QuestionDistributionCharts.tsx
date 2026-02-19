import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { getLocalizedText } from '@/utils/localization';
import type { DumpParticipant, DumpResponse } from '../types';

interface PostsortQuestion {
    type: string;
    label: string | Record<string, string>;
    required?: boolean;
    options?: Array<string | { value?: string; label: string | Record<string, string> }>;
}

interface ChartBar {
    option: string;
    count: number;
    isNoAnswer?: boolean;
}

interface ChartDataItem {
    questionKey: string;
    questionLabel: string;
    type: string;
    bars: ChartBar[];
    noAnswerCount: number;
    totalParticipants: number;
}

interface ChartableQuestion {
    key: string;
    def: PostsortQuestion;
    /** How to read this question's answer from a participant */
    getAnswer: (p: DumpParticipant) => unknown;
}

interface QuestionDistributionChartsProps {
    presortConfig: DumpResponse['study']['presort_config'];
    postsortConfig: DumpResponse['study']['postsort_config'];
    filteredParticipants: DumpParticipant[];
    language: string;
}

const CHARTABLE_TYPES = new Set(['select', 'radio', 'checkbox']);
const BAR_COLOR = '#6366f1';
const NO_ANSWER_COLOR = '#cbd5e1';

/** Extract questions record from presort_config (handles legacy flat format + new {enabled, fields} format) */
function getPresortQuestions(
    config: Record<string, unknown> | undefined
): Record<string, PostsortQuestion> {
    if (!config || typeof config !== 'object') return {};
    if ('fields' in config && config.fields && typeof config.fields === 'object')
        return config.fields as Record<string, PostsortQuestion>;
    if (!('enabled' in config)) return config as Record<string, PostsortQuestion>;
    return {};
}

export function QuestionDistributionCharts({
    presortConfig,
    postsortConfig,
    filteredParticipants,
    language,
}: QuestionDistributionChartsProps) {
    const { t } = useTranslation();

    const chartableQuestions = useMemo(() => {
        const result: ChartableQuestion[] = [];

        // Presort questions — answers are flat in p.presort[key]
        const presortQuestions = getPresortQuestions(
            presortConfig as Record<string, unknown> | undefined
        );
        for (const [key, q] of Object.entries(presortQuestions)) {
            if (CHARTABLE_TYPES.has(q.type) && Array.isArray(q.options) && q.options.length > 0) {
                result.push({
                    key,
                    def: q,
                    getAnswer: (p) => p.presort[key],
                });
            }
        }

        // Postsort questions — answers are nested in p.postsort.questions_answers[key]
        const postsortQuestions = (postsortConfig as Record<string, unknown> | undefined)
            ?.questions;
        if (postsortQuestions && typeof postsortQuestions === 'object') {
            for (const [key, q] of Object.entries(
                postsortQuestions as Record<string, PostsortQuestion>
            )) {
                if (
                    CHARTABLE_TYPES.has(q.type) &&
                    Array.isArray(q.options) &&
                    q.options.length > 0
                ) {
                    result.push({
                        key,
                        def: q,
                        getAnswer: (p) => p.postsort.questions_answers?.[key],
                    });
                }
            }
        }

        return result;
    }, [presortConfig, postsortConfig]);

    const chartData: ChartDataItem[] = useMemo(() => {
        return chartableQuestions.map(({ key: questionKey, def: questionDef, getAnswer }) => {
            const optionMap = new Map<string, string>();
            const optionOrder: string[] = [];

            for (const opt of questionDef.options ?? []) {
                if (typeof opt === 'string') {
                    optionMap.set(opt, opt);
                    optionOrder.push(opt);
                } else {
                    const value = opt.value ?? getLocalizedText(opt.label, language, '');
                    const display = getLocalizedText(opt.label, language, value);
                    optionMap.set(value, display);
                    optionOrder.push(value);
                }
            }

            const counts = new Map<string, number>();
            for (const key of optionOrder) counts.set(key, 0);
            let noAnswerCount = 0;

            for (const p of filteredParticipants) {
                const answer = getAnswer(p);

                if (
                    answer === undefined ||
                    answer === null ||
                    answer === '' ||
                    (Array.isArray(answer) && answer.length === 0)
                ) {
                    noAnswerCount++;
                    continue;
                }

                if (Array.isArray(answer)) {
                    for (const val of answer) {
                        const key = String(val);
                        counts.set(key, (counts.get(key) ?? 0) + 1);
                    }
                } else {
                    const key = String(answer);
                    counts.set(key, (counts.get(key) ?? 0) + 1);
                }
            }

            const bars: ChartBar[] = optionOrder.map((key) => ({
                option: optionMap.get(key) ?? key,
                count: counts.get(key) ?? 0,
            }));

            if (noAnswerCount > 0) {
                bars.push({
                    option: t('admin.data.charts.no_answer', 'No answer'),
                    count: noAnswerCount,
                    isNoAnswer: true,
                });
            }

            return {
                questionKey,
                questionLabel: getLocalizedText(questionDef.label, language, questionKey),
                type: questionDef.type,
                bars,
                noAnswerCount,
                totalParticipants: filteredParticipants.length,
            };
        });
    }, [chartableQuestions, filteredParticipants, language, t]);

    if (chartData.length === 0) return null;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {chartData.map((item) => {
                const chartHeight = Math.max(180, item.bars.length * 40 + 40);
                return (
                    <Card key={item.questionKey}>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-bold">
                                {item.questionLabel}
                            </CardTitle>
                            <CardDescription className="text-xs">
                                {item.type === 'checkbox'
                                    ? t(
                                          'admin.data.charts.multi_select_note',
                                          'Multiple selections allowed'
                                      )
                                    : t(
                                          'admin.data.charts.responses_count',
                                          '{{count}} responses',
                                          {
                                              count: item.totalParticipants - item.noAnswerCount,
                                          }
                                      )}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ResponsiveContainer width="100%" height={chartHeight}>
                                <BarChart
                                    data={item.bars}
                                    layout="vertical"
                                    margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
                                    aria-label={t(
                                        'admin.data.charts.distribution_label',
                                        'Distribution for {{question}}',
                                        { question: item.questionLabel }
                                    )}
                                >
                                    <CartesianGrid
                                        strokeDasharray="3 3"
                                        stroke="#e2e8f0"
                                        horizontal={false}
                                    />
                                    <XAxis
                                        type="number"
                                        tick={{ fontSize: 12 }}
                                        allowDecimals={false}
                                    />
                                    <YAxis
                                        dataKey="option"
                                        type="category"
                                        tick={{ fontSize: 11 }}
                                        width={140}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            borderRadius: '12px',
                                            border: 'none',
                                            boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                                            fontSize: '12px',
                                        }}
                                        itemStyle={{ fontWeight: 600 }}
                                        formatter={(value: number | undefined) => [
                                            value ?? 0,
                                            t('admin.data.charts.count', 'Count'),
                                        ]}
                                        labelFormatter={(label: string) => label}
                                    />
                                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                                        {item.bars.map((bar, idx) => (
                                            <Cell
                                                key={`${item.questionKey}-${idx}`}
                                                fill={bar.isNoAnswer ? NO_ANSWER_COLOR : BAR_COLOR}
                                            />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>

                            {/* Screen-reader accessible data */}
                            <table className="sr-only">
                                <caption>{item.questionLabel}</caption>
                                <thead>
                                    <tr>
                                        <th>{t('admin.data.charts.option', 'Option')}</th>
                                        <th>{t('admin.data.charts.count', 'Count')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {item.bars.map((bar) => (
                                        <tr key={bar.option}>
                                            <td>{bar.option}</td>
                                            <td>{bar.count}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}
