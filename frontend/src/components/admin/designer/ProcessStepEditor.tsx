import { useEffect } from 'react';
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
                'group relative bg-white border-none shadow-sm rounded-2xl overflow-hidden transition-all mb-4',
                isDragging && 'opacity-50 z-50 shadow-xl ring-2 ring-indigo-500/20'
            )}
        >
            <div className="flex items-start p-4 gap-4">
                <div
                    {...attributes}
                    {...listeners}
                    className="mt-2.5 cursor-grab active:cursor-grabbing text-slate-300 hover:text-indigo-500 transition-colors"
                >
                    <GripVertical className="h-4 w-4" />
                </div>

                <div className="flex-1 min-w-0">
                    <Accordion type="single" collapsible className="w-full">
                        <AccordionItem value="item-1" className="border-none">
                            <div className="flex items-center justify-between w-full pr-2">
                                <div className="flex items-center gap-4 overflow-hidden">
                                    <div className="p-2 bg-indigo-50 rounded-xl border border-indigo-100 shadow-sm transition-colors group-hover:bg-white group-hover:border-indigo-200">
                                        <IconComponent className="h-4 w-4 text-indigo-600" />
                                    </div>
                                    <span className="text-sm font-bold text-slate-700 truncate tracking-tight">
                                        {step.title || (
                                            <span className="text-slate-400 font-medium italic">
                                                {t(
                                                    'admin.design.intro.process_steps.defaults.new_step'
                                                )}
                                            </span>
                                        )}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                    <AccordionTrigger className="py-2 hover:no-underline text-slate-400 hover:text-indigo-600">
                                        <span className="sr-only">Toggle</span>
                                    </AccordionTrigger>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-9 w-9 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all border border-transparent hover:border-red-100"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onDelete();
                                        }}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            <AccordionContent className="pt-6 pb-2 px-1 space-y-6">
                                <div className="grid gap-6 sm:grid-cols-2">
                                    <div className="space-y-6">
                                        <div className="grid gap-2">
                                            <Label className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                                                {t('admin.design.intro.process_steps.fields.title')}
                                            </Label>
                                            <Input
                                                value={step.title}
                                                className="h-11 rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white transition-all font-medium"
                                                onChange={(e) =>
                                                    onUpdate({ ...step, title: e.target.value })
                                                }
                                                placeholder={t(
                                                    'admin.design.intro.process_steps.fields.title'
                                                )}
                                            />
                                        </div>

                                        <div className="grid gap-2">
                                            <Label className="text-[10px] font-black uppercase tracking-wider text-slate-500">
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
                                                className="min-h-[100px] resize-none rounded-2xl border-slate-200 bg-slate-50/50 focus:bg-white transition-all font-medium leading-relaxed"
                                                placeholder={t(
                                                    'admin.design.intro.process_steps.fields.description'
                                                )}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-6">
                                        <div className="grid gap-2">
                                            <Label className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                                                {t('admin.design.intro.process_steps.fields.icon')}
                                            </Label>
                                            <IconPicker
                                                selectedIcon={step.icon}
                                                onChange={(icon) => onUpdate({ ...step, icon })}
                                            />
                                        </div>

                                        <div className="grid gap-2">
                                            <Label className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                                                {t(
                                                    'admin.design.intro.process_steps.fields.color',
                                                    'Color'
                                                )}
                                            </Label>
                                            <div className="flex items-center gap-3">
                                                <div className="relative group/color">
                                                    <Input
                                                        type="color"
                                                        value={step.color || '#3b82f6'}
                                                        onChange={(e) =>
                                                            onUpdate({
                                                                ...step,
                                                                color: e.target.value,
                                                            })
                                                        }
                                                        className="w-14 h-12 p-1.5 rounded-xl border-slate-200 cursor-pointer shadow-sm transition-all hover:border-indigo-500"
                                                    />
                                                </div>
                                                <Input
                                                    type="text"
                                                    value={step.color || ''}
                                                    onChange={(e) =>
                                                        onUpdate({ ...step, color: e.target.value })
                                                    }
                                                    placeholder="#000000"
                                                    className="font-mono text-xs h-12 rounded-xl border-slate-200 bg-slate-50/30 text-slate-500 focus:text-indigo-600 transition-all font-bold tracking-wider"
                                                />
                                            </div>
                                        </div>
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

    // Ensure structural consistency for process steps
    // biome-ignore lint/correctness/useExhaustiveDependencies: updateDraft stable
    useEffect(() => {
        if (!draft?.translations) return;

        const allIds = new Set<string>();
        draft.translations.forEach((t) => {
            // biome-ignore lint/suspicious/noExplicitAny: missing type definition for process_steps
            (t as any).process_steps?.forEach((s: any) => {
                allIds.add(s.id);
            });
        });

        const someMismatch = draft.translations.some((t) => {
            // biome-ignore lint/suspicious/noExplicitAny: missing type definition for process_steps
            const tIds = (t as any).process_steps?.map((s: any) => s.id) || [];
            return tIds.length !== allIds.size || tIds.some((id: string) => !allIds.has(id));
        });

        if (someMismatch) {
            updateDraft((d) => {
                // We use the first translation that has steps as the master order
                const masterTranslation = d.translations?.find(
                    // biome-ignore lint/suspicious/noExplicitAny: missing type
                    (t) => (t as any).process_steps?.length > 0
                );
                // biome-ignore lint/suspicious/noExplicitAny: missing type
                const masterSteps = (masterTranslation as any)?.process_steps || [];

                for (const t of d.translations || []) {
                    // biome-ignore lint/suspicious/noExplicitAny: missing type
                    if (!(t as any).process_steps) (t as any).process_steps = [];
                    // biome-ignore lint/suspicious/noExplicitAny: missing type
                    const tSteps = (t as any).process_steps;

                    // Add missing steps
                    for (const mStep of masterSteps) {
                        // biome-ignore lint/suspicious/noExplicitAny: explicit any needed for dynamic objects
                        if (!tSteps.find((ts: any) => ts.id === mStep.id)) {
                            tSteps.push({
                                ...mStep,
                                title: '',
                                description: '',
                            });
                        }
                    }
                    // Remove extra steps (if any)
                    // biome-ignore lint/suspicious/noExplicitAny: complex object manipulation
                    const masterIds = new Set(masterSteps.map((ms: any) => ms.id));
                    // biome-ignore lint/suspicious/noExplicitAny: complex object manipulation
                    (t as any).process_steps = tSteps.filter((ts: any) => masterIds.has(ts.id));
                }
            });
        }
    }, [draft?.translations]);

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
                        translation.process_steps[index] = {
                            ...data,
                            title: '',
                            description: '',
                        };
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
        <div className="space-y-6">
            <div className="flex items-center justify-end">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={addStep}
                    className="h-11 rounded-xl border-dashed border-2 px-6 font-bold text-slate-500 hover:text-indigo-600 hover:border-indigo-500 hover:bg-indigo-50/30 transition-all shadow-sm active:scale-95"
                >
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
                        <div className="py-16 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/20 transition-all hover:bg-slate-50/40">
                            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 mb-6">
                                <Plus className="h-8 w-8 text-slate-300" />
                            </div>
                            <p className="text-base font-bold text-slate-900 tracking-tight">
                                {t('admin.design.intro.process_steps.empty.title')}
                            </p>
                            <p className="text-sm font-medium text-slate-500 mt-2 max-w-[280px] text-center leading-relaxed">
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
