import type { ParticipantLoading } from '@/api/model';

type SortKey = 'label' | 'flagged' | number;

/**
 * Pure comparator for sorting ParticipantLoading rows. Returns a negative/zero/
 * positive number suitable for Array.prototype.sort. The caller applies the
 * ascending/descending inversion.
 *
 * @param a        First participant row.
 * @param b        Second participant row.
 * @param sortKey  Column to sort by: 'label', 'flagged', or a factor index (0-based).
 */
export function compareParticipantLoadings(
    a: ParticipantLoading,
    b: ParticipantLoading,
    sortKey: SortKey
): number {
    if (sortKey === 'label') {
        return a.label.localeCompare(b.label);
    }
    if (sortKey === 'flagged') {
        return (a.flagged_factors?.[0] ?? 0) - (b.flagged_factors?.[0] ?? 0);
    }
    if (typeof sortKey === 'number') {
        return (a.loadings[sortKey] ?? 0) - (b.loadings[sortKey] ?? 0);
    }
    return 0;
}
