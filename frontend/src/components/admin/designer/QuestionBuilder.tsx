import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
    GripVertical,
    Plus,
    Trash2,
    Type,
    Hash,
    PlusCircle,
    List as ListCircle,
    CheckSquare,
    GitBranch,
    Calendar,
    Mail,
    AlignLeft,
    Circle,
    Languages,
    Mic,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';
import { Card, CardContent } from '@/components/ui/card';
import { useStudyDesigner } from '@/store/useStudyDesigner';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { MultiLangFieldIcon } from './MultiLangFieldIcon';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type QuestionType =
    | 'text'
    | 'number'
    | 'select'
    | 'checkbox'
    | 'date'
    | 'email'
    | 'textarea'
    | 'radio'
    | 'text_audio';

interface QuestionConfig {
    type: QuestionType;
    label: string | Record<string, string>;
    required: boolean;
    options?: (string | { label: Record<string, string>; value: string })[];
    placeholder?: string | Record<string, string>;
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    rows?: number; // For textarea
    visibility_condition?: {
        depends_on: string;
        operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than';
        value: unknown;
    };
}

interface QuestionItemProps {
    id: string;
    question: QuestionConfig;
    onUpdate: (data: QuestionConfig) => void;
    onDelete: () => void;
    activeLocale: string;
    readOnly?: boolean;
    structureLocked?: boolean;
    availableQuestions: { id: string; label: string | Record<string, string> }[];
    availableLanguages: string[];
}

