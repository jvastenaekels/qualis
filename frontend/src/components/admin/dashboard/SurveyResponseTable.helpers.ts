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
    // biome-ignore lint/suspicious/noExplicitAny: dynamic config structure
    questionsMap: Record<string, any>,
    key: string,
    language: string,
    t: TFunction
): string {
    const q = questionsMap[key];
    if (q) {
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
    // biome-ignore lint/suspicious/noExplicitAny: dynamic option structure
    options: any[],
    val: string | number,
    language: string
): string {
    // biome-ignore lint/suspicious/noExplicitAny: dynamic option structure
    const opt = options.find((o: any) =>
        typeof o === 'object' ? String(o.value) === String(val) : String(o) === String(val)
    );
    if (opt) {
        return typeof opt === 'object'
            ? getLocalizedText(opt.label, language, String(val))
            : String(opt);
    }
    return String(val);
}

// ---------------------------------------------------------------------------
// Questions map builder
// ---------------------------------------------------------------------------

/**
 * Builds a lookup map from the study's presort/postsort config.
 */
export function buildQuestionsMap(
    // biome-ignore lint/suspicious/noExplicitAny: dynamic config structure
    config: Record<string, any>
    // biome-ignore lint/suspicious/noExplicitAny: dynamic config structure
): Record<string, any> {
    // biome-ignore lint/suspicious/noExplicitAny: dynamic config
    const cfg = config as any;
    const rawQuestions = cfg?.questions || cfg?.fields || (Array.isArray(cfg) ? cfg : []);

    // biome-ignore lint/suspicious/noExplicitAny: dynamic config
    const map: Record<string, any> = {};
    if (Array.isArray(rawQuestions)) {
        for (const q of rawQuestions) {
            map[String(q.id)] = q;
        }
    } else if (typeof rawQuestions === 'object') {
        for (const [id, q] of Object.entries(rawQuestions)) {
            // biome-ignore lint/suspicious/noExplicitAny: dynamic config
            map[id] = { id, ...(q as any) };
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
