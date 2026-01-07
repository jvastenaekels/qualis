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
    Calendar,
    Mail,
    AlignLeft,
    Circle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';
import { useStudyDesigner } from '@/store/useStudyDesigner';
import { useTranslation } from 'react-i18next';

type QuestionType =
    | 'text'
    | 'number'
    | 'select'
    | 'checkbox'
    | 'date'
    | 'email'
    | 'textarea'
    | 'radio';

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
}

interface QuestionItemProps {
    id: string;
    question: QuestionConfig;
    onUpdate: (data: QuestionConfig) => void;
    onDelete: () => void;
    activeLocale: string;
}

const QuestionItem = ({ id, question, onUpdate, onDelete, activeLocale }: QuestionItemProps) => {
    const { t } = useTranslation();
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id,
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
        onUpdate({
            ...question,
            label:
                typeof question.label === 'string'
                    ? val
                    : { ...question.label, [activeLocale]: val },
        });
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                'group relative bg-background border rounded-lg shadow-sm transition-all mb-3',
                isDragging && 'opacity-50 z-50 shadow-xl border-primary/50'
            )}
        >
            <div className="flex items-start p-3 gap-3">
                <div
                    {...attributes}
                    {...listeners}
                    className="mt-2 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-primary transition-colors"
                >
                    <GripVertical className="h-4 w-4" />
                </div>

                <div className="flex-1 min-w-0">
                    <Accordion type="single" collapsible className="w-full">
                        <AccordionItem value="item-1" className="border-none">
                            <div className="flex items-center justify-between w-full pr-2">
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <div className="p-1.5 bg-muted rounded">
                                        {question.type === 'text' && <Type className="h-3 w-3" />}
                                        {question.type === 'number' && <Hash className="h-3 w-3" />}
                                        {question.type === 'select' && (
                                            <ListCircle className="h-3 w-3" />
                                        )}
                                        {question.type === 'checkbox' && (
                                            <CheckSquare className="h-3 w-3" />
                                        )}
                                        {question.type === 'radio' && (
                                            <Circle className="h-3 w-3" />
                                        )}
                                        {question.type === 'date' && (
                                            <Calendar className="h-3 w-3" />
                                        )}
                                        {question.type === 'email' && <Mail className="h-3 w-3" />}
                                        {question.type === 'textarea' && (
                                            <AlignLeft className="h-3 w-3" />
                                        )}
                                    </div>
                                    <span className="text-sm font-medium truncate">
                                        {label || (
                                            <span className="text-muted-foreground italic">
                                                {t('admin.design.questions.defaults.untitled')}
                                            </span>
                                        )}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <AccordionTrigger className="py-2 hover:no-underline">
                                        <span className="sr-only">Toggle</span>
                                    </AccordionTrigger>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onDelete();
                                        }}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            <AccordionContent className="pt-2 pb-4 px-1 space-y-4">
                                <div className="grid gap-2">
                                    <Label className="text-xs">
                                        {t('admin.design.questions.labels.question')}
                                    </Label>
                                    <Input
                                        value={label}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                            handleLabelChange(e.target.value)
                                        }
                                        placeholder={t('admin.design.questions.labels.placeholder')}
                                    />
                                </div>

                                <div className="flex items-center justify-between py-2 border-t border-dashed">
                                    <div className="flex items-center gap-2">
                                        <Switch
                                            id={`req-${id}`}
                                            checked={question.required}
                                            onCheckedChange={(checked: boolean) =>
                                                onUpdate({ ...question, required: checked })
                                            }
                                        />
                                        <Label
                                            htmlFor={`req-${id}`}
                                            className="text-xs cursor-pointer"
                                        >
                                            {t('admin.design.questions.labels.required')}
                                        </Label>
                                    </div>

                                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
                                        Type: {question.type}
                                    </div>
                                </div>

                                {(question.type === 'select' ||
                                    question.type === 'radio' ||
                                    question.type === 'checkbox') && (
                                    <div className="space-y-3 pt-2 border-t border-dashed">
                                        <Label className="text-xs">
                                            {t('admin.design.questions.labels.options')}
                                            {question.type === 'checkbox' &&
                                                ` ${t('admin.design.questions.labels.multiple')}`}
                                            {question.type === 'radio' &&
                                                ` ${t('admin.design.questions.labels.single')}`}
                                        </Label>
                                        <div className="space-y-2">
                                            {(question.options || []).map((opt, idx) => (
                                                <div
                                                    key={idx}
                                                    className="flex gap-2 items-center group/opt"
                                                >
                                                    <Input
                                                        className="h-8 text-sm"
                                                        value={
                                                            typeof opt === 'string'
                                                                ? opt
                                                                : opt.label?.[activeLocale] ||
                                                                  opt.label?.en ||
                                                                  ''
                                                        }
                                                        onChange={(
                                                            e: React.ChangeEvent<HTMLInputElement>
                                                        ) => {
                                                            const newOpts = [
                                                                ...(question.options || []),
                                                            ];
                                                            if (typeof opt === 'string') {
                                                                newOpts[idx] = e.target.value;
                                                            } else {
                                                                newOpts[idx] = {
                                                                    ...opt,
                                                                    label: {
                                                                        ...opt.label,
                                                                        [activeLocale]:
                                                                            e.target.value,
                                                                    },
                                                                    value:
                                                                        opt.value || e.target.value, // Fallback value
                                                                };
                                                            }
                                                            onUpdate({
                                                                ...question,
                                                                options: newOpts,
                                                            });
                                                        }}
                                                    />
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 opacity-0 group-hover/opt:opacity-100"
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
                                                        <Trash2 className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            ))}
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="w-full h-8 border-dashed"
                                                onClick={() => {
                                                    const newOpts = [
                                                        ...(question.options || []),
                                                        t('admin.design.questions.defaults.option'),
                                                    ];
                                                    onUpdate({ ...question, options: newOpts });
                                                }}
                                            >
                                                <PlusCircle className="h-3 w-3 mr-2" />{' '}
                                                {t('admin.design.questions.actions.add_option')}
                                            </Button>
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
}

const QuestionBuilder = ({ type }: QuestionBuilderProps) => {
    const { t } = useTranslation();
    const { draft, updateDraft, activeLocale } = useStudyDesigner();

    const sensors = useSensors(
        useSensor(PointerSensor),
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
            // Legacy check: if it has 'enabled' key but no fields? unlikely given schema.
            // If it's a record of fields (legacy):
            if (!('enabled' in config)) return config as Record<string, QuestionConfig>;
            return {};
        }
        // biome-ignore lint/suspicious/noExplicitAny: postsort structure
        return ((draft.postsort_config as any)?.questions as Record<string, QuestionConfig>) || {};
    };

    const isPresortEnabled =
        type === 'pre' &&
        (draft.presort_config && 'enabled' in draft.presort_config
            ? draft.presort_config.enabled
            : true);

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
            label: { [activeLocale]: t('admin.design.questions.defaults.new_question') },
            required: false,
            options:
                qType === 'select' || qType === 'checkbox' || qType === 'radio'
                    ? [
                          `${t('admin.design.questions.defaults.option')} 1`,
                          `${t('admin.design.questions.defaults.option')} 2`,
                      ]
                    : undefined,
            placeholder:
                qType === 'text' || qType === 'email' || qType === 'textarea'
                    ? { [activeLocale]: t('admin.design.questions.defaults.enter_answer') }
                    : undefined,
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
        <div className="space-y-6">
            {type === 'pre' && (
                <div className="bg-card p-4 rounded-lg border shadow-sm flex items-center justify-between">
                    <div className="space-y-0.5">
                        <Label className="text-base font-medium">
                            {t('admin.design.questions.enable_presort')}
                        </Label>
                        <p className="text-sm text-muted-foreground">
                            {t('admin.design.questions.enable_presort_desc')}
                        </p>
                    </div>
                    <Switch checked={!!isPresortEnabled} onCheckedChange={handlePresortToggle} />
                </div>
            )}

            {/* Only show builder if enabled (or if it's post-sort which we assume enabled or handled elsewhere? user request is about Pre-sort) */}
            {(type !== 'pre' || isPresortEnabled) && (
                <div className="bg-muted/20 p-4 rounded-lg border border-dashed space-y-3">
                    <span className="text-sm font-medium text-muted-foreground">
                        {t('admin.design.questions.add_field')}
                    </span>

                    <div className="space-y-2">
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            {t('admin.design.questions.basic_fields')}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => addQuestion('text')}
                                className="bg-background"
                            >
                                <Type className="h-3.5 w-3.5 mr-1.5" />{' '}
                                {t('admin.design.questions.types.text')}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => addQuestion('textarea')}
                                className="bg-background"
                            >
                                <AlignLeft className="h-3.5 w-3.5 mr-1.5" />{' '}
                                {t('admin.design.questions.types.long_text')}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => addQuestion('number')}
                                className="bg-background"
                            >
                                <Hash className="h-3.5 w-3.5 mr-1.5" />{' '}
                                {t('admin.design.questions.types.number')}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => addQuestion('date')}
                                className="bg-background"
                            >
                                <Calendar className="h-3.5 w-3.5 mr-1.5" />{' '}
                                {t('admin.design.questions.types.date')}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => addQuestion('email')}
                                className="bg-background"
                            >
                                <Mail className="h-3.5 w-3.5 mr-1.5" />{' '}
                                {t('admin.design.questions.types.email')}
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            {t('admin.design.questions.choice_fields')}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => addQuestion('select')}
                                className="bg-background"
                            >
                                <ListCircle className="h-3.5 w-3.5 mr-1.5" />{' '}
                                {t('admin.design.questions.types.dropdown')}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => addQuestion('radio')}
                                className="bg-background"
                            >
                                <Circle className="h-3.5 w-3.5 mr-1.5" />{' '}
                                {t('admin.design.questions.types.radio')}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => addQuestion('checkbox')}
                                className="bg-background"
                            >
                                <CheckSquare className="h-3.5 w-3.5 mr-1.5" />{' '}
                                {t('admin.design.questions.types.checkboxes')}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

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
                        <div className="py-12 flex flex-col items-center justify-center border-2 border-dashed rounded-xl opacity-60">
                            <Plus className="h-12 w-12 text-muted-foreground mb-4" />
                            <p className="text-sm font-medium">
                                {t('admin.design.questions.empty.title')}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                                {t('admin.design.questions.empty.desc')}
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col">
                            {questions.map((q) => (
                                <QuestionItem
                                    key={q.id}
                                    id={q.id}
                                    question={q}
                                    activeLocale={activeLocale}
                                    // biome-ignore lint/suspicious/noExplicitAny: dynamic question data
                                    onUpdate={(data: any) => {
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
                                                        delete d.presort_config.fields[q.id];
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
        </div>
    );
};

export default QuestionBuilder;
