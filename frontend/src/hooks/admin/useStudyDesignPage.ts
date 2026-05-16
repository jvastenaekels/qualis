/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * useStudyDesignPage hook
 *
 * Encapsulates the durable state-and-effect logic for the Study Design admin
 * page. StudyDesignPage receives this hook's return value and renders JSX
 * from it.
 *
 * Visual-only state that stays in the component (tightly coupled to a DOM
 * ref):
 * - tabsListRef + showLeftArrow / showRightArrow chevrons
 * - checkScroll / scrollTabs (operate on the ref directly)
 *
 * Logic that moves here:
 * - Route param parsing → effectiveSlug
 * - Study fetch + initialization (defaults, draft/original sync)
 * - Persistence orchestration via useStudyPersistence
 * - Ctrl+S / Cmd+S keyboard shortcut
 * - Language manager modal state
 * - Activation, switch-to-draft and test-run flows
 * - Validation / readiness derived data (checklist, tabs, languages)
 * - Step navigation (next/prev step lookup)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TFunction } from 'i18next';
import type { NavigateFunction } from 'react-router-dom';
import type { Blocker } from 'react-router-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import type {
    ParticipantRead,
    StudyRead,
    StudyTranslationCreate,
    StudyTranslationRead,
    StudyUpdate,
} from '@/api/model';
import {
    useGetStudyApiAdminStudiesSlugGet,
    useListStudyParticipantsApiAdminStudiesSlugParticipantsGet,
} from '@/api/generated';
import { customInstance } from '@/api/mutator';
import { areStudiesEqual, projectStudyToUpdate, useStudyDesigner } from '@/store/useStudyDesigner';
import { DEFAULT_STUDY_CONTENT } from '@/constants/studyDefaults';
import { useStudyPersistence } from '@/hooks/useStudyPersistence';
import { useRoughSortLock } from './useRoughSortLock';

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

export type DesignStepId =
    | 'intro'
    | 'pre-sort'
    | 'condition'
    | 'q-sort'
    | 'post-sort'
    | 'interface'
    | 'branding';

export interface DesignStep {
    id: DesignStepId;
    label: string;
}

export interface ChecklistItem {
    label: string;
    isComplete: boolean;
    required: boolean;
}

export interface LanguageReadiness {
    code: string;
    isReady: boolean;
}

export const DESIGN_STEPS: readonly DesignStep[] = [
    { id: 'intro', label: 'General' },
    { id: 'pre-sort', label: 'Presort' },
    { id: 'condition', label: 'Instruction' },
    { id: 'q-sort', label: 'Grid & Q-Set' },
    { id: 'post-sort', label: 'Post-sort' },
    { id: 'branding', label: 'Branding' },
    { id: 'interface', label: 'Interface' },
] as const;

export interface StudyDesignPageApi {
    // Route / navigation
    effectiveSlug: string;
    projectSlug: string | undefined;
    navigate: NavigateFunction;

    // Loading / fetching
    isLoading: boolean;
    study: StudyRead | undefined;

    // Store-derived state
    draft: StudyUpdate | null;
    original: StudyRead | null;
    activeStep: DesignStepId;
    activeLocale: string;
    syncStatus: 'synced' | 'saving' | 'error' | 'modified';
    setActiveStep: (step: DesignStepId) => void;
    setActiveLocale: (locale: string) => void;

    // Persistence
    save: () => Promise<void>;
    blocker: Blocker;

    // Permission / lock states
    isDirty: boolean;
    isFullyReadOnly: boolean;
    isStructureLocked: boolean;

    // Grid validation
    statementsCount: number;
    gridCapacity: number;
    isGridValid: boolean;

    // Per-tab validation
    isIntroValid: boolean;
    isConditionValid: boolean;
    isQSortValid: boolean;

    // Readiness
    checklist: ChecklistItem[];
    languageReadiness: LanguageReadiness[];
    isLaunchReady: boolean;

    // Step navigation
    designSteps: readonly DesignStep[];
    nextStep: DesignStep | undefined;
    prevStep: DesignStep | undefined;

    // Translation lookup
    currentTranslation: StudyTranslationRead | undefined;
    activeLanguageCodes: string[];

    // Modals
    isLangModalOpen: boolean;
    openLangModal: () => void;
    closeLangModal: () => void;

    // Validation error dialog
    validationErrors: string[];
    isValidationErrorOpen: boolean;
    setIsValidationErrorOpen: (open: boolean) => void;

    // Activation / state-change actions
    isActivating: boolean;
    isSwitchingToDraft: boolean;
    handleActivate: () => Promise<void>;
    handleSwitchToDraft: () => Promise<void>;
    handleTestRun: () => void;

    // Rough-sort toggle lock policy (mirrors backend study_service.update_study)
    roughSortLocked: boolean;
    roughSortLockedCount: number;
}

