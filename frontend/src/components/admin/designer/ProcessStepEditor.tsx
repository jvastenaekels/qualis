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
import { Textarea } from '@/components/ui/textarea';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';
import { useStudyDesigner } from '@/store/useStudyDesigner';
import { useTranslation } from 'react-i18next';
import { IconPicker } from './IconPicker';
import type { ProcessStep } from '@/api/model';
import * as LucideIcons from 'lucide-react';

interface ProcessStepItemProps {
    id: string;
    step: ProcessStep;
    onUpdate: (data: ProcessStep) => void;
    onDelete: () => void;
}

const ProcessStepItem = ({ id, step, onUpdate, onDelete }: ProcessStepItemProps) => {
    const { t } = useTranslation();
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id,
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    // Dynamically get the icon component
    // biome-ignore lint/suspicious/noExplicitAny: dynamic icon component
    const IconComponent = (LucideIcons as any)[step.icon] || LucideIcons.HelpCircle;

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
                                    <div className="p-1.5 bg-muted rounded text-primary">
                                        <IconComponent className="h-4 w-4" />
                                    </div>
                                    <span className="text-sm font-medium truncate">
                                        {step.title || (
                                            <span className="text-muted-foreground italic">
                                                {t(
                                                    'admin.design.intro.process_steps.defaults.new_step'
                                                )}
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
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-4">
                                        <div className="grid gap-2">
                                            <Label className="text-xs">
                                                {t('admin.design.intro.process_steps.fields.title')}
                                            </Label>
                                            <Input
                                                value={step.title}
                                                onChange={(e) =>
                                                    onUpdate({ ...step, title: e.target.value })
                                                }
                                                placeholder={t(
                                                    'admin.design.intro.process_steps.fields.title'
                                                )}
                                            />
                                        </div>

                                        <div className="grid gap-2">
                                            <Label className="text-xs">
                                                {t(
                                                    'admin.design.intro.process_steps.fields.description'
                                                )}
                                            </Label>
                                            <Textarea
                                                value={step.description}
                                                onChange={(e) =>
                                                    onUpdate({
                                                        ...step,
                                                        description: e.target.value,
                                                    })
                                                }
                                                className="min-h-[80px] resize-none"
                                                placeholder={t(
                                                    'admin.design.intro.process_steps.fields.description'
                                                )}
                                            />
                                        </div>
                                    </div>

                                    <div className="grid gap-2">
                                        <Label className="text-xs">
                                            {t('admin.design.intro.process_steps.fields.icon')}
                                        </Label>
                                        <IconPicker
                                            selectedIcon={step.icon}
                                            onChange={(icon) => onUpdate({ ...step, icon })}
                                        />
                                    </div>
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                </div>
            </div>
        </div>
    );
};

export function ProcessStepEditor() {
    const { t } = useTranslation();
    const {
        draft,
        activeLocale,
        updateDraft,
        updateTranslation: _updateTranslation,
    } = useStudyDesigner();

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    if (!draft) return null;

    const translation = draft.translations?.find((t) => t.language_code === activeLocale);
    const steps = translation?.process_steps || [];

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            updateDraft((d) => {
                d.translations?.forEach((translation) => {
                    const steps = translation.process_steps || [];
                    const oldIndex = steps.findIndex((s) => s.id === active.id);
                    const newIndex = steps.findIndex((s) => s.id === over.id);
                    if (oldIndex !== -1 && newIndex !== -1) {
                        translation.process_steps = arrayMove(steps, oldIndex, newIndex);
                    }
                });
            });
        }
    };

    const addStep = () => {
        const newId = `step_${Date.now()}`;
        updateDraft((d) => {
            d.translations?.forEach((translation) => {
                if (!translation.process_steps) translation.process_steps = [];
                translation.process_steps.push({
                    id: newId,
                    title: '', // Start empty for all, user will fill active locale
                    description: '',
                    icon: 'Circle',
                });
            });
        });
    };

    const updateStep = (index: number, data: ProcessStep) => {
        updateDraft((d) => {
            d.translations?.forEach((translation) => {
                if (!translation.process_steps) translation.process_steps = [];
                if (translation.language_code === activeLocale) {
                    translation.process_steps[index] = data;
                } else {
                    // Sync non-translatable fields (id, icon)
                    if (translation.process_steps[index]) {
                        translation.process_steps[index].id = data.id;
                        translation.process_steps[index].icon = data.icon;
                    } else {
                        // This should technically not happen if they are always synced
                        translation.process_steps[index] = { ...data, title: '', description: '' };
                    }
                }
            });
        });
    };

    const deleteStep = (index: number) => {
        updateDraft((d) => {
            d.translations?.forEach((translation) => {
                if (translation.process_steps) {
                    translation.process_steps.splice(index, 1);
                }
            });
        });
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-end">
                <Button variant="outline" size="sm" onClick={addStep}>
                    <Plus className="h-4 w-4 mr-2" />
                    {t('admin.design.intro.process_steps.add_step')}
                </Button>
            </div>

            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <SortableContext
                    items={steps.map((s) => s.id)}
                    strategy={verticalListSortingStrategy}
                >
                    {steps.length === 0 ? (
                        <div className="py-8 flex flex-col items-center justify-center border-2 border-dashed rounded-xl opacity-60 bg-muted/5">
                            <Plus className="h-8 w-8 text-muted-foreground mb-3" />
                            <p className="text-xs font-medium">
                                {t('admin.design.intro.process_steps.empty.title')}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-1 max-w-[200px] text-center">
                                {t('admin.design.intro.process_steps.empty.desc')}
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col">
                            {steps.map((step, index) => (
                                <ProcessStepItem
                                    key={step.id}
                                    id={step.id}
                                    step={step}
                                    onUpdate={(data) => updateStep(index, data)}
                                    onDelete={() => deleteStep(index)}
                                />
                            ))}
                        </div>
                    )}
                </SortableContext>
            </DndContext>
        </div>
    );
}
