/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * useRoughSortLock — admin-side mirror of the backend lock policy on
 * `Study.rough_sort_enabled`.
 *
 * Backend policy (shipped in Phase 1 — `study_service.update_study`):
 * the toggle cannot be flipped once any participant has progressed past
 * the consent step (i.e. `last_step_reached > 1`). A participant who
 * only landed on the consent screen (step 1) does not lock the toggle:
 * those sessions are considered noise and can be archived/deleted by
 * the admin without losing real sort data.
 *
 * The hook is purely derived: no network call, no effect — it just
 * folds the participant list into `{ locked, lockedCount }` so the UI
 * can disable the checkbox and render an explanatory banner with the
 * count.
 */

import { useMemo } from 'react';

export interface RoughSortLockState {
    locked: boolean;
    lockedCount: number;
}

interface Args {
    /**
     * Accepted for symmetry with future per-study cache keys; unused at
     * the JS level. Keeping the parameter on the public API lets call
     * sites self-document the study they are reasoning about.
     */
    studyId: number;
    participants: Array<{ last_step_reached?: number | null }>;
}

export function useRoughSortLock({ participants }: Args): RoughSortLockState {
    return useMemo<RoughSortLockState>(() => {
        const lockedCount = participants.reduce((acc, p) => {
            const step = p.last_step_reached ?? 0;
            return step > 1 ? acc + 1 : acc;
        }, 0);
        return {
            locked: lockedCount > 0,
            lockedCount,
        };
    }, [participants]);
}
