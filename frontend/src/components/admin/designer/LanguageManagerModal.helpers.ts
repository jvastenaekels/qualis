/**
 * Helpers for activating a language on a study draft. Two strategies:
 * - `applyLanguageRestore`: re-add a previously-saved language by copying
 *   translation objects (study + statements) from the saved `original`.
 * - `applyLanguageInit`: add a brand-new language with empty fields and
 *   empty statement translations.
 *
 * Both helpers mutate `draft` in place.
 */

/** Minimal structural shape a study translation entry must have for spread-copy. */
type TranslationEntry = { language_code: string };
/** Minimal structural shape a statement must have for language patching. */
type StatementLike = {
    code: string;
    translations?: { language_code: string; text: string }[] | null;
};

/** Minimal structural shape the draft must satisfy for language operations. */
type DraftLike = {
    translations?: TranslationEntry[] | null;
    statements?: StatementLike[] | null;
};

/** Minimal structural shape from the read-only original. */
type OriginalLike =
    | {
          translations?: TranslationEntry[] | null;
          statements?: StatementLike[] | null;
      }
    | null
    | undefined;

function ensureTranslationsArray(
    draft: DraftLike
): asserts draft is DraftLike & { translations: TranslationEntry[] } {
    if (!Array.isArray(draft.translations)) {
        draft.translations = [];
    }
}

function ensureStatementsArray(
    draft: DraftLike
): asserts draft is DraftLike & { statements: StatementLike[] } {
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
export function applyLanguageRestore(
    draft: DraftLike,
    langCode: string,
    original: OriginalLike
): void {
    const existingStudyTrans = original?.translations?.find((t) => t.language_code === langCode);
    if (!existingStudyTrans) return;

    ensureTranslationsArray(draft);
    draft.translations.push({ ...existingStudyTrans, _is_copy: false } as TranslationEntry);

    ensureStatementsArray(draft);
    for (const stmt of draft.statements) {
        if (!Array.isArray(stmt.translations)) stmt.translations = [];
        const originalStmt = original?.statements?.find((os) => os.code === stmt.code);
        const originalStmtTrans = originalStmt?.translations?.find(
            (st) => st.language_code === langCode
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
export function applyLanguageInit(draft: DraftLike, langCode: string): void {
    ensureTranslationsArray(draft);
    const exists = draft.translations.some((t) => t.language_code === langCode);
    if (!exists) {
        draft.translations.push({
            language_code: langCode,
            title: '',
            subtitle: '',
            description: '',
            instructions: '',
            condition_of_instruction: '',
        } as TranslationEntry);
    }

    ensureStatementsArray(draft);
    for (const stmt of draft.statements) {
        if (!Array.isArray(stmt.translations)) stmt.translations = [];
        const hasTrans = stmt.translations.some((st) => st.language_code === langCode);
        if (!hasTrans) {
            stmt.translations.push({ language_code: langCode, text: '' });
        }
    }
}
