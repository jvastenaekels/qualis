/**
 * Canonical mapping of participant flow steps for a study.
 *
 * The participant flow has up to 5 steps:
 *   1=consent, 2=presort, 3=rough sort, 4=fine sort, 5=post-sort.
 *
 * When `study.rough_sort_enabled` is `false`, step 3 is skipped — the
 * canonical sequence becomes 1, 2, 4, 5. Persisted step numbers in the
 * database (`participant.last_step_reached`) keep the same numeric values
 * across both modes (i.e. fine-sort is always step 4).
 *
 * Every admin view that displays step labels, filter dropdowns or progress
 * bars must derive its data from `getEnabledSteps(study)` rather than
 * hardcoded constants — this keeps the two modes in sync without per-view
 * branching logic.
 */

export type StepKey = 'consent' | 'presort' | 'rough' | 'fine' | 'post';

export interface StepDescriptor {
    key: StepKey;
    /** Numeric value as persisted in `participant.last_step_reached`. */
    persistedNumber: number;
    /** i18n key for the step label. */
    labelKey: string;
    /** English fallback for the i18n label. */
    labelDefault: string;
    /** Progress percentage at this step (1-based, 100 for the last step). */
    progressPct: number;
}

const ALL_STEPS: ReadonlyArray<Omit<StepDescriptor, 'progressPct'>> = [
    {
        key: 'consent',
        persistedNumber: 1,
        labelKey: 'admin.data.step.consent',
        labelDefault: 'Consent',
    },
    {
        key: 'presort',
        persistedNumber: 2,
        labelKey: 'admin.data.step.presort',
        labelDefault: 'Pre-sort survey',
    },
    {
        key: 'rough',
        persistedNumber: 3,
        labelKey: 'admin.data.step.rough',
        labelDefault: 'Preliminary sort',
    },
    {
        key: 'fine',
        persistedNumber: 4,
        labelKey: 'admin.data.step.fine',
        labelDefault: 'Q-sort',
    },
    {
        key: 'post',
        persistedNumber: 5,
        labelKey: 'admin.data.step.post',
        labelDefault: 'Post-sort survey',
    },
];

interface StudyShape {
    rough_sort_enabled: boolean;
}

export function getEnabledSteps(study: StudyShape): StepDescriptor[] {
    const filtered = study.rough_sort_enabled
        ? ALL_STEPS
        : ALL_STEPS.filter((s) => s.key !== 'rough');
    const total = filtered.length;
    return filtered.map((s, i) => ({
        ...s,
        progressPct: Math.round(((i + 1) / total) * 100),
    }));
}

/**
 * Build a record mapping persisted step numbers to their [labelKey, labelDefault]
 * tuple, restricted to the keys in `keys`. Used by admin views that show
 * dropdowns / filters / per-row badges keyed off `last_step_reached`.
 *
 * Steps not enabled for the study are omitted. Step 1 (consent) is typically
 * not user-facing in admin filter dropdowns, so callers pass the keys they
 * actually want.
 */
export function getStepLabels(
    study: StudyShape,
    keys: ReadonlySet<StepKey>
): Record<number, [string, string]> {
    const result: Record<number, [string, string]> = {};
    for (const desc of getEnabledSteps(study)) {
        if (keys.has(desc.key)) {
            result[desc.persistedNumber] = [desc.labelKey, desc.labelDefault];
        }
    }
    return result;
}

/**
 * Map a persisted step number to its key, given a study config.
 *
 * If the step number is not enabled for this study (e.g. step 3 with
 * `rough_sort_enabled=false` — a stale value), fall back to the next
 * enabled step in sequence to keep the UI on a sensible target.
 *
 * Returns null for step numbers outside the canonical range.
 */
export function mapPersistedStepToKey(persistedNumber: number, study: StudyShape): StepKey | null {
    if (persistedNumber < 1 || persistedNumber > 5) return null;
    const enabled = getEnabledSteps(study);
    const exact = enabled.find((s) => s.persistedNumber === persistedNumber);
    if (exact) return exact.key;
    const fallback = enabled.find((s) => s.persistedNumber > persistedNumber);
    return fallback?.key ?? null;
}
