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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';
import { useStudyDesigner } from '@/store/useStudyDesigner';

interface QuestionConfig {
    type: QuestionType;
    label: string | Record<string, string>;
    required: boolean;
    options?: (string | { label: Record<string, string>; value: string })[];
}

interface QuestionItemProps {
    id: string;
    question: QuestionConfig;
    onUpdate: (data: QuestionConfig) => void;
    onDelete: () => void;
    activeLocale: string;
}

const QuestionItem = ({ id, question, onUpdate, onDelete, activeLocale }: QuestionItemProps) => {
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
                                    </div>
                                    <span className="text-sm font-medium truncate">
                                        {label || (
                                            <span className="text-muted-foreground italic">
                                                Untitled Question
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
                                    <Label className="text-xs">Question Label</Label>
                                    <Input
                                        value={label}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                            handleLabelChange(e.target.value)
                                        }
                                        placeholder="Enter your question here..."
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
                                            Required field
                                        </Label>
                                    </div>

                                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
                                        Type: {question.type}
                                    </div>
                                </div>

                                {question.type === 'select' && (
                                    <div className="space-y-3 pt-2 border-t border-dashed">
                                        <Label className="text-xs">Options</Label>
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
                                                            const newOpts = question.options.filter(
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
                                                        'New Option',
                                                    ];
                                                    onUpdate({ ...question, options: newOpts });
                                                }}
                                            >
                                                <PlusCircle className="h-3 w-3 mr-2" /> Add Option
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
    const { draft, updateDraft, activeLocale } = useStudyDesigner();

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    if (!draft) return null;

    const configKey = type === 'pre' ? 'presort_config' : 'postsort_config';

    // We assume the keys in the config represent the order, or we can use a helper array
    // Let's create an ordered array for the UI
    const questions = Object.entries(
        (draft[configKey] as Record<string, QuestionConfig>) || {}
    ).map(([key, value]) => ({
        id: key,
        ...value,
    }));

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = questions.findIndex((q) => q.id === active.id);
            const newIndex = questions.findIndex((q) => q.id === over.id);
            const newArray = arrayMove(questions, oldIndex, newIndex);

            // Reconstruct the dictionary based on the new array order
            // biome-ignore lint/suspicious/noExplicitAny: dynamic config
            const newConfig: Record<string, any> = {};
            newArray.forEach((q) => {
                const { id, ...rest } = q;
                newConfig[id] = rest;
            });

            updateDraft((d) => {
                const draftWithConfig = d as Record<string, unknown>;
                draftWithConfig[configKey] = newConfig;
            });
        }
    };

    const addQuestion = (qType: QuestionType) => {
        const id = `q_${Date.now()}`;
        const newQuestion = {
            type: qType === 'checkbox' ? 'select' : qType, // Mapping checkbox to select for now
            label: { [activeLocale]: 'New Question' },
            required: false,
            options:
                qType === 'select' || qType === 'checkbox' ? ['Option 1', 'Option 2'] : undefined,
        };

        // biome-ignore lint/suspicious/noExplicitAny: dynamic draft update
        updateDraft((d: any) => {
            // biome-ignore lint/suspicious/noExplicitAny: dynamic field check
            if (!(d as any)[configKey]) (d as any)[configKey] = {};
            // biome-ignore lint/suspicious/noExplicitAny: dynamic field access
            (d as any)[configKey][id] = newQuestion;
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between bg-muted/20 p-4 rounded-lg border border-dashed">
                <span className="text-sm font-medium text-muted-foreground">Add a new block</span>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => addQuestion('text')}
                        className="bg-background"
                    >
                        <Type className="h-4 w-4 mr-2" /> Text
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => addQuestion('number')}
                        className="bg-background"
                    >
                        <Hash className="h-4 w-4 mr-2" /> Number
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => addQuestion('select')}
                        className="bg-background"
                    >
                        <PlusCircle className="h-4 w-4 mr-2" /> Select
                    </Button>
                </div>
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
                        <div className="py-12 flex flex-col items-center justify-center border-2 border-dashed rounded-xl opacity-60">
                            <Plus className="h-12 w-12 text-muted-foreground mb-4" />
                            <p className="text-sm font-medium">No questions yet</p>
                            <p className="text-xs text-muted-foreground mt-1">
                                Click above to add your first question
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
                                            // biome-ignore lint/suspicious/noExplicitAny: dynamic field access
                                            (d as any)[configKey][q.id] = data;
                                        });
                                    }}
                                    onDelete={() => {
                                        // biome-ignore lint/suspicious/noExplicitAny: dynamic draft update
                                        updateDraft((d: any) => {
                                            // biome-ignore lint/suspicious/noExplicitAny: dynamic field deletion
                                            delete (d as any)[configKey][q.id];
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
