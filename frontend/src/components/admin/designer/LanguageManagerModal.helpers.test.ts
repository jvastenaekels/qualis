import { describe, it, expect } from 'vitest';
import { applyLanguageRestore, applyLanguageInit } from './LanguageManagerModal.helpers';

describe('applyLanguageRestore', () => {
    it('does nothing when the language is not in original.translations', () => {
        const draft = { translations: [], statements: [] };
        const original = { translations: [], statements: [] };
        applyLanguageRestore(draft, 'fr', original);
        expect(draft.translations).toEqual([]);
    });

    it('copies the original study translation with _is_copy=false', () => {
        const draft = { translations: [], statements: [] };
        const original = {
            translations: [{ language_code: 'fr', title: 'Titre', _is_copy: true }],
            statements: [],
        };
        applyLanguageRestore(draft, 'fr', original);
        expect(draft.translations).toHaveLength(1);
        const t = draft.translations[0] as {
            language_code: string;
            title: string;
            _is_copy: boolean;
        };
        expect(t.language_code).toBe('fr');
        expect(t.title).toBe('Titre');
        expect(t._is_copy).toBe(false);
    });

    it('copies original statement translations matching by code', () => {
        const draft = {
            translations: [],
            statements: [{ code: 'S1', translations: [] }],
        };
        const original = {
            translations: [{ language_code: 'fr', title: 'Titre' }],
            statements: [{ code: 'S1', translations: [{ language_code: 'fr', text: 'Énoncé 1' }] }],
        };
        applyLanguageRestore(draft, 'fr', original);
        const stmt = draft.statements[0] as {
            translations: { language_code: string; text: string }[];
        };
        expect(stmt.translations).toHaveLength(1);
        expect(stmt.translations[0]).toEqual({ language_code: 'fr', text: 'Énoncé 1' });
    });

    it('seeds empty text when statement is new (no original by that code)', () => {
        const draft = {
            translations: [],
            statements: [{ code: 'S_NEW', translations: [] }],
        };
        const original = {
            translations: [{ language_code: 'fr', title: 'Titre' }],
            statements: [{ code: 'S1', translations: [{ language_code: 'fr', text: 'X' }] }],
        };
        applyLanguageRestore(draft, 'fr', original);
        const stmt = draft.statements[0] as { translations: { text: string }[] };
        expect(stmt.translations[0]?.text).toBe('');
    });

    it('seeds empty text when statement matches but has no translation in lang', () => {
        const draft = {
            translations: [],
            statements: [{ code: 'S1', translations: [] }],
        };
        const original = {
            translations: [{ language_code: 'fr', title: 'Titre' }],
            statements: [{ code: 'S1', translations: [{ language_code: 'en', text: 'X' }] }],
        };
        applyLanguageRestore(draft, 'fr', original);
        const stmt = draft.statements[0] as { translations: { text: string }[] };
        expect(stmt.translations[0]?.text).toBe('');
    });

    it('initialises stmt.translations array when missing', () => {
        const draft = {
            translations: [],
            statements: [{ code: 'S1' }],
        };
        const original = {
            translations: [{ language_code: 'fr' }],
            statements: [{ code: 'S1', translations: [{ language_code: 'fr', text: 'X' }] }],
        };
        applyLanguageRestore(draft, 'fr', original);
        const stmt = draft.statements[0] as { translations: unknown[] };
        expect(Array.isArray(stmt.translations)).toBe(true);
        expect(stmt.translations).toHaveLength(1);
    });
});

describe('applyLanguageInit', () => {
    it('adds the language with empty fields when not present', () => {
        const draft = { translations: [], statements: [] };
        applyLanguageInit(draft, 'fr');
        expect(draft.translations).toHaveLength(1);
        const t = draft.translations[0] as { language_code: string; title: string };
        expect(t.language_code).toBe('fr');
        expect(t.title).toBe('');
    });

    it('is idempotent on study translations (skips if exists)', () => {
        const draft = {
            translations: [{ language_code: 'fr', title: 'Existing' }],
            statements: [],
        };
        applyLanguageInit(draft, 'fr');
        expect(draft.translations).toHaveLength(1);
        const t = draft.translations[0] as { title: string };
        expect(t.title).toBe('Existing');
    });

    it('seeds empty text on every statement', () => {
        const draft = {
            translations: [],
            statements: [
                { code: 'S1', translations: [] },
                { code: 'S2', translations: [{ language_code: 'en', text: 'X' }] },
            ],
        };
        applyLanguageInit(draft, 'fr');
        const s1 = draft.statements[0] as {
            translations: { language_code: string; text: string }[];
        };
        const s2 = draft.statements[1] as {
            translations: { language_code: string; text: string }[];
        };
        expect(s1.translations).toHaveLength(1);
        expect(s1.translations[0]?.language_code).toBe('fr');
        expect(s2.translations).toHaveLength(2);
    });

    it('skips per-statement push when already present', () => {
        const draft = {
            translations: [],
            statements: [{ code: 'S1', translations: [{ language_code: 'fr', text: 'Already' }] }],
        };
        applyLanguageInit(draft, 'fr');
        const s = draft.statements[0] as { translations: { text: string }[] };
        expect(s.translations).toHaveLength(1);
        expect(s.translations[0]?.text).toBe('Already');
    });

    it('initialises stmt.translations array when missing', () => {
        const draft = {
            translations: [],
            statements: [{ code: 'S1' }],
        };
        applyLanguageInit(draft, 'fr');
        const s = draft.statements[0] as { translations: unknown[] };
        expect(Array.isArray(s.translations)).toBe(true);
    });
});
