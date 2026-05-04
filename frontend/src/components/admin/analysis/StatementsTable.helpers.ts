import type { StatementScore } from '@/api/model';

type SortKey = 'code' | 'type' | `z${number}` | `a${number}`;

/**
 * Maps the best (lowest) significance level found in a distinguishing entry
 * to a star string. Called by getTypeLabel.
 *
 * @param significance  Record of pairwise significance levels from the
 *                      distinguishingMap entry.
 * @returns  Star string: '****' | '***' | '**' | '*'
 */
export function getDistinguishingStars(significance: Record<string, string>): string {
    const levels = ['p<0.000001', 'p<0.001', 'p<0.01', 'p<0.05'];
    const maxSig = Object.values(significance).reduce((best, sig) => {
        return levels.indexOf(sig) < levels.indexOf(best) ? sig : best;
    }, 'p<0.05');

    if (maxSig === 'p<0.000001') return '****';
    if (maxSig === 'p<0.001') return '***';
    if (maxSig === 'p<0.01') return '**';
    return '*';
}

/**
 * Pure comparator for sorting StatementScore rows. Returns a negative/zero/
 * positive number suitable for Array.prototype.sort. The caller applies the
 * ascending/descending inversion.
 */
export function compareStatementScores(
    a: StatementScore,
    b: StatementScore,
    sortKey: SortKey,
    distinguishingMap: Map<number, { significance: Record<string, string> }>,
    consensusIds: Set<number>
): number {
    if (sortKey === 'code') {
        return a.code.localeCompare(b.code, undefined, { numeric: true });
    }
    if (sortKey === 'type') {
        const rank = (id: number): number =>
            distinguishingMap.has(id) ? 1 : consensusIds.has(id) ? -1 : 0;
        return rank(a.statement_id) - rank(b.statement_id);
    }
    if (sortKey.startsWith('z')) {
        const f = Number(sortKey.slice(1));
        return (a.z_scores[f] ?? 0) - (b.z_scores[f] ?? 0);
    }
    if (sortKey.startsWith('a')) {
        const f = Number(sortKey.slice(1));
        return (a.factor_arrays[f] ?? 0) - (b.factor_arrays[f] ?? 0);
    }
    return 0;
}