// ────────────────────────────────────────────────────────────────
// Pure helpers
// ────────────────────────────────────────────────────────────────

/**
 * Apply locale-specific defaults to translations missing key fields. Mutates
 * the input draft in place (caller deep-clones first).
 */
export function applyTranslationDefaults(study: StudyRead): StudyRead {
    const studyWithDefaults = JSON.parse(JSON.stringify(study)) as StudyRead;

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: ports the page's defaults-application loop verbatim; cyclomatic complexity comes from independent field-by-field branches that are intentionally flat for legibility
    studyWithDefaults.translations?.forEach((tr: StudyTranslationRead) => {
        const defaults = DEFAULT_STUDY_CONTENT[tr.language_code] || DEFAULT_STUDY_CONTENT.en;
        if (!defaults) return;

        const fieldsToDefault = [
            'instructions',
            'consent_title',
            'consent_description',
            'pre_instruction',
            'condition_of_instruction',
        ] as const;

        for (const field of fieldsToDefault) {
            if (!tr[field] || tr[field]?.trim() === '') {
                tr[field] = defaults[field];
            }
        }

        if (!tr.methodology_tips || tr.methodology_tips.length === 0) {
            if (defaults.methodology_tips) {
                tr.methodology_tips = [...defaults.methodology_tips];
            }
        }

        if (!tr.process_steps || tr.process_steps.length === 0) {
            if (defaults.process_steps) {
                tr.process_steps = [...defaults.process_steps];
            }
        }
    });

    return studyWithDefaults;
}

function buildChecklist(
    draft: StudyUpdate,
    currentTranslation: StudyTranslationRead | undefined,
    isGridValid: boolean,
    t: TFunction
): ChecklistItem[] {
    return [
        {
            label: t('admin.design.checklist.study_title', 'Study Title'),
            isComplete: !!currentTranslation?.title,
            required: true,
        },
        {
            label: t('admin.design.checklist.consent_defined', 'Consent Form'),
            isComplete: !!(
                currentTranslation?.consent_title && currentTranslation?.consent_description
            ),
            required: true,
        },
        {
            label: t('admin.design.checklist.instructions', 'Instructions'),
            isComplete: !!currentTranslation?.condition_of_instruction,
            required: true,
        },
        {
            label: t('admin.design.checklist.statements', 'Statements'),
            isComplete: (draft.statements?.length || 0) > 0,
            required: true,
        },
        {
            label: t('admin.design.checklist.grid_balance', 'Grid balanced'),
            isComplete: isGridValid,
            required: true,
        },
    ];
}

function buildLanguageReadiness(
    draft: StudyUpdate,
    globalRequirementsMet: boolean
): LanguageReadiness[] {
    return (draft.translations || [])
        .filter((tr: StudyTranslationCreate & { is_disabled?: boolean }) => !tr.is_disabled)
        .map((tr: StudyTranslationCreate) => {
            const isTranslationComplete = !!(
                tr.title &&
                tr.consent_title &&
                tr.consent_description &&
                tr.condition_of_instruction
            );
            return {
                code: tr.language_code,
                isReady: globalRequirementsMet && isTranslationComplete,
            };
        });
}

