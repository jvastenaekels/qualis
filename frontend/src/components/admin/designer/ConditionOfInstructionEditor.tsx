import type { StudyTranslationRead as StudyTranslation } from '@/api/model/studyTranslationRead';
import { isRoughSortEnabled } from '@/utils/studyConfig';
import { useTranslation } from 'react-i18next';
import { useStudyDesigner } from '@/store/useStudyDesigner';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Target, RotateCcw, Lightbulb } from 'lucide-react';
import type React from 'react';
import { createResetToDefaultHandler } from '@/utils/studyResetHelpers';
import { MultiLangFieldIcon } from './MultiLangFieldIcon';

interface ConditionOfInstructionEditorProps {
    readOnly?: boolean;
    /**
     * Backend lock state for `rough_sort_enabled`. The toggle now lives
     * inside this editor (was previously in the Q-sort tab); the page
     * passes through the values it derives from the participant list via
     * {@link useRoughSortLock}.
     */
    roughSortLocked?: boolean;
    roughSortLockedCount?: number;
}

interface InstructionFieldProps {
    id: 'pre_instruction' | 'condition_of_instruction';
    title: string;
    description: string;
    placeholder: string;
    value: string;
    translations: Record<string, string>;
    activeLocale: string;
    readOnly?: boolean;
    onChange: (value: string) => void;
    onReset: () => void;
    resetLabel: string;
    fieldLabel: string;
}

const InstructionField = ({
    id,
    title,
    description,
    placeholder,
    value,
    translations,
    activeLocale,
    readOnly,
    onChange,
    onReset,
    resetLabel,
    fieldLabel,
}: InstructionFieldProps) => (
    <div className="space-y-3">
        <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight">{title}</h3>
            <p className="text-sm text-slate-500 italic mt-0.5">{description}</p>
        </div>
        <div className="grid gap-2">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Label
                        htmlFor={id}
                        className="text-2xs font-bold uppercase tracking-wide text-slate-500"
                    >
                        {fieldLabel}
                    </Label>
                    <MultiLangFieldIcon activeLocale={activeLocale} translations={translations} />
                </div>
                {!readOnly && (
                    <button
                        type="button"
                        onClick={onReset}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-2xs
                                   font-medium text-slate-500
                                   hover:text-indigo-600 hover:bg-slate-50 transition-colors"
                    >
                        <RotateCcw className="size-3" />
                        {resetLabel}
                    </button>
                )}
            </div>
            <Textarea
                id={id}
                value={value}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
                placeholder={placeholder}
                rows={3}
                className="min-h-[80px] text-base leading-relaxed rounded-xl border-slate-200 bg-slate-50/30 focus:bg-white focus-visible:ring-indigo-500/20 transition-all px-4 py-3 resize-y"
                disabled={readOnly}
            />
        </div>
    </div>
);

