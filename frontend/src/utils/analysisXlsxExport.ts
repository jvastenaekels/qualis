import type { AnalysisResult } from '@/api/model';
import type { WorkSheet } from 'xlsx';

/** Convert 0-indexed (row, col) to a cell address like "A1", "AA2". */
function cellAddr(r: number, c: number): string {
    let col = '';
    let cc = c;
    do {
        col = String.fromCharCode(65 + (cc % 26)) + col;
        cc = Math.floor(cc / 26) - 1;
    } while (cc >= 0);
    return col + (r + 1);
}

/** Set column widths based on content, capped at 50 characters. */
function autoSizeColumns(ws: WorkSheet, data: (string | number | boolean)[][]) {
    if (data.length === 0) return;
    const maxCols = Math.max(...data.map((row) => row.length));
    const widths: number[] = [];
    for (let c = 0; c < maxCols; c++) {
        let max = 8;
        for (const row of data) {
            const len = row[c] != null ? String(row[c]).length : 0;
            if (len > max) max = len;
        }
        widths.push(Math.min(max + 2, 50));
    }
    ws['!cols'] = widths.map((wch) => ({ wch }));
}

/** Apply an Excel number format (e.g. "0.000") to a rectangular range of numeric cells. */
function formatRange(
    ws: WorkSheet,
    startRow: number,
    endRow: number,
    startCol: number,
    endCol: number,
    fmt: string
) {
    for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
            const cell = ws[cellAddr(r, c)];
            if (cell && typeof cell.v === 'number') {
                cell.z = fmt;
            }
        }
    }
}

/** Freeze the top row so headers stay visible while scrolling. */
function freezeHeaderRow(ws: WorkSheet) {
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };
}

/**
 * Generates a multi-sheet XLSX workbook with the complete analysis.
 * Uses dynamic import to keep SheetJS out of the main bundle.
 *
 * `factorNotes` (optional) is the per-factor interpretive narrative dict
 * keyed by stringified 1-indexed factor number. When provided and at least
 * one entry is non-empty, a "Factor Narratives" sheet is included.
 */