const QuestionItem = ({
    id,
    question,
    onUpdate,
    onDelete,
    activeLocale,
    readOnly,
    structureLocked,
    availableQuestions,
    availableLanguages,
}: QuestionItemProps) => {
    const { t } = useTranslation();
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id,
        disabled: readOnly || structureLocked,
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const label =
        typeof question.label === 'string'
            ? question.label
            : question.label?.[activeLocale] || question.label?.en || '';

    const handleLabelChange = (val: string) => {
        if (readOnly) return;

        // If it's a string, we transform it into a dictionary to avoid syncing across languages
        const newLabel =
            typeof question.label === 'string'
                ? { en: question.label, [activeLocale]: val }
                : { ...question.label, [activeLocale]: val };

        onUpdate({
            ...question,
            label: newLabel,
        });
    };

    const handleCopyFrom = (sourceLang: string) => {
        if (readOnly) return;

        const newQuestion = { ...question };

        // Copy label
        const sourceLabel =
            typeof question.label === 'object'
                ? question.label[sourceLang] || ''
                : question.label || '';

        newQuestion.label =
            typeof question.label === 'object'
                ? { ...question.label, [activeLocale]: sourceLabel }
                : { en: question.label || '', [activeLocale]: sourceLabel };

        // Copy placeholder
        if (question.placeholder) {
            const sourcePlaceholder =
                typeof question.placeholder === 'object'
                    ? question.placeholder[sourceLang] || ''
                    : question.placeholder || '';

            newQuestion.placeholder =
                typeof question.placeholder === 'object'
                    ? { ...question.placeholder, [activeLocale]: sourcePlaceholder }
                    : { en: question.placeholder || '', [activeLocale]: sourcePlaceholder };
        }

        // Copy options
        if (question.options) {
            newQuestion.options = question.options.map((opt) => {
                if (typeof opt === 'string') {
                    return {
                        label: { en: opt, [activeLocale]: opt },
                        value: opt,
                    };
                }
                const sourceOptLabel = opt.label[sourceLang] || '';
                return {
                    ...opt,
                    label: {
                        ...opt.label,
                        [activeLocale]: sourceOptLabel,
                    },
                };
            });
        }

        onUpdate(newQuestion);
        toast.success(t('admin.design.questions.actions.copy_success'));
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            data-testid="question-item"
            className={cn(
                'group relative bg-white border-none shadow-sm rounded-2xl overflow-hidden transition-all mb-4',
                isDragging && 'opacity-50 z-50 shadow-xl ring-2 ring-indigo-500/20',
                readOnly && 'opacity-80'
            )}
        >
            <div className="flex items-start p-4 gap-4">
                {!readOnly && !structureLocked && (
                    <div
                        {...attributes}
                        {...listeners}
                        className="mt-1 cursor-grab active:cursor-grabbing text-slate-300 hover:text-indigo-600 transition-colors p-1 hover:bg-indigo-50 rounded-lg"
                    >
                        <GripVertical className="h-5 w-5" />
                    </div>
                )}

                <div className="flex-1 min-w-0">
                    <Accordion type="single" collapsible className="w-full">
                        <AccordionItem value="item-1" className="border-none">
                            <div className="flex items-center justify-between w-full pr-2 gap-2">
                                <AccordionTrigger
                                    data-testid="question-accordion-trigger"
                                    className="flex-1 min-w-0 py-2 hover:no-underline px-2 hover:bg-slate-50/50 rounded-xl transition-all text-left overflow-hidden"
                                >
                                    <div className="flex items-center gap-3 w-full overflow-hidden">
                                        <div className="shrink-0 p-2 bg-slate-50 border border-slate-100 rounded-xl text-slate-600">
                                            {question.type === 'text' && (
                                                <Type className="h-4 w-4" />
                                            )}
                                            {question.type === 'number' && (
                                                <Hash className="h-4 w-4" />
                                            )}
                                            {question.type === 'select' && (
                                                <ListCircle className="h-4 w-4" />
                                            )}
                                            {question.type === 'checkbox' && (
                                                <CheckSquare className="h-4 w-4" />
                                            )}
                                            {question.type === 'radio' && (
                                                <Circle className="h-4 w-4" />
                                            )}
                                            {question.type === 'date' && (
                                                <Calendar className="h-4 w-4" />
                                            )}
                                            {question.type === 'email' && (
                                                <Mail className="h-4 w-4" />
                                            )}
                                            {question.type === 'textarea' && (
                                                <AlignLeft className="h-4 w-4" />
                                            )}
                                            {question.type === 'text_audio' && (
                                                <Mic className="h-4 w-4" />
                                            )}
                                        </div>
                                        <span className="text-sm font-bold text-slate-900 truncate tracking-tight">
                                            {label || (
                                                <span className="text-slate-400 italic font-medium">
                                                    {t('admin.design.questions.defaults.untitled')}
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                </AccordionTrigger>
                                {!readOnly && !structureLocked && (
                                    <div className="flex items-center gap-2 shrink-0">
                                        {!readOnly && availableLanguages.length > 1 && (
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-9 w-9 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <Languages className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-56">
                                                    <div className="px-2 py-1.5 text-2xs font-black text-slate-400">
                                                        {t(
                                                            'admin.design.questions.actions.copy_from'
                                                        )}
                                                    </div>
                                                    {availableLanguages
                                                        .filter((l) => l !== activeLocale)
                                                        .map((lang) => (
                                                            <DropdownMenuItem
                                                                key={lang}
                                                                onClick={() => handleCopyFrom(lang)}
                                                                className="flex items-center gap-2 cursor-pointer font-bold text-slate-700"
                                                            >
                                                                <div className="size-2 rounded-full bg-indigo-400" />
                                                                {lang.toUpperCase()}
                                                            </DropdownMenuItem>
                                                        ))}
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        )}
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-9 w-9 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onDelete();
                                            }}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                )}
                            </div>

                            <AccordionContent className="pt-6 pb-2 space-y-6">
                                <div className="grid gap-2.5">
                                    <div className="flex items-center gap-2">
                                        <Label className="text-2xs font-black text-slate-500">
                                            {t('admin.design.questions.labels.question')}
                                        </Label>
                                        <MultiLangFieldIcon
                                            activeLocale={activeLocale}
                                            translations={
                                                typeof question.label === 'object'
                                                    ? question.label
                                                    : { en: question.label || '' }
                                            }
                                        />
                                    </div>
                                    <Input
                                        value={label}
                                        readOnly={readOnly}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                            handleLabelChange(e.target.value)
                                        }
                                        placeholder={t('admin.design.questions.labels.placeholder')}
                                        className={cn(
                                            'font-bold text-sm h-11 rounded-xl bg-slate-50/30',
                                            readOnly && 'cursor-not-allowed opacity-70'
                                        )}
                                    />
                                </div>

                                <div className="flex items-center justify-between py-4 border-t border-slate-100">
                                    <div className="flex items-center gap-3">
                                        <Switch
                                            id={`req-${id}`}
                                            disabled={readOnly}
                                            checked={question.required}
                                            onCheckedChange={(checked: boolean) =>
                                                onUpdate({ ...question, required: checked })
                                            }
                                        />
                                        <Label
                                            htmlFor={`req-${id}`}
                                            className="text-xs font-bold text-slate-700 cursor-pointer"
                                        >
                                            {t('admin.design.questions.labels.required')}
                                        </Label>
                                    </div>

                                    <div
                                        data-testid="question-type-label"
                                        className="text-2xs text-slate-400 font-black bg-slate-50 px-2 py-1 rounded-lg"
                                    >
                                        {question.type}
                                    </div>
                                </div>

                                {availableQuestions.length > 0 && (
                                    <div className="space-y-4 pt-4 border-t border-slate-100">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <GitBranch className="h-3.5 w-3.5 text-indigo-500" />
                                                <Label className="text-2xs font-black text-slate-500">
                                                    {t('admin.design.questions.logic.title')}
                                                </Label>
                                            </div>
                                            {!readOnly && (
                                                <Switch
                                                    checked={!!question.visibility_condition}
                                                    onCheckedChange={(checked) => {
                                                        if (checked) {
                                                            onUpdate({
                                                                ...question,
                                                                visibility_condition: {
                                                                    depends_on:
                                                                        availableQuestions[0]?.id ||
                                                                        '',
                                                                    operator: 'equals',
                                                                    value: '',
                                                                },
                                                            });
                                                        } else {
                                                            const {
                                                                visibility_condition: _,
                                                                ...rest
                                                            } = question;
                                                            onUpdate(rest);
                                                        }
                                                    }}
                                                />
                                            )}
                                        </div>

                                        {question.visibility_condition && (
                                            <div className="grid gap-4 p-4 bg-slate-50/50 rounded-xl border border-slate-100">
                                                <div className="space-y-2">
                                                    <Label className="text-2xs font-bold text-slate-500">
                                                        {t(
                                                            'admin.design.questions.logic.depends_on'
                                                        )}
                                                    </Label>
                                                    <Select
                                                        value={
                                                            question.visibility_condition.depends_on
                                                        }
                                                        onValueChange={(val) =>
                                                            onUpdate({
                                                                ...question,
                                                                visibility_condition:
                                                                    question.visibility_condition
                                                                        ? {
                                                                              ...question.visibility_condition,
                                                                              depends_on: val,
                                                                          }
                                                                        : undefined,
                                                            })
                                                        }
                                                    >
                                                        <SelectTrigger className="bg-white rounded-lg h-9 text-xs">
                                                            <SelectValue
                                                                placeholder={t(
                                                                    'admin.design.questions.logic.select_placeholder'
                                                                )}
                                                            />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {availableQuestions.map((aq) => {
                                                                const aqLabel =
                                                                    typeof aq.label === 'string'
                                                                        ? aq.label
                                                                        : aq.label[activeLocale] ||
                                                                          aq.label.en ||
                                                                          aq.id;
                                                                return (
                                                                    <SelectItem
                                                                        key={aq.id}
                                                                        value={aq.id}
                                                                    >
                                                                        {aqLabel}
                                                                    </SelectItem>
                                                                );
                                                            })}
                                                        </SelectContent>
                                                    </Select>
                                                </div>

                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-2">
                                                        <Label className="text-2xs font-bold text-slate-500">
                                                            {t(
                                                                'admin.design.questions.logic.operator'
                                                            )}
                                                        </Label>
                                                        <Select
                                                            value={
                                                                question.visibility_condition
                                                                    .operator
                                                            }
                                                            onValueChange={(
                                                                val:
                                                                    | 'equals'
                                                                    | 'not_equals'
                                                                    | 'contains'
                                                                    | 'greater_than'
                                                                    | 'less_than'
                                                            ) =>
                                                                onUpdate({
                                                                    ...question,
                                                                    visibility_condition:
                                                                        question.visibility_condition
                                                                            ? {
                                                                                  ...question.visibility_condition,
                                                                                  operator: val,
                                                                              }
                                                                            : undefined,
                                                                })
                                                            }
                                                        >
                                                            <SelectTrigger className="bg-white rounded-lg h-9 text-xs">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {[
                                                                    'equals',
                                                                    'not_equals',
                                                                    'contains',
                                                                    'greater_than',
                                                                    'less_than',
                                                                ].map((op) => (
                                                                    <SelectItem key={op} value={op}>
                                                                        {t(
                                                                            `admin.design.questions.logic.operators.${op}`
                                                                        )}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>

                                                    <div className="space-y-2">
                                                        <Label className="text-2xs font-bold text-slate-500">
                                                            {t(
                                                                'admin.design.questions.logic.value'
                                                            )}
                                                        </Label>
                                                        <Input
                                                            value={
                                                                (question.visibility_condition
                                                                    .value as string) || ''
                                                            }
                                                            onChange={(e) =>
                                                                onUpdate({
                                                                    ...question,
                                                                    visibility_condition:
                                                                        question.visibility_condition
                                                                            ? {
                                                                                  ...question.visibility_condition,
                                                                                  value: e.target
                                                                                      .value,
                                                                              }
                                                                            : undefined,
                                                                })
                                                            }
                                                            className="bg-white rounded-lg h-9 text-xs"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {(question.type === 'select' ||
                                    question.type === 'radio' ||
                                    question.type === 'checkbox') && (
                                    <div className="space-y-4 pt-4 border-t border-slate-100">
                                        <Label className="text-2xs font-black text-slate-500">
                                            {t('admin.design.questions.labels.options')}
                                            {question.type === 'checkbox' &&
                                                ` (${t('admin.design.questions.labels.multiple')})`}
                                            {question.type === 'radio' &&
                                                ` (${t('admin.design.questions.labels.single')})`}
                                        </Label>
                                        <div className="space-y-3">
                                            {(question.options || []).map((opt, idx) => (
                                                <div
                                                    key={idx}
                                                    className="flex gap-3 items-center group/opt"
                                                >
                                                    <div className="size-1.5 rounded-full bg-slate-300 group-hover/opt:bg-indigo-400 transition-colors" />
                                                    <div className="flex-1 flex items-center gap-2">
                                                        <Input
                                                            className={cn(
                                                                'h-10 text-sm font-medium rounded-xl border-slate-200 focus:border-indigo-500 transition-all bg-white',
                                                                readOnly &&
                                                                    'cursor-not-allowed opacity-70'
                                                            )}
                                                            value={
                                                                typeof opt === 'string'
                                                                    ? opt
                                                                    : opt.label?.[activeLocale] ||
                                                                      opt.label?.en ||
                                                                      ''
                                                            }
                                                            readOnly={readOnly}
                                                            onChange={(
                                                                e: React.ChangeEvent<HTMLInputElement>
                                                            ) => {
                                                                if (readOnly) return;
                                                                const newOpts = [
                                                                    ...(question.options || []),
                                                                ];
                                                                if (typeof opt === 'string') {
                                                                    // Convert to dictionary format to avoid syncing across languages
                                                                    newOpts[idx] = {
                                                                        label: {
                                                                            en: opt,
                                                                            [activeLocale]:
                                                                                e.target.value,
                                                                        },
                                                                        value: opt, // Preserve original value
                                                                    };
                                                                } else {
                                                                    newOpts[idx] = {
                                                                        ...opt,
                                                                        label: {
                                                                            ...opt.label,
                                                                            [activeLocale]:
                                                                                e.target.value,
                                                                        },
                                                                        value:
                                                                            opt.value ||
                                                                            e.target.value,
                                                                    };
                                                                }
                                                                onUpdate({
                                                                    ...question,
                                                                    options: newOpts,
                                                                });
                                                            }}
                                                        />
                                                        {typeof opt !== 'string' && (
                                                            <MultiLangFieldIcon
                                                                activeLocale={activeLocale}
                                                                translations={opt.label}
                                                            />
                                                        )}
                                                    </div>
                                                    {!readOnly && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-10 w-10 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all border border-transparent hover:border-red-100"
                                                            onClick={() => {
                                                                const newOpts =
                                                                    question.options?.filter(
                                                                        (_, i: number) => i !== idx
                                                                    );
                                                                onUpdate({
                                                                    ...question,
                                                                    options: newOpts,
                                                                } as QuestionConfig);
                                                            }}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                </div>
                                            ))}
                                            {!readOnly && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="w-full h-11 border-dashed border-2 rounded-xl text-slate-500 hover:text-indigo-600 hover:border-indigo-500 hover:bg-indigo-50/30 transition-all font-bold"
                                                    onClick={() => {
                                                        const newOpts = [
                                                            ...(question.options || []),
                                                            t(
                                                                'admin.design.questions.defaults.option',
                                                                { lng: activeLocale }
                                                            ),
                                                        ];
                                                        onUpdate({ ...question, options: newOpts });
                                                    }}
                                                >
                                                    <PlusCircle className="h-4 w-4 mr-2" />
                                                    {t('admin.design.questions.actions.add_option')}
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                </div>
            </div>
        </div>
    );
};

interface QuestionBuilderProps {
    type: 'pre' | 'post';
    readOnly?: boolean;
    structureLocked?: boolean;
}

const QuestionBuilder = ({ type, readOnly, structureLocked }: QuestionBuilderProps) => {
    const { t } = useTranslation();
    const { draft, updateDraft, activeLocale } = useStudyDesigner();

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    if (!draft) return null;

    // For pre-sort, the config IS the question map (legacy) or has .fields (new)
    const getQuestionsMap = () => {
        if (type === 'pre') {
            const config = draft.presort_config || {};
            if ('fields' in config) return (config.fields as Record<string, QuestionConfig>) || {};
            // Legacy support for un-normalized state
            if (!('enabled' in config)) return config as Record<string, QuestionConfig>;
            return {};
        }
        // biome-ignore lint/suspicious/noExplicitAny: postsort structure
        return ((draft.postsort_config as any)?.questions as Record<string, QuestionConfig>) || {};
    };

    const isPresortEnabled =
        type !== 'pre' ||
        !draft.presort_config ||
        !('enabled' in draft.presort_config) ||
        draft.presort_config.enabled;

    const questions = Object.entries(getQuestionsMap()).map(([key, value]) => ({
        id: key,
        ...value,
    }));

    const handlePresortToggle = (checked: boolean) => {
        // biome-ignore lint/suspicious/noExplicitAny: dynamic draft update
        updateDraft((d: any) => {
            const currentConfig = d.presort_config || {};

            // If currently legacy (no enabled flag), migrate to new structure
            // biome-ignore lint/suspicious/noExplicitAny: migration config
            let newConfig: any;
            if (!('enabled' in currentConfig)) {
                newConfig = {
                    enabled: checked,
                    fields: currentConfig,
                };
            } else {
                newConfig = {
                    ...currentConfig,
                    enabled: checked,
                };
            }
            d.presort_config = newConfig;
        });
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = questions.findIndex((q) => q.id === active.id);
            const newIndex = questions.findIndex((q) => q.id === over.id);
            const newArray = arrayMove(questions, oldIndex, newIndex);

            // Reconstruct the dictionary based on the new array order
            // biome-ignore lint/suspicious/noExplicitAny: dynamic config
            const newQuestionsMap: Record<string, any> = {};
            newArray.forEach((q) => {
                const { id, ...rest } = q;
                newQuestionsMap[id] = rest;
            });

            updateDraft((d) => {
                if (type === 'pre') {
                    // Maintain enabled state if present
                    const currentConfig = d.presort_config || {};
                    if ('enabled' in currentConfig) {
                        d.presort_config = {
                            ...currentConfig,
                            fields: newQuestionsMap,
                        };
                    } else {
                        // Legacy
                        d.presort_config = newQuestionsMap;
                    }
                } else {
                    // biome-ignore lint/suspicious/noExplicitAny: postsort structure
                    const ps = d.postsort_config as any;
                    if (!ps) d.postsort_config = {};
                    // biome-ignore lint/suspicious/noExplicitAny: complex nested type
                    (d.postsort_config as any).questions = newQuestionsMap;
                }
            });
        }
    };

    const addQuestion = (qType: QuestionType) => {
        const id = `q_${Date.now()}`;
        const newQuestion: QuestionConfig = {
            type: qType,
            label: {
                [activeLocale]: t('admin.design.questions.defaults.new_question', {
                    lng: activeLocale,
                }),
            },
            required: false,
            options:
                qType === 'select' || qType === 'checkbox' || qType === 'radio'
                    ? [
                          {
                              label: {
                                  [activeLocale]: `${t('admin.design.questions.defaults.option', {
                                      lng: activeLocale,
                                  })} 1`,
                              },
                              value: 'opt_1',
                          },
                          {
                              label: {
                                  [activeLocale]: `${t('admin.design.questions.defaults.option', {
                                      lng: activeLocale,
                                  })} 2`,
                              },
                              value: 'opt_2',
                          },
                      ]
                    : undefined,
            placeholder: undefined,
            rows: qType === 'textarea' ? 4 : undefined,
        };

        // biome-ignore lint/suspicious/noExplicitAny: dynamic draft update
        updateDraft((d: any) => {
            if (type === 'pre') {
                if (!d.presort_config) d.presort_config = {};

                // Ensure structure
                if (!('enabled' in d.presort_config)) {
                    // Migrate to new structure if adding to legacy
                    d.presort_config = {
                        enabled: true,
                        fields: { ...d.presort_config, [id]: newQuestion },
                    };
                } else {
                    if (!d.presort_config.fields) d.presort_config.fields = {};
                    d.presort_config.fields[id] = newQuestion;
                    // Auto-enable if adding? Maybe not force it but usually yes.
                    d.presort_config.enabled = true;
                }
            } else {
                if (!d.postsort_config) d.postsort_config = {};
                if (!d.postsort_config.questions) d.postsort_config.questions = {};
                d.postsort_config.questions[id] = newQuestion;
            }
        });
    };

    return (
        <div className="space-y-10">
            {type === 'pre' && (
                <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                    <CardContent className="p-6 flex items-center justify-between">
                        <div className="space-y-1">
                            <Label className="text-base font-bold text-slate-900 tracking-tight">
                                {t('admin.design.questions.enable_presort')}
                            </Label>
                            <p className="text-sm font-medium text-slate-500">
                                {t('admin.design.questions.enable_presort_desc')}
                            </p>
                        </div>
                        <Switch
                            data-testid="presort-toggle"
                            checked={!!isPresortEnabled}
                            onCheckedChange={handlePresortToggle}
                            disabled={readOnly || structureLocked}
                        />
                    </CardContent>
                </Card>
            )}

            {/* Only show builder and questions if enabled (for pre-sort) or if it's post-sort */}
            {(type !== 'pre' || !!isPresortEnabled) && (
                <>
                    <div className="bg-slate-50/60 p-6 rounded-2xl border border-dashed border-slate-200 space-y-6">
                        {!readOnly && !structureLocked && (
                            <div className="flex items-center gap-2">
                                <PlusCircle className="size-4 text-indigo-500" />
                                <span className="text-sm font-bold text-slate-900 tracking-tight">
                                    {t('admin.design.questions.add_field')}
                                </span>
                            </div>
                        )}

                        {!readOnly && !structureLocked && (
                            <div className="space-y-4">
                                <div className="text-2xs font-black text-slate-400">
                                    {t('admin.design.questions.basic_fields')}
                                </div>
                                <div className="flex flex-wrap gap-3">
                                    {[
                                        { type: 'text', icon: Type, label: 'text' },
                                        { type: 'textarea', icon: AlignLeft, label: 'long_text' },
                                        { type: 'number', icon: Hash, label: 'number' },
                                        { type: 'date', icon: Calendar, label: 'date' },
                                        { type: 'email', icon: Mail, label: 'email' },
                                        { type: 'text_audio', icon: Mic, label: 'text_audio' },
                                    ].map((field) => (
                                        <Button
                                            key={field.type}
                                            data-testid={`add-question-${field.type}`}
                                            variant="outline"
                                            size="sm"
                                            onClick={() => addQuestion(field.type as QuestionType)}
                                            className="bg-white rounded-xl border-slate-200 hover:border-indigo-500 hover:text-indigo-600 hover:bg-indigo-50/30 transition-all font-bold h-10 px-4 shadow-sm active:scale-95"
                                        >
                                            <field.icon className="h-4 w-4 mr-2 text-slate-400 group-hover:text-indigo-500" />
                                            {t(`admin.design.questions.types.${field.label}`)}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {!readOnly && !structureLocked && (
                            <div className="space-y-4">
                                <div className="text-2xs font-black text-slate-400">
                                    {t('admin.design.questions.choice_fields')}
                                </div>
                                <div className="flex flex-wrap gap-3">
                                    {[
                                        { type: 'select', icon: ListCircle, label: 'dropdown' },
                                        { type: 'radio', icon: Circle, label: 'radio' },
                                        {
                                            type: 'checkbox',
                                            icon: CheckSquare,
                                            label: 'checkboxes',
                                        },
                                    ].map((field) => (
                                        <Button
                                            key={field.type}
                                            data-testid={`add-question-${field.type}`}
                                            variant="outline"
                                            size="sm"
                                            onClick={() => addQuestion(field.type as QuestionType)}
                                            className="bg-white rounded-xl border-slate-200 hover:border-indigo-500 hover:text-indigo-600 hover:bg-indigo-50/30 transition-all font-bold h-10 px-4 shadow-sm active:scale-95"
                                        >
                                            <field.icon className="h-4 w-4 mr-2 text-slate-400 group-hover:text-indigo-500" />
                                            {t(`admin.design.questions.types.${field.label}`)}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={questions.map((q) => q.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            {questions.length === 0 ? (
                                <div className="py-16 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/30 transition-all hover:bg-slate-50/50">
                                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 mb-6">
                                        <Plus className="h-8 w-8 text-slate-300" />
                                    </div>
                                    <p className="text-base font-bold text-slate-900 tracking-tight">
                                        {t('admin.design.questions.empty.title')}
                                    </p>
                                    <p className="text-sm font-medium text-slate-500 mt-2 max-w-[280px] text-center leading-relaxed">
                                        {t('admin.design.questions.empty.desc')}
                                    </p>
                                </div>
                            ) : (
                                <div className="flex flex-col">
                                    {questions.map((q, index) => (
                                        <QuestionItem
                                            key={q.id}
                                            id={q.id}
                                            question={q}
                                            activeLocale={activeLocale}
                                            readOnly={readOnly}
                                            structureLocked={structureLocked}
                                            availableQuestions={questions.slice(0, index)}
                                            availableLanguages={
                                                draft?.translations?.map((t) => t.language_code) ||
                                                []
                                            }
                                            onUpdate={(data: QuestionConfig) => {
                                                // biome-ignore lint/suspicious/noExplicitAny: dynamic draft update
                                                updateDraft((d: any) => {
                                                    if (type === 'pre') {
                                                        // Handle both legacy and new structure
                                                        if (
                                                            d.presort_config &&
                                                            'enabled' in d.presort_config
                                                        ) {
                                                            if (!d.presort_config.fields)
                                                                d.presort_config.fields = {};
                                                            d.presort_config.fields[q.id] = data;
                                                        } else {
                                                            // Legacy structure
                                                            d.presort_config[q.id] = data;
                                                        }
                                                    } else {
                                                        d.postsort_config.questions[q.id] = data;
                                                    }
                                                });
                                            }}
                                            onDelete={() => {
                                                // biome-ignore lint/suspicious/noExplicitAny: dynamic draft update
                                                updateDraft((d: any) => {
                                                    if (type === 'pre') {
                                                        // Handle both legacy and new structure
                                                        if (
                                                            d.presort_config &&
                                                            'enabled' in d.presort_config
                                                        ) {
                                                            if (d.presort_config.fields) {
                                                                delete d.presort_config.fields[
                                                                    q.id
                                                                ];
                                                            }
                                                        } else {
                                                            // Legacy structure
                                                            delete d.presort_config[q.id];
                                                        }
                                                    } else {
                                                        delete d.postsort_config.questions[q.id];
                                                    }
                                                });
                                            }}
                                        />
                                    ))}
                                </div>
                            )}
                        </SortableContext>
                    </DndContext>
                </>
            )}
        </div>
    );
};

export default QuestionBuilder;
