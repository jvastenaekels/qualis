import { areStudiesEqual, type SyncStatus } from '@/store/useStudyDesigner';
import type { StudyUpdate } from '@/api/model';
import { mergeStudyUpdates, type MergeStudyResult } from '@/utils/mergeStudy';

type MergeFn = (
    local: StudyUpdate,
    server: StudyUpdate,
    original: StudyUpdate | null,
    strategy: 'local-wins'
) => MergeStudyResult;

export type ConflictResolution =
    | { kind: 'merged'; merged: StudyUpdate; warnings: string[] }
    | { kind: 'hard-conflict' };

/**
 * Resolve a 409 conflict by merging local draft against server state.
 * Caller must pre-convert serverRead/original to StudyUpdate via
 * projectStudyToUpdate before calling. Returns 'merged' with the merged
 * draft (and any warnings) on success, 'hard-conflict' otherwise.
 */
export function resolveServerConflict(
    draft: StudyUpdate,
    serverUpdate: StudyUpdate,
    originalUpdate: StudyUpdate | null,
    merge: MergeFn = mergeStudyUpdates
): ConflictResolution {
    const result = merge(draft, serverUpdate, originalUpdate, 'local-wins');
    if (result.success && result.merged) {
        return {
            kind: 'merged',
            merged: result.merged,
            warnings: result.warnings ?? [],
        };
    }
    return { kind: 'hard-conflict' };
}

/**
 * Returns true when the draft is in sync with either the original server state
 * (already projected to StudyUpdate by the caller) or the last successfully
 * saved draft snapshot.
 */
export function isDraftInSync(
    draft: StudyUpdate,
    original: StudyUpdate | null,
    lastSavedDraftJson: string | null
): boolean {
    if (areStudiesEqual(draft, original)) return true;
    if (lastSavedDraftJson) {
        return areStudiesEqual(draft, JSON.parse(lastSavedDraftJson) as StudyUpdate);
    }
    return false;
}

/**
 * True when the draft holds work that is not safely on the server yet, so the
 * unload guard, the navigation blocker and the localStorage backup should all
 * engage.
 *
 * This exists because those three call sites each enumerated `SyncStatus`
 * inline as `'modified' || 'saving'` — three of its four values. The omitted
 * one was `'error'`, which the sync effect deliberately refuses to downgrade
 * while the draft is dirty, so it is the *resting* state after a failed save.
 * The result was that a researcher whose save had just failed could close the
 * tab or navigate away with no warning and no local backup: the one state
 * where the guards matter most was the one state none of them covered.
 *
 * The `switch` is exhaustive on purpose. Adding a fifth `SyncStatus` without
 * deciding what it means here is a type error, not another silent omission.
 */
export function hasUnsavedWork(status: SyncStatus): boolean {
    switch (status) {
        case 'modified':
        case 'saving':
        case 'error':
            return true;
        case 'synced':
            return false;
        default: {
            const exhaustive: never = status;
            return exhaustive;
        }
    }
}