export async function generateAnalysisXlsx(
    result: AnalysisResult,
    factorNotes?: Record<string, string> | null
): Promise<Blob> {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const nf = result.n_factors;

    const makeSheet = (data: (string | number | boolean)[][]): WorkSheet => {
        const ws = XLSX.utils.aoa_to_sheet(data);
        autoSizeColumns(ws, data);
        return ws;
    };

    // 1. Overview — consistent 2-column key/value layout
    const overviewRows: (string | number)[][] = [
        ['Extraction', result.extraction.toUpperCase()],
        ['Rotation', capitalize(result.rotation)],
        ['N Participants', result.n_participants],
        ['N Statements', result.n_statements],
        ['N Factors', result.n_factors],
        ['Total Variance Explained (%)', result.total_variance_explained],
    ];
    for (let i = 0; i < result.eigenvalues.length; i++) {
        overviewRows.push([`Eigenvalue ${i + 1}`, result.eigenvalues[i] ?? 0]);
    }
    const wsOverview = makeSheet(overviewRows);
    formatRange(wsOverview, 5, 5, 1, 1, '0.0'); // variance
    formatRange(wsOverview, 6, 6 + result.eigenvalues.length - 1, 1, 1, '0.0000'); // eigenvalues
    XLSX.utils.book_append_sheet(wb, wsOverview, 'Overview');

    // 2. Factor Loadings
    const loadingsHeader = [
        'Participant',
        ...Array.from({ length: nf }, (_, f) => `F${f + 1}`),
        'Flagged',
    ];
    const loadingsRows = result.participants.map((p) => [
        p.label,
        ...p.loadings,
        (p.flagged_factors ?? []).map((f) => `F${f}`).join(', ') || '',
    ]);
    const wsLoadings = makeSheet([loadingsHeader, ...loadingsRows]);
    freezeHeaderRow(wsLoadings);
    formatRange(wsLoadings, 1, loadingsRows.length, 1, nf, '0.0000');
    XLSX.utils.book_append_sheet(wb, wsLoadings, 'Factor Loadings');

    // 3. Statement Scores
    const dIds = new Set(result.distinguishing.map((d) => d.statement_id));
    const cIds = new Set(result.consensus.map((c) => c.statement_id));
    const scoresHeader = [
        'Code',
        'Statement',
        ...Array.from({ length: nf }, (_, f) => `F${f + 1} Z-Score`),
        ...Array.from({ length: nf }, (_, f) => `F${f + 1} Array`),
        'Type',
    ];
    const scoresRows = result.statement_scores.map((s) => [
        s.code,
        s.text,
        ...s.z_scores,
        ...s.factor_arrays,
        dIds.has(s.statement_id) ? 'D' : cIds.has(s.statement_id) ? 'C' : '',
    ]);
    const wsScores = makeSheet([scoresHeader, ...scoresRows]);
    freezeHeaderRow(wsScores);
    formatRange(wsScores, 1, scoresRows.length, 2, 1 + nf, '0.00'); // z-scores
    formatRange(wsScores, 1, scoresRows.length, 2 + nf, 1 + 2 * nf, '0'); // arrays
    XLSX.utils.book_append_sheet(wb, wsScores, 'Statement Scores');

    // 4. Distinguishing
    const distHeader = [
        'Code',
        'Statement',
        ...Array.from({ length: nf }, (_, f) => `F${f + 1} Z-Score`),
        ...Array.from({ length: nf }, (_, f) => `F${f + 1} Array`),
        'Significance',
    ];
    const distRows = result.distinguishing.map((d) => [
        d.code,
        d.text,
        ...d.z_scores,
        ...d.factor_arrays,
        Object.entries(d.significance ?? {})
            .map(([pair, sig]) => `${pair}: ${sig}`)
            .join('; '),
    ]);
    const wsDist = makeSheet([distHeader, ...distRows]);
    freezeHeaderRow(wsDist);
    formatRange(wsDist, 1, distRows.length, 2, 1 + nf, '0.00');
    formatRange(wsDist, 1, distRows.length, 2 + nf, 1 + 2 * nf, '0');
    XLSX.utils.book_append_sheet(wb, wsDist, 'Distinguishing');

    // 5. Consensus
    const consHeader = [
        'Code',
        'Statement',
        ...Array.from({ length: nf }, (_, f) => `F${f + 1} Z-Score`),
        ...Array.from({ length: nf }, (_, f) => `F${f + 1} Array`),
    ];
    const consRows = result.consensus.map((c) => [
        c.code,
        c.text,
        ...c.z_scores,
        ...c.factor_arrays,
    ]);
    const wsCons = makeSheet([consHeader, ...consRows]);
    freezeHeaderRow(wsCons);
    formatRange(wsCons, 1, consRows.length, 2, 1 + nf, '0.00');
    formatRange(wsCons, 1, consRows.length, 2 + nf, 1 + 2 * nf, '0');
    XLSX.utils.book_append_sheet(wb, wsCons, 'Consensus');

    // 6. Factor Characteristics — per-row formats
    const chars = result.factor_characteristics;
    const charHeader: (string | number)[] = ['Metric', ...chars.map((c) => `F${c.factor}`)];
    const charMetrics: { label: string; values: number[]; fmt: string }[] = [
        { label: 'Eigenvalue', values: chars.map((c) => c.eigenvalue), fmt: '0.000' },
        {
            label: 'Variance Explained (%)',
            values: chars.map((c) => c.variance_explained),
            fmt: '0.0',
        },
        {
            label: 'Cumulative Variance (%)',
            values: chars.map((c) => c.cumulative_variance),
            fmt: '0.0',
        },
        { label: 'N Flagged Sorts', values: chars.map((c) => c.n_flagged), fmt: '0' },
        { label: 'Avg Reliability Coef', values: chars.map((c) => c.avg_rel_coef), fmt: '0.000' },
        {
            label: 'Composite Reliability',
            values: chars.map((c) => c.composite_reliability),
            fmt: '0.000',
        },
        {
            label: 'SE of Factor Scores',
            values: chars.map((c) => c.se_factor_scores),
            fmt: '0.000',
        },
    ];
    const charData: (string | number)[][] = [
        charHeader,
        ...charMetrics.map((m) => [m.label, ...m.values]),
    ];
    const wsChars = makeSheet(charData);
    freezeHeaderRow(wsChars);
    for (let i = 0; i < charMetrics.length; i++) {
        const metric = charMetrics[i];
        if (metric) formatRange(wsChars, i + 1, i + 1, 1, chars.length, metric.fmt);
    }
    XLSX.utils.book_append_sheet(wb, wsChars, 'Factor Characteristics');

    // 7. Correlation Matrix
    const corrHeader: (string | number)[] = [
        '',
        ...Array.from({ length: nf }, (_, f) => `F${f + 1}`),
    ];
    const corrRows: (string | number)[][] = result.correlation_matrix.map((row, i) => [
        `F${i + 1}`,
        ...row.map((v) => v ?? 0),
    ]);
    const wsCorr = makeSheet([corrHeader, ...corrRows]);
    freezeHeaderRow(wsCorr);
    formatRange(wsCorr, 1, corrRows.length, 1, nf, '0.000');
    XLSX.utils.book_append_sheet(wb, wsCorr, 'Correlation Matrix');

    // 8. Factor Narratives (per-factor interpretive memos, when provided).
    // Skipped entirely if no narratives were authored — no empty sheet.
    if (factorNotes) {
        const narrativeRows: (string | number)[][] = [['Factor', 'Narrative']];
        let any = false;
        for (let f = 0; f < nf; f++) {
            const note = factorNotes[String(f + 1)] ?? '';
            if (note.trim()) {
                any = true;
                narrativeRows.push([`F${f + 1}`, note]);
            }
        }
        if (any) {
            const wsNotes = makeSheet(narrativeRows);
            freezeHeaderRow(wsNotes);
            // Wider second column to fit prose; row heights default.
            wsNotes['!cols'] = [{ wch: 8 }, { wch: 80 }];
            XLSX.utils.book_append_sheet(wb, wsNotes, 'Factor Narratives');
        }
    }

    // Write to binary and return as Blob
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([wbout], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
}

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}
