import type { ConcourseItemVersionRead } from '@/api/model';
import type { TFunction } from 'i18next';

/**
 * Pure diff helper: compares two consecutive ConcourseItemVersionRead snapshots
 * and returns an array of human-readable field labels that changed, or null if
 * nothing changed. The translation function `t` is passed in so this helper
 * has no runtime dependency on react-i18next and stays easily testable.
 *
 * @param prev    The earlier version snapshot.
 * @param current The later version snapshot.
 * @param t       The i18next translation function from the calling component.
 */
export function diffVersionFields(
    prev: ConcourseItemVersionRead,
    current: ConcourseItemVersionRead,
    t: TFunction
): string[] | null {
    const changes: string[] = [];
    if (prev.code !== current.code) {
        changes.push(t('admin.concourse.diff_code', 'code'));
    }
    if (prev.status !== current.status) {
        changes.push(t('admin.concourse.diff_status', 'status'));
    }
    const prevTexts = (prev.translations_snapshot ?? [])
        .map((tr) => `${tr.language_code}:${tr.text}`)
        .sort()
        .join('|');
    const curTexts = (current.translations_snapshot ?? [])
        .map((tr) => `${tr.language_code}:${tr.text}`)
        .sort()
        .join('|');
    if (prevTexts !== curTexts) {
        changes.push(t('admin.concourse.diff_text', 'text'));
    }
    const prevTags = [...(prev.tag_ids_snapshot ?? [])].sort().join(',');
    const curTags = [...(current.tag_ids_snapshot ?? [])].sort().join(',');
    if (prevTags !== curTags) {
        changes.push(t('admin.concourse.diff_tags', 'tags'));
    }
    return changes.length > 0 ? changes : null;
}
