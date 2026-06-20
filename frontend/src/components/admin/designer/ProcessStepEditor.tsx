import type React from 'react';
import { useEffect, useMemo } from 'react';
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
import { EmptyState } from '@/components/ui/empty-state';
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
import { RotateCcw } from 'lucide-react';
import { createResetToDefaultHandler } from '@/utils/studyResetHelpers';
interface ProcessStepItemProps {
    id: string;
    step: ProcessStep;
    onUpdate: (data: ProcessStep) => void;
    onDelete: () => void;
    readOnly?: boolean;
}

const ProcessStepItem = ({ id, step, onUpdate, onDelete, readOnly }: ProcessStepItemProps) => {
    const { t } = useTranslation();
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id,
        disabled: readOnly,
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    // Dynamically get the icon component
    const IconComponent =
        (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[
            step.icon
        ] ?? LucideIcons.HelpCircle;

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
                {!readOnly && (
                    <div
                        {...attributes}
                        {...listeners}
                        className="mt-2.5 cursor-grab active:cursor-grabbing text-slate-300 hover:text-indigo-500 transition-colors"
                    >
                        <GripVertical className="h-4 w-4" />
                    </div>
                )}

                <div className="flex-1 min-w-0">
                    <Accordion type="single" collapsible className="w-full">
                        <AccordionItem value="item-1" className="border-none">
                            <div className="flex items-center justify-between w-full pr-2">
                                <div className="flex items-center gap-4 overflow-hidden flex-1">
                                    <div className="p-2 bg-indigo-50 rounded-xl border border-indigo-100 shadow-sm transition-colors group-hover:bg-white group-hover:border-indigo-200 shrink-0">
                                        <IconComponent className="h-4 w-4 text-indigo-600" />
                                    </div>
                                    {/* Wave B — show step title + 1-line description preview when
                                        collapsed so the user can identify content without expanding
                                        each row. Description is truncated; full edit happens inside. */}
                                    <div className="flex flex-col min-w-0 text-left">
                                        <span className="text-sm font-bold text-slate-700 truncate tracking-tight">
                                            {step.title || (
                                                <span className="text-slate-400 font-medium italic">
                                                    {t(
                                                        'admin.design.intro.process_steps.defaults.new_step'
                                                    )}
                                                </span>
                                            )}
                                        </span>
                                        {step.description && (
                                            <span className="text-xs text-slate-400 font-medium truncate mt-0.5">
                                                {step.description}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                    <AccordionTrigger className="py-2 hover:no-underline text-slate-400 hover:text-indigo-600">
                                        <span className="sr-only">
                                            {t('admin.design.intro.process_steps.fields.toggle')}
                                        </span>
                                    </AccordionTrigger>
                                    {!readOnly && (
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
                                    )}
                                </div>
                            </div>

                            <AccordionContent className="pt-6 pb-2 px-1 space-y-6">
                                <div className="grid gap-6 sm:grid-cols-2">
                                    <div className="space-y-6">
                                        <div className="grid gap-2">
                                            <Label className="text-2xs font-black text-slate-500">
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
                                                disabled={readOnly}
                                            />
                                        </div>

                                        <div className="grid gap-2">
                                            <Label className="text-2xs font-black text-slate-500">
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
                                                disabled={readOnly}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-6">
                                        <div className="grid gap-2">
                                            <Label className="text-2xs font-black text-slate-500">
                                                {t('admin.design.intro.process_steps.fields.icon')}
                                            </Label>
                                            <IconPicker
                                                selectedIcon={step.icon}
                                                onChange={(icon) => onUpdate({ ...step, icon })}
                                                disabled={readOnly}
                                            />
                                        </div>

                                        <div className="grid gap-2">
                                            <Label className="text-2xs font-black text-slate-500">
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
                                                        disabled={readOnly}
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
                                                    readOnly={readOnly}
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

interface ProcessStepEditorProps {
    readOnly?: boolean;
    /**
     * Override for the rough-sort feature flag. When omitted, the value is
     * derived from the current draft (`draft.rough_sort_enabled !== false`).
     * Mirrors {@link isRoughSortEnabled} in `utils/studyConfig.ts`.
     */
    roughSortEnabled?: boolean;
    /**
     * Override for the presort feature flag. When omitted, the value is
     * derived from the current draft (`draft.presort_config.enabled !== false`).
     * Mirrors {@link isPresortEnabled} in `utils/studyConfig.ts`.
     */
    presortEnabled?: boolean;
}

export function ProcessStepEditor({
    readOnly,
    roughSortEnabled: roughSortEnabledProp,
    presortEnabled: presortEnabledProp,
}: ProcessStepEditorProps) {
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
            t.process_steps?.forEach((s) => {
                allIds.add(s.id);
            });
        });

        const someMismatch = draft.translations.some((t) => {
            const tIds = t.process_steps?.map((s) => s.id) || [];
            return tIds.length !== allIds.size || tIds.some((id: string) => !allIds.has(id));
        });

        if (someMismatch) {
            // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: P5 — translation-array sync useEffect bound by missing process_steps schema typing on StudyTranslation; the (t as any).process_steps casts (8 sites in this block) make extraction unsafe until the typing gap is fixed (see W2-end backlog review)
            updateDraft((d) => {
                // We use the first translation that has steps as the master order
                const masterTranslation = d.translations?.find(
                    (t) => (t.process_steps?.length ?? 0) > 0
                );
                const masterSteps = masterTranslation?.process_steps || [];

                for (const t of d.translations || []) {
                    if (!t.process_steps) t.process_steps = [];
                    const tSteps = t.process_steps;

                    // Add missing steps
                    for (const mStep of masterSteps) {
                        if (!tSteps.find((ts) => ts.id === mStep.id)) {
                            tSteps.push({
                                ...mStep,
                                title: '',
                                description: '',
                            });
                        }
                    }
                    // Remove extra steps (if any)
                    const masterIds = new Set(masterSteps.map((ms) => ms.id));
                    t.process_steps = tSteps.filter((ts) => masterIds.has(ts.id));
                }
            });
        }
    }, [draft?.translations]);

    const translation = draft?.translations?.find((t) => t.language_code === activeLocale);
    const steps = translation?.process_steps || [];

    // Derive feature flags from the draft when no explicit override is passed.
    // Mirrors `isRoughSortEnabled` / `isPresortEnabled` in `utils/studyConfig.ts`
    // and the participant-side filter in `WelcomePage.tsx`.
    const roughSortEnabled = roughSortEnabledProp ?? draft?.rough_sort_enabled !== false;
    const presortEnabled =
        presortEnabledProp ??
        (() => {
            const cfg = draft?.presort_config as { enabled?: boolean } | null | undefined;
            if (!cfg) return true;
            if ('enabled' in cfg) return cfg.enabled !== false;
            return true;
        })();

    // Detect process_steps entries that contradict the study's enabled features.
    // The participant-side filter in WelcomePage drops these silently — we surface
    // them here so the admin notices and can clean up their step list.
    const inconsistentEntries = useMemo<
        {
            index: number;
            id: string;
            title: string;
            reason: 'rough_disabled' | 'presort_disabled';
        }[]
    >(() => {
        const issues: {
            index: number;
            id: string;
            title: string;
            reason: 'rough_disabled' | 'presort_disabled';
        }[] = [];
        steps.forEach((step, index) => {
            if (step.id === 'rough' && !roughSortEnabled) {
                issues.push({
                    index,
                    id: step.id,
                    title: step.title || step.id,
                    reason: 'rough_disabled',
                });
            }
            if (step.id === 'profile' && !presortEnabled) {
                issues.push({
                    index,
                    id: step.id,
                    title: step.title || step.id,
                    reason: 'presort_disabled',
                });
            }
        });
        return issues;
    }, [steps, roughSortEnabled, presortEnabled]);

    if (!draft) return null;

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
                    // Sync non-translatable fields (id, icon) into NON-active locales
                    // by stable id, not the active-locale index: once a locale's step
                    // order diverges (a reorder, or a locale seeded in default order),
                    // a shared index writes onto the wrong step and silently corrupts
                    // the multi-language config (audit D2).
                    const target = translation.process_steps.find((s) => s.id === data.id);
                    if (target) {
                        target.id = data.id;
                        target.icon = data.icon;
                    } else {
                        // The structural-sync effect normally seeds every locale; this
                        // is a defensive fallback if a step is missing in this locale.
                        translation.process_steps.push({
                            ...data,
                            title: '',
                            description: '',
                        });
                    }
                }
            });
        });
    };

    const deleteStep = (index: number) => {
        // Capture the target's stable id from the active locale BEFORE mutating,
        // then delete it by id in every locale. Splicing by the active-locale index
        // would remove the wrong step from locales whose order diverged (audit D2).
        const targetId = steps[index]?.id;
        if (targetId === undefined) return;
        updateDraft((d) => {
            d.translations?.forEach((translation) => {
                if (!translation.process_steps) return;
                const targetIdx = translation.process_steps.findIndex((s) => s.id === targetId);
                if (targetIdx !== -1) {
                    translation.process_steps.splice(targetIdx, 1);
                }
            });
        });
    };

    const resetSteps = () => {
        const handler = createResetToDefaultHandler(updateDraft, t, {
            requireConfirmation: true,
            confirmMessage: t('admin.design.intro.process_steps.reset.process_steps_confirm'),
        });
        handler('process_steps');
    };

    return (
        <div className="space-y-6">
            {!readOnly && inconsistentEntries.length > 0 && (
                <div
                    data-testid="process-steps-inconsistent-banner"
                    className="rounded border-l-4 border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 space-y-2"
                >
                    <p className="font-bold">
                        {t(
                            'admin.design.intro.process_steps.inconsistent.banner_title',
                            'Inconsistent process steps'
                        )}
                    </p>
                    <ul className="space-y-2">
                        {inconsistentEntries.map((entry) => (
                            <li
                                key={entry.id}
                                data-testid="process-steps-inconsistent-item"
                                className="flex items-start justify-between gap-3"
                            >
                                <span className="flex-1">
                                    {entry.reason === 'rough_disabled'
                                        ? t(
                                              'admin.design.intro.process_steps.inconsistent.rough_disabled',
                                              "The 'First impressions' (rough sort) step is in this list but the study has rough sort disabled. Participants will not see it."
                                          )
                                        : t(
                                              'admin.design.intro.process_steps.inconsistent.presort_disabled',
                                              "The 'Let's meet' (pre-sort survey) step is in this list but the study has the pre-sort survey disabled. Participants will not see it."
                                          )}
                                </span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => deleteStep(entry.index)}
                                    className="h-8 rounded-lg border-amber-300 bg-white px-3 text-xs font-bold text-amber-800 hover:bg-amber-100 hover:text-amber-900"
                                >
                                    {t(
                                        'admin.design.intro.process_steps.inconsistent.remove_action',
                                        'Remove'
                                    )}
                                </Button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {!readOnly && (
                <div className="flex items-center justify-end gap-3">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={resetSteps}
                        className="h-11 rounded-xl font-bold text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                    >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        {t('admin.design.intro.process_steps.reset.process_steps')}
                    </Button>
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
            )}

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
                        // Wave E.4 (E2 cleanup): migrated to <EmptyState>.
                        // Outer dashed-border wrapper retained for the visual
                        // "drop zone" affordance specific to this empty list.
                        <div className="border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/20 transition-all hover:bg-slate-50/40">
                            <EmptyState
                                icon={Plus}
                                title={t('admin.design.intro.process_steps.empty.title')}
                                body={t('admin.design.intro.process_steps.empty.desc')}
                                variant="inline"
                                headingLevel={3}
                            />
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
                                    readOnly={readOnly}
                                />
                            ))}
                        </div>
                    )}
                </SortableContext>
            </DndContext>
        </div>
    );
}
