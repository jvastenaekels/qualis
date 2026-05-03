import { areStudiesEqual } from '@/store/useStudyDesigner';
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
