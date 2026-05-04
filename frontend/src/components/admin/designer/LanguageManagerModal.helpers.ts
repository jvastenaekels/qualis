/**
 * Helpers for activating a language on a study draft. Two strategies:
 * - `applyLanguageRestore`: re-add a previously-saved language by copying
 *   translation objects (study + statements) from the saved `original`.
 * - `applyLanguageInit`: add a brand-new language with empty fields and
 *   empty statement translations.
 *
 * Both helpers mutate `draft` in place. The signatures use `any` because the
 * Zustand store's `updateDraft` is typed `(d: any) => void` (load-bearing
 * dynamic JSON shapes — see CLAUDE.md project conventions).
 */

// biome-ignore lint/suspicious/noExplicitAny: load-bearing dynamic study draft shape
type Draft = any;
// biome-ignore lint/suspicious/noExplicitAny: load-bearing dynamic study read shape
type Original = any;

function ensureTranslationsArray(draft: Draft): void {
    if (!Array.isArray(draft.translations)) {
        draft.translations = [];
    }
}

function ensureStatementsArray(draft: Draft): void {
    if (!Array.isArray(draft.statements)) {
        draft.statements = [];
    }
}

/**
 * Restore a previously-saved language: copy the saved study translation
 * (clearing any `_is_copy` flag), then for each statement copy the matching
 * saved statement translation; if the statement is new (no original), seed
 * an empty translation entry.
 */
export function applyLanguageRestore(draft: Draft, langCode: string, original: Original): void {
    const existingStudyTrans = original?.translations?.find(
        // biome-ignore lint/suspicious/noExplicitAny: dynamic translation shape
        (t: any) => t.language_code === langCode
    );
    if (!existingStudyTrans) return;

    ensureTranslationsArray(draft);
    draft.translations.push({ ...existingStudyTrans, _is_copy: false });

    ensureStatementsArray(draft);
    for (const stmt of draft.statements) {
        if (!Array.isArray(stmt.translations)) stmt.translations = [];
        const originalStmt = original?.statements?.find(
            // biome-ignore lint/suspicious/noExplicitAny: dynamic statement shape
            (os: any) => os.code === stmt.code
        );
        const originalStmtTrans = originalStmt?.translations?.find(
            // biome-ignore lint/suspicious/noExplicitAny: dynamic statement-translation shape
            (st: any) => st.language_code === langCode
        );
        stmt.translations.push({
            language_code: langCode,
            text: originalStmtTrans?.text ?? '',
        });
    }
}

/**
 * Add a new language to the draft with empty study fields and empty
 * per-statement translations. Idempotent: skips if the language already
 * exists on the study or on a given statement.
 */
export function applyLanguageInit(draft: Draft, langCode: string): void {
    ensureTranslationsArray(draft);
    const exists = draft.translations.some(
        // biome-ignore lint/suspicious/noExplicitAny: dynamic translation shape
        (t: any) => t.language_code === langCode
    );
    if (!exists) {
        draft.translations.push({
            language_code: langCode,
            title: '',
            subtitle: '',
            description: '',
            instructions: '',
            condition_of_instruction: '',
        });
    }

    ensureStatementsArray(draft);
    for (const stmt of draft.statements) {
        if (!Array.isArray(stmt.translations)) stmt.translations = [];
        const hasTrans = stmt.translations.some(
            // biome-ignore lint/suspicious/noExplicitAny: dynamic statement-translation shape
            (st: any) => st.language_code === langCode
        );
        if (!hasTrans) {
            stmt.translations.push({ language_code: langCode, text: '' });
        }
    }
}
