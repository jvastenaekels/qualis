import { getLocalizedText } from '@/utils/localization';
import type { TFunction } from 'i18next';

// ---------------------------------------------------------------------------
// Label resolver
// ---------------------------------------------------------------------------

/**
 * Returns a human-readable label for a survey answer key.
 * Falls back to the raw key when no match is found.
 */
export function resolveAnswerLabel(
    questionsMap: Record<string, QuestionMapEntry>,
    key: string,
    language: string,
    t: TFunction
): string {
    const q = questionsMap[key];
    if (q) {
        // label/text are typed as string | Record<string,string> | undefined —
        // both are valid inputs for getLocalizedText.
        return getLocalizedText(q.label || q.text, language, key);
    }
    if (key === 'email') return t('post.contact.email_label', 'Email Address');
    if (key === 'interview_consent') return t('post.contact.interview_consent', 'Follow-up');
    if (key === 'newsletter_consent') return t('post.contact.newsletter_consent', 'Results');
    if (key === '_recruitment_token')
        return t('admin.participant.metadata.recruitment_token', 'Ref');
    if (key === 'missing_statement')
        return t('post.extreme.missing_statement', 'Missing Statement');
    if (key === 'general_comment') return t('post.extreme.general_comment', 'General Comment');
    return key;
}

// ---------------------------------------------------------------------------
// Option resolver (pure, no React)
// ---------------------------------------------------------------------------

/**
 * Resolves a single option value to a display string.
 */
export function resolveOptionText(
    options: unknown[],
    val: string | number,
    language: string
): string {
    const opt = options.find((o: unknown) =>
        typeof o === 'object' && o !== null
            ? String((o as { value?: unknown }).value) === String(val)
            : String(o) === String(val)
    );
    if (opt) {
        if (typeof opt === 'object' && opt !== null) {
            const rawLabel = (opt as { label?: unknown }).label;
            const localizable =
                typeof rawLabel === 'string' || (typeof rawLabel === 'object' && rawLabel !== null)
                    ? (rawLabel as string | Record<string, string>)
                    : undefined;
            return getLocalizedText(localizable, language, String(val));
        }
        return String(opt);
    }
    return String(val);
}

// ---------------------------------------------------------------------------
// Questions map builder
// ---------------------------------------------------------------------------

/** Shared narrow type for config objects that may carry questions or fields. */
type ConfigWithQuestionsOrFields = {
    questions?: unknown;
    fields?: unknown;
};

/**
 * A question-config entry with named label/text/options fields plus an open
 * index signature. Named fields give downstream code typed access without
 * needing `any`; the index signature keeps the type compatible with
 * `Record<string, any>` consumers (e.g. renderValue in SurveyResponseTable).
 */
type QuestionMapEntry = {
    label?: string | Record<string, string>;
    text?: string | Record<string, string>;
    options?: unknown[];
    id?: unknown;
    [k: string]: unknown;
};

/**
 * Builds a lookup map from the study's presort/postsort config.
 */
export function buildQuestionsMap(
    config: Record<string, unknown>
): Record<string, QuestionMapEntry> {
    const cfg = config as ConfigWithQuestionsOrFields;
    const rawQuestions = cfg?.questions || cfg?.fields || (Array.isArray(config) ? config : []);

    const map: Record<string, QuestionMapEntry> = {};
    if (Array.isArray(rawQuestions)) {
        for (const q of rawQuestions) {
            const entry = q as QuestionMapEntry;
            map[String(entry.id)] = entry;
        }
    } else if (typeof rawQuestions === 'object' && rawQuestions !== null) {
        for (const [id, q] of Object.entries(rawQuestions as Record<string, unknown>)) {
            map[id] = { id, ...(q as QuestionMapEntry) };
        }
    }
    return map;
}

// ---------------------------------------------------------------------------
// Group-key classifier
// ---------------------------------------------------------------------------

type GroupId = 'identity' | 'questions' | 'comments' | 'feedback';

/**
 * Returns the group ID for a top-level answer key.
 */
export function classifyAnswerKey(key: string): GroupId {
    if (
        key === 'email' ||
        key === 'interview_consent' ||
        key === 'newsletter_consent' ||
        key === '_recruitment_token'
    ) {
        return 'identity';
    }
    if (key === 'missing_statement' || key === 'general_comment') {
        return 'feedback';
    }
    return 'questions';
}
