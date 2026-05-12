/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Pure CSV/blob export helpers for AnalysisResult payloads.
 *
 * Extracted so that the Interpret-phase shell can reuse them without dragging
 * React state. No state, no React, just data → string / data → side-effect.
 */

import type { AnalysisResult } from '@/api/model';

/**
 * Trigger a browser download of a Blob with the given filename.
 *
 * Side-effecting: creates an <a>, clicks it, then revokes the object URL.
 * Kept here because it's the only consumer alongside the CSV builders.
 */
export function downloadBlob(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
}

/**
 * Build the loadings CSV (one row per participant, one column per factor +
 * a Flagged column listing factor labels).
 */
export function generateLoadingsCsv(result: AnalysisResult): string {
    const headers = [
        'Participant',
        ...Array.from({ length: result.n_factors }, (_, f) => `F${f + 1}`),
        'Flagged',
    ];
    const rows = result.participants.map((p) => [
        p.label,
        ...p.loadings.map((l) => l.toFixed(4)),
        (p.flagged_factors ?? []).map((f) => `F${f}`).join(';') || '',
    ]);
    return [headers, ...rows].map((r) => r.join(',')).join('\n');
}

/**
 * Build the statement-scores CSV (one row per statement, factor z-scores +
 * factor arrays + a D/C type column).
 */
export function generateScoresCsv(result: AnalysisResult): string {
    const dIds = new Set(result.distinguishing.map((d) => d.statement_id));
    const headers = [
        'Code',
        'Statement',
        ...Array.from({ length: result.n_factors }, (_, f) => `F${f + 1} Z-Score`),
        ...Array.from({ length: result.n_factors }, (_, f) => `F${f + 1} Array`),
        'Type',
    ];
    const rows = result.statement_scores.map((s) => [
        s.code,
        `"${s.text.replace(/"/g, '""')}"`,
        ...s.z_scores.map((z) => (z === null ? '' : z.toFixed(2))),
        ...s.factor_arrays.map(String),
        dIds.has(s.statement_id)
            ? 'D'
            : result.consensus.some((c) => c.statement_id === s.statement_id)
              ? 'C'
              : '',
    ]);
    return [headers, ...rows].map((r) => r.join(',')).join('\n');
}
