import { areStudiesEqual } from '@/store/useStudyDesigner';
import type { StudyUpdate } from '@/api/model';

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
