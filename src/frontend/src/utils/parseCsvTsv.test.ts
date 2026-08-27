/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { describe, expect, it } from 'vitest';
import { parseCsvTsv, parseConcourseCsv } from './parseCsvTsv';

describe('parseCsvTsv', () => {
    it('parses a simple CSV', () => {
        const out = parseCsvTsv('a,b,c\n1,2,3\n', ',');
        expect(out).toEqual([
            ['a', 'b', 'c'],
            ['1', '2', '3'],
        ]);
    });

    it('parses a TSV (default separator)', () => {
        const out = parseCsvTsv('a\tb\tc\n1\t2\t3\n');
        expect(out).toEqual([
            ['a', 'b', 'c'],
            ['1', '2', '3'],
        ]);
    });

    it('handles quoted fields with internal commas', () => {
        const out = parseCsvTsv('code,text\nC1,"Hello, world"\n', ',');
        expect(out).toEqual([
            ['code', 'text'],
            ['C1', 'Hello, world'],
        ]);
    });

    it('handles escaped double-quotes inside quoted fields', () => {
        const out = parseCsvTsv('text\n"He said ""hi"""\n', ',');
        expect(out).toEqual([['text'], ['He said "hi"']]);
    });

    it('handles CR/LF line endings (Windows)', () => {
        const out = parseCsvTsv('a,b\r\n1,2\r\n', ',');
        expect(out).toEqual([
            ['a', 'b'],
            ['1', '2'],
        ]);
    });

    it('drops fully-empty rows', () => {
        const out = parseCsvTsv('a,b\n\n1,2\n\n', ',');
        expect(out).toEqual([
            ['a', 'b'],
            ['1', '2'],
        ]);
    });
});

describe('parseConcourseCsv', () => {
    it('parses a CSV with code,language,text headers', () => {
        const csv = 'code,language,text\nC1,en,Hello\nC2,fr,Bonjour\n';
        const result = parseConcourseCsv(csv);
        expect(result.errors).toEqual([]);
        expect(result.delimiter).toBe(',');
        expect(result.rows).toEqual([
            { code: 'C1', language: 'en', text: 'Hello' },
            { code: 'C2', language: 'fr', text: 'Bonjour' },
        ]);
    });

    it('auto-detects tab delimiter', () => {
        const tsv = 'code\tlanguage\ttext\nC1\ten\tHello\n';
        const result = parseConcourseCsv(tsv);
        expect(result.delimiter).toBe('\t');
        expect(result.rows).toHaveLength(1);
        expect(result.rows[0]).toEqual({ code: 'C1', language: 'en', text: 'Hello' });
    });

    it('is case-insensitive on header names and normalises language code', () => {
        const csv = 'Code,LANGUAGE,Text\nC1,EN,Hello\n';
        const result = parseConcourseCsv(csv);
        expect(result.errors).toEqual([]);
        // Language is normalised to lowercase so 'EN' and 'en' match study langs.
        expect(result.rows[0].language).toBe('en');
    });

    it('accepts headers in any order', () => {
        const csv = 'text,code,language\nHello,C1,en\n';
        const result = parseConcourseCsv(csv);
        expect(result.errors).toEqual([]);
        expect(result.rows[0]).toEqual({ code: 'C1', language: 'en', text: 'Hello' });
    });

    it('returns a single header-validation error when required columns are missing', () => {
        const csv = 'code,language\nC1,en\n';
        const result = parseConcourseCsv(csv);
        expect(result.errors).toEqual(['Missing required header(s): text.']);
        expect(result.rows).toEqual([]);
    });

    it('flags rows with missing required cells but keeps the valid rows', () => {
        const csv = 'code,language,text\nC1,en,Hello\n,en,Orphan\nC3,en,\n';
        const result = parseConcourseCsv(csv);
        // First row OK; second missing code; third missing text.
        expect(result.rows).toEqual([{ code: 'C1', language: 'en', text: 'Hello' }]);
        expect(result.errors).toEqual(['Row 3: missing code.', 'Row 4: missing text.']);
    });

    it('handles empty input gracefully', () => {
        const result = parseConcourseCsv('   \n\n');
        expect(result.rows).toEqual([]);
        expect(result.errors).toEqual(['Input is empty.']);
    });

    it('preserves quoted statements containing commas and newlines', () => {
        const csv = 'code,language,text\nC1,en,"Yes, it is.\nReally."\n';
        const result = parseConcourseCsv(csv);
        expect(result.errors).toEqual([]);
        expect(result.rows[0].text).toBe('Yes, it is.\nReally.');
    });
});