// ────────────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────────────

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: orchestration hook for the Study Design page; cyclomatic complexity comes from independent useEffect/useMemo blocks (study sync, lock derivation, checklist, language readiness, action handlers) that are intentionally kept flat for legibility — rather than fragmenting into trivial sub-hooks just to placate the linter, the established pattern (precedent: useFineSort, useAnalysisPage) is to suppress at the orchestration boundary
export function useStudyDesignPage(): StudyDesignPageApi {
    const { t } = useTranslation();
    const { projectSlug, studySlug } = useParams<{
        projectSlug: string;
        studySlug: string;
    }>();
    const effectiveSlug = studySlug || projectSlug || '';
    const navigate = useNavigate();

    const {
        draft,
        original,
        activeStep,
        activeLocale,
        setStudy,
        setActiveStep,
        setActiveLocale,
        syncStatus,
    } = useStudyDesigner();

    const { save, blocker } = useStudyPersistence();

    // ── Modal / dialog state ───────────────────────────────────────
    const [isLangModalOpen, setIsLangModalOpen] = useState(false);
    const openLangModal = useCallback(() => setIsLangModalOpen(true), []);
    const closeLangModal = useCallback(() => setIsLangModalOpen(false), []);

    const [isSwitchingToDraft, setIsSwitchingToDraft] = useState(false);
    const [isActivating, setIsActivating] = useState(false);
    const [validationErrors, setValidationErrors] = useState<string[]>([]);
    const [isValidationErrorOpen, setIsValidationErrorOpen] = useState(false);

    // ── Ctrl+S / Cmd+S shortcut ───────────────────────────────────
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                save();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [save]);

    // ── Study fetch ────────────────────────────────────────────────
    const { data: study, isLoading } = useGetStudyApiAdminStudiesSlugGet(effectiveSlug, {
        query: {
            enabled: !!projectSlug,
        },
    });

    // ── Participants fetch (used only by the rough-sort lock policy) ─
    // Backend rejects rough_sort_enabled changes once any participant
    // has progressed past consent. We mirror that here so the toggle
    // disables eagerly instead of failing on save.
    const { data: participantsPage } = useListStudyParticipantsApiAdminStudiesSlugParticipantsGet(
        effectiveSlug,
        undefined,
        {
            query: {
                enabled: !!projectSlug && !!effectiveSlug,
            },
        }
    );
    const participants: ParticipantRead[] = participantsPage?.items ?? [];
    const studyId = study?.id ?? 0;
    const { locked: roughSortLocked, lockedCount: roughSortLockedCount } = useRoughSortLock({
        studyId,
        participants,
    });

    // ── Initialize / sync designer state when study is (re)loaded ──
    useEffect(() => {
        if (!study) return;

        const studyWithDefaults = applyTranslationDefaults(study);
        const currentDraft = useStudyDesigner.getState().draft;

        if (!currentDraft) {
            // First-time load: initialize both original and draft
            setStudy(studyWithDefaults);
            return;
        }

        // FORCE SYNC STATE: if server state changed (e.g. via "Manage Flow"),
        // update draft state immediately so the UI unlocks/locks correctly.
        if (currentDraft.state !== study.state) {
            useStudyDesigner.setState((state) => ({
                draft: state.draft ? { ...state.draft, state: study.state } : null,
            }));
        }

        // Update original first
        useStudyDesigner.getState().updateOriginal(study);

        // Re-fetch draft in case we just updated it
        const updatedDraft = useStudyDesigner.getState().draft;

        // Check if draft has unsaved changes
        const projectedUpdate = projectStudyToUpdate(study);
        const draftHasChanges = !areStudiesEqual(updatedDraft, projectedUpdate);

        // If draft has no real changes, sync it with the new data. This
        // prevents false "unsaved changes" warnings.
        if (!draftHasChanges) {
            useStudyDesigner.setState({
                draft: projectedUpdate,
                syncStatus: 'synced',
            });
        }
        // Otherwise, keep the draft as-is (user has real unsaved changes).
    }, [study, setStudy]);

    // ── Derived: dirty / lock / validation ────────────────────────
    const isDirty = syncStatus !== 'synced';

    const isFullyReadOnly = draft ? draft.state !== 'draft' : false;

    const isStructureLocked =
        (draft?.state !== 'draft' || (original?.participant_count || 0) > 0) && !!draft;

    const statementsCount = draft?.statements?.length || 0;
    const gridCapacity = (draft?.grid_config || []).reduce(
        (acc, col) => acc + (col.capacity || 0),
        0
    );
    const isGridValid = statementsCount === gridCapacity;

    const currentTranslation = useMemo(
        () =>
            (draft?.translations || []).find((tr) => tr.language_code === activeLocale) as
                | StudyTranslationRead
                | undefined,
        [draft, activeLocale]
    );

    const isIntroValid =
        !!currentTranslation?.title &&
        !!currentTranslation?.consent_title &&
        !!currentTranslation?.consent_description;
    const isConditionValid = !!currentTranslation?.condition_of_instruction;
    const isQSortValid = (draft?.statements?.length || 0) > 0 && isGridValid;

    // ── Checklist + readiness ─────────────────────────────────────
    const checklist = useMemo<ChecklistItem[]>(() => {
        if (!draft) return [];
        return buildChecklist(draft, currentTranslation, isGridValid, t);
    }, [draft, currentTranslation, isGridValid, t]);

    const globalRequirementsMet = (draft?.statements?.length || 0) > 0 && isGridValid;

    const languageReadiness = useMemo<LanguageReadiness[]>(() => {
        if (!draft) return [];
        return buildLanguageReadiness(draft, globalRequirementsMet);
    }, [draft, globalRequirementsMet]);

    const completedRequiredCount = checklist.filter(
        (item) => item.required && item.isComplete
    ).length;
    const totalRequiredCount = checklist.filter((item) => item.required).length;
    const isLaunchReady = totalRequiredCount > 0 && completedRequiredCount === totalRequiredCount;

    // ── Step navigation ───────────────────────────────────────────
    const currentStepIndex = DESIGN_STEPS.findIndex((s) => s.id === activeStep);
    const nextStep = DESIGN_STEPS[currentStepIndex + 1];
    const prevStep = DESIGN_STEPS[currentStepIndex - 1];

    // ── Active language codes (used by language switcher) ─────────
    const activeLanguageCodes = useMemo(() => {
        const langs = (draft?.translations || [])
            .filter((tr: StudyTranslationCreate & { is_disabled?: boolean }) => !tr.is_disabled)
            .map((tr) => tr.language_code);
        return langs.length > 0 ? langs : ['en'];
    }, [draft]);

    // ── Action handlers ───────────────────────────────────────────
    const handleActivate = useCallback(async () => {
        if (!effectiveSlug || !draft) return;

        if (isDirty) {
            toast.warning(
                t('admin.design.sync.wait_save', 'Saving in progress... please wait a moment.')
            );
            return;
        }

        setIsActivating(true);
        try {
            // 1. Explicit Validation
            const errors = await customInstance<string[]>({
                url: `/api/admin/studies/${effectiveSlug}/validate`,
                method: 'POST',
            });

            if (errors.length > 0) {
                setValidationErrors(errors);
                setIsValidationErrorOpen(true);
                return;
            }

            // 2. Perform state change
            await customInstance({
                url: `/api/admin/studies/${effectiveSlug}/state`,
                method: 'POST',
                params: { new_state: 'active' },
            });

            toast.success(t('admin.study.state_changed_active') || 'Study is now active!');
            window.location.reload();
        } catch (error) {
            toast.error(
                t(
                    'admin.study.activate_error',
                    'Could not activate study. Verify the design is valid and try again.'
                )
            );
            console.error(error);
        } finally {
            setIsActivating(false);
        }
    }, [effectiveSlug, draft, isDirty, t]);

    const handleSwitchToDraft = useCallback(async () => {
        if (!effectiveSlug) return;
        setIsSwitchingToDraft(true);
        try {
            await customInstance({
                url: `/api/admin/studies/${effectiveSlug}/state`,
                method: 'POST',
                params: { new_state: 'draft' },
            });
            window.location.reload();
        } catch (error) {
            toast.error(
                t(
                    'admin.study_status.notifications.error',
                    'Could not change study state. Check your permissions and try again.'
                )
            );
            console.error(error);
        } finally {
            setIsSwitchingToDraft(false);
        }
    }, [effectiveSlug, t]);

    const handleTestRun = useCallback(() => {
        if (!draft || !effectiveSlug) return;

        // 1. Build synthetic config (same logic as side-preview)
        const translation = draft.translations?.find((tr) => tr.language_code === activeLocale);

        const syntheticConfig = {
            ...draft,
            title: translation?.title || 'No Title',
            subtitle: translation?.subtitle,
            description: translation?.description,
            objective: translation?.objective,
            instructions: translation?.instructions,
            consent: {
                title: translation?.consent_title,
                description: translation?.consent_description,
            },
            pre_instruction: translation?.pre_instruction,
            condition_of_instruction: translation?.condition_of_instruction,

            ui_labels: translation?.ui_labels || {},
            process_steps: translation?.process_steps || [],
            language: activeLocale,
            statements: (draft.statements || []).map((s, index) => {
                const st = s.translations?.find((tr) => tr.language_code === activeLocale);
                return {
                    id: index + 1,
                    code: s.code,
                    text: st?.text || '',
                };
            }),
        };

        localStorage.setItem(`qualis-test-draft-${effectiveSlug}`, JSON.stringify(draft));
        localStorage.setItem(
            `qualis-test-config-${effectiveSlug}`,
            JSON.stringify(syntheticConfig)
        );
        localStorage.setItem(`qualis-pilot-reset-${effectiveSlug}`, 'true');

        const testUrl = `/study/${effectiveSlug}?mode=test`;
        window.open(testUrl, '_blank');
        toast.info(`${t('admin.design.toolbar.test_run')}...`);
    }, [draft, effectiveSlug, activeLocale, t]);

    return {
        effectiveSlug,
        projectSlug,
        navigate,
        isLoading,
        study,
        draft,
        original,
        activeStep,
        activeLocale,
        syncStatus,
        setActiveStep,
        setActiveLocale,
        save,
        blocker,
        isDirty,
        isFullyReadOnly,
        isStructureLocked,
        statementsCount,
        gridCapacity,
        isGridValid,
        isIntroValid,
        isConditionValid,
        isQSortValid,
        checklist,
        languageReadiness,
        isLaunchReady,
        designSteps: DESIGN_STEPS,
        nextStep,
        prevStep,
        currentTranslation,
        activeLanguageCodes,
        isLangModalOpen,
        openLangModal,
        closeLangModal,
        validationErrors,
        isValidationErrorOpen,
        setIsValidationErrorOpen,
        isActivating,
        isSwitchingToDraft,
        handleActivate,
        handleSwitchToDraft,
        handleTestRun,
        roughSortLocked,
        roughSortLockedCount,
    };
}
