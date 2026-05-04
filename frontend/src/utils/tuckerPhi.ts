/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Tucker's congruence coefficient (φ) — normalised dot product over
 * z-score (or loadings) vectors. Used by the Compare panel (PR 5) to
 * align factors across two analysis runs and detect ambiguous matches.
 */
export function tuckerPhi(a: readonly number[], b: readonly number[]): number {
    if (a.length !== b.length) {
        throw new Error(`tuckerPhi: length mismatch (${a.length} vs ${b.length})`);
    }
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < a.length; i++) {
        const x = a[i] ?? 0;
        const y = b[i] ?? 0;
        dot += x * y;
        na += x * x;
        nb += y * y;
    }
    if (na === 0 || nb === 0) return 0;
    return dot / Math.sqrt(na * nb);
}

export interface FactorMatch {
    aIndex: number; // 0-based factor index in run A
    bIndex: number; // 0-based factor index in run B
    phi: number; // sign-preserved (negative for flipped match)
}

/**
 * Find the unused column of bMatrix with the highest |φ| against aCol.
 * Returns null if all columns are used or bMatrix has no factors.
 */
export function findBestMatchForFactor(
    aIndex: number,
    aCol: readonly number[],
    bMatrix: readonly (readonly number[])[],
    used: ReadonlySet<number>
): FactorMatch | null {
    const nFactorsB = bMatrix[0]?.length ?? 0;
    let best: FactorMatch | null = null;
    for (let j = 0; j < nFactorsB; j++) {
        if (used.has(j)) continue;
        const bCol = bMatrix.map((row) => row[j] ?? 0);
        const phi = tuckerPhi(aCol, bCol);
        if (best === null || Math.abs(phi) > Math.abs(best.phi)) {
            best = { aIndex, bIndex: j, phi };
        }
    }
    return best;
}

/**
 * Match factors of run A to factors of run B by maximum |φ|.
 * Greedy assignment: for each factor of A in order, pick the unused
 * factor of B with the highest |φ|. Sign of φ is preserved (a flipped
 * match has negative φ).
 *
 * `aMatrix` and `bMatrix` are statement-by-factor (rows = statements,
 * cols = factors). The number of statements must match (length-mismatch
 * raises in tuckerPhi).
 */
export function matchFactorsByPhi(
    aMatrix: readonly (readonly number[])[],
    bMatrix: readonly (readonly number[])[]
): FactorMatch[] {
    if (aMatrix.length === 0 || bMatrix.length === 0) return [];
    const nFactorsA = aMatrix[0]?.length ?? 0;
    const used = new Set<number>();
    const matches: FactorMatch[] = [];
    for (let i = 0; i < nFactorsA; i++) {
        const aCol = aMatrix.map((row) => row[i] ?? 0);
        const best = findBestMatchForFactor(i, aCol, bMatrix, used);
        if (best !== null) {
            used.add(best.bIndex);
            matches.push(best);
        }
    }
    return matches;
}