const ConditionOfInstructionEditor = ({
    readOnly,
    roughSortLocked = false,
    roughSortLockedCount = 0,
}: ConditionOfInstructionEditorProps) => {
    const { t } = useTranslation();
    const { draft, activeLocale, updateTranslation, updateDraft } = useStudyDesigner();

    const resetField = createResetToDefaultHandler(updateDraft, t);

    const resetInstruction = () => resetField('condition_of_instruction');
    const resetPreInstruction = () => resetField('pre_instruction');

    if (!draft) return null;

    const translation = draft.translations?.find((t) => t.language_code === activeLocale);

    const handleChange = (field: keyof StudyTranslation, value: string | null) => {
        updateTranslation(activeLocale, (t_trans) => {
            // keyof StudyTranslationRead ⊇ keyof DraftTranslation for all editable fields;
            // the double cast through unknown is needed because TS cannot prove the index
            // signature aligns, even though all editable field names are shared.
            (t_trans as unknown as Record<string, unknown>)[field as string] = value;
        });
    };

    const preInstructionTranslations =
        draft.translations?.reduce(
            (acc, tr) => {
                if (tr.pre_instruction) acc[tr.language_code] = tr.pre_instruction;
                return acc;
            },
            {} as Record<string, string>
        ) || {};

    const conditionTranslations =
        draft.translations?.reduce(
            (acc, tr) => {
                if (tr.condition_of_instruction)
                    acc[tr.language_code] = tr.condition_of_instruction;
                return acc;
            },
            {} as Record<string, string>
        ) || {};

    const roughSortOn = isRoughSortEnabled(draft);
    const fieldLabel = t('admin.design.condition.field_label', 'Instruction text');
    const resetLabel = t('common.reset_to_default');

    return (
        <div className="space-y-10 min-h-[500px]">
            <section className="space-y-6">
                <div className="flex items-center gap-3 text-slate-900 font-bold text-xl tracking-tight">
                    <div className="bg-indigo-50 p-2 rounded-xl border border-indigo-100 shadow-sm">
                        <Target className="h-5 w-5 text-indigo-600" />
                    </div>
                    {t('admin.design.condition.title')}
                </div>

                {/*
                 * Rough-sort toggle. Demoted from a Card to a plain row: it's
                 * the gate that decides whether the pre-instruction subsection
                 * appears below, not a content block of equal weight to the
                 * instruction fields. Lock policy mirrors backend
                 * study_service.update_study: once any participant has
                 * progressed past consent (last_step_reached > 1) the toggle
                 * is frozen.
                 */}
                <div className="space-y-2" data-testid="rough-sort-section">
                    {roughSortLocked && (
                        <div
                            data-testid="rough-sort-lock-banner"
                            className="rounded border-l-4 border-amber-400 bg-amber-50 p-2 text-sm text-amber-900"
                        >
                            {t('admin.study_design.rough_sort.lock_banner', {
                                count: roughSortLockedCount,
                                defaultValue:
                                    'Toggle locked. {{count}} participant(s) have started the survey; ' +
                                    'archive or delete those sessions before changing this setting.',
                            })}
                        </div>
                    )}
                    <label className="flex items-center gap-2">
                        {/* a11y-baseline: no aria-label needed — this checkbox is a direct
                            child of a native <label> whose sibling <span> is its accessible
                            name via HTML label association, not htmlFor/id. Verified with
                            getByRole('checkbox', { name: /enable preliminary sort/i }) against
                            an equivalent probe (task 6.7h, 2026-07-28); the gate's own
                            htmlFor-matching only recognises the id-pairing shape, so it still
                            reports this as unnamed. */}
                        <input
                            type="checkbox"
                            data-testid="rough-sort-toggle"
                            checked={roughSortOn}
                            disabled={roughSortLocked || readOnly}
                            onChange={(e) =>
                                updateDraft((d) => {
                                    d.rough_sort_enabled = e.target.checked;
                                })
                            }
                        />
                        <span className="text-sm font-semibold text-slate-900">
                            {t(
                                'admin.study_design.rough_sort.toggle_label',
                                'Enable preliminary sort (3-pile triage)'
                            )}
                        </span>
                    </label>
                    {!roughSortOn && (
                        <p className="text-xs italic text-slate-500 pl-6">
                            {t(
                                'admin.study_design.rough_sort.deck_mode_note',
                                'Disabled. Participants see the full Q-set as a horizontally-scrollable deck.'
                            )}
                        </p>
                    )}
                </div>

                <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                    <CardContent className="pt-6 pb-6 divide-y divide-slate-100 [&>*+*]:pt-8">
                        {roughSortOn && (
                            <InstructionField
                                id="pre_instruction"
                                title={t(
                                    'admin.design.condition.pre_title',
                                    'Preliminary sort instruction'
                                )}
                                description={t(
                                    'admin.design.condition.pre_desc',
                                    'Instruction given to participants during the initial rough sort.'
                                )}
                                placeholder={t(
                                    'admin.design.condition.pre_placeholder',
                                    'e.g. Based on your personal point of view...'
                                )}
                                value={translation?.pre_instruction || ''}
                                translations={preInstructionTranslations}
                                activeLocale={activeLocale}
                                readOnly={readOnly}
                                onChange={(v) => handleChange('pre_instruction', v)}
                                onReset={resetPreInstruction}
                                resetLabel={resetLabel}
                                fieldLabel={fieldLabel}
                            />
                        )}

                        <InstructionField
                            id="condition_of_instruction"
                            title={t('admin.design.condition.grid_title', 'Q-sort instruction')}
                            description={t(
                                'admin.design.condition.grid_desc',
                                'This is the core instruction guiding participants during the Q-sort process.'
                            )}
                            placeholder={t(
                                'admin.design.condition.placeholder',
                                'e.g. Please rank the following statements...'
                            )}
                            value={translation?.condition_of_instruction || ''}
                            translations={conditionTranslations}
                            activeLocale={activeLocale}
                            readOnly={readOnly}
                            onChange={(v) => handleChange('condition_of_instruction', v)}
                            onReset={resetInstruction}
                            resetLabel={resetLabel}
                            fieldLabel={fieldLabel}
                        />
                    </CardContent>
                </Card>
            </section>

            <section className="bg-amber-50/50 border border-amber-100 rounded-2xl p-6 shadow-sm">
                <h4 className="text-base font-bold text-amber-900 mb-2 flex items-center gap-2.5 tracking-tight">
                    <Lightbulb className="h-5 w-5 text-amber-600" />
                    {t('admin.design.condition.tips.title')}
                </h4>
                <p className="text-sm text-amber-800/80 leading-relaxed max-w-2xl">
                    {t('admin.design.condition.tips.desc')}
                </p>
            </section>
        </div>
    );
};

export default ConditionOfInstructionEditor;
