/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * CSV/TSV utilities shared by:
 *  - QSortEditor (paste-from-Excel statement entry)
 *  - ConcourseDetailPage (file-based bulk import — code/language/text rows)
 *
 * The low-level parseCsvTsv handles quoted fields with internal commas
 * and newlines; double-quote escaping inside a quoted field follows the
 * usual CSV convention ("" → "). The output trims surrounding whitespace
 * on every cell.
 *
 * The higher-level parseConcourseCsv treats the first non-empty row as
 * a header line and maps each subsequent row to a {code, language, text}
 * record. Per-row validation errors are returned alongside the rows that
 * survived; callers decide whether to import partial results or block.
 */

/** Robust CSV/TSV parser that handles quoted fields and internal newlines. */
export function parseCsvTsv(text: string, separator: string = '\t'): string[][] {
    const result: string[][] = [];
    let row: string[] = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (inQuotes) {
            if (char === '"' && nextChar === '"') {
                currentField += '"';
                i++; // Skip next quote
            } else if (char === '"') {
                inQuotes = false;
            } else {
                currentField += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
            } else if (char === separator) {
                row.push(currentField.trim());
                currentField = '';
            } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
                if (char === '\r') i++;
                row.push(currentField.trim());
                result.push(row);
                row = [];
                currentField = '';
            } else if (char === '\r') {
                row.push(currentField.trim());
                result.push(row);
                row = [];
                currentField = '';
            } else {
                currentField += char;
            }
        }
    }
    if (row.length > 0 || currentField !== '') {
        row.push(currentField.trim());
        result.push(row);
    }
    return result.filter((r) => r.length > 0 && r.some((c) => c !== ''));
}

/** Auto-detect the delimiter from the first content line. */
function detectDelimiter(text: string): ',' | '\t' {
    // Look at the first non-empty line. If it has more tabs than commas,
    // treat as TSV; otherwise CSV.
    const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? '';
    const tabs = (firstLine.match(/\t/g) ?? []).length;
    const commas = (firstLine.match(/,/g) ?? []).length;
    return tabs > commas ? '\t' : ',';
}

export type ConcourseImportRow = { code: string; language: string; text: string };

export interface ConcourseImportResult {
    rows: ConcourseImportRow[];
    errors: string[];
    /** The delimiter that was actually used. */
    delimiter: ',' | '\t';
}

const REQUIRED_HEADERS = ['code', 'language', 'text'] as const;

/**
 * Parse a researcher-supplied CSV/TSV blob into concourse import rows.
 *
 * Accepts a header row with `code`, `language`, `text` (case-insensitive,
 * any column order). Returns parsed rows along with per-row diagnostics
 * for missing or empty required cells.
 */
export function parseConcourseCsv(text: string): ConcourseImportResult {
    const trimmed = text.trim();
    if (!trimmed) {
        return { rows: [], errors: ['Input is empty.'], delimiter: ',' };
    }

    const delimiter = detectDelimiter(trimmed);
    const matrix = parseCsvTsv(trimmed, delimiter);
    if (matrix.length === 0) {
        return { rows: [], errors: ['No rows detected.'], delimiter };
    }

    const headerRow = matrix[0] ?? [];
    const dataRows = matrix.slice(1);
    const headers = headerRow.map((h) => h.toLowerCase());
    const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
    if (missing.length > 0) {
        return {
            rows: [],
            errors: [`Missing required header(s): ${missing.join(', ')}.`],
            delimiter,
        };
    }

    const idx = {
        code: headers.indexOf('code'),
        language: headers.indexOf('language'),
        text: headers.indexOf('text'),
    };

    const rows: ConcourseImportRow[] = [];
    const errors: string[] = [];
    dataRows.forEach((cells, i) => {
        const lineNumber = i + 2; // +1 for the header row, +1 for 1-based numbering
        const code = (cells[idx.code] ?? '').trim();
        const language = (cells[idx.language] ?? '').trim().toLowerCase();
        const rowText = (cells[idx.text] ?? '').trim();
        if (!code) errors.push(`Row ${lineNumber}: missing code.`);
        if (!language) errors.push(`Row ${lineNumber}: missing language.`);
        if (!rowText) errors.push(`Row ${lineNumber}: missing text.`);
        if (code && language && rowText) {
            rows.push({ code, language, text: rowText });
        }
    });

    return { rows, errors, delimiter };
}
