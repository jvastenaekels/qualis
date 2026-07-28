import { getLocalizedText } from '@/utils/localization';
import type { TFunction } from 'i18next';

// ---------------------------------------------------------------------------
// Label resolver
// ---------------------------------------------------------------------------

/**
 * Returns a human-readable label for a survey answer key.
 *
 * Resolution order: the study's own question config, then the small set of
 * built-in keys, then a generic label. The raw key is never returned — it is
 * an internal identifier that must not be shown to the researcher.
 */
export function resolveAnswerLabel(
    questionsMap: Record<string, QuestionMapEntry>,
    key: string,
    language: string,
    t: TFunction
): string {
    // Generic, honest fallback for a key that cannot be resolved to a real
    // question label — e.g. a researcher-generated key (see
    // QuestionBuilder.tsx) whose config entry no longer exists (the question
    // was edited or removed after the participant answered). Never fall back
    // to the raw key itself: that leaks an internal identifier to the
    // researcher (same defect class as the audio-recording labels above).
    const genericFallback = t('admin.participant.survey.answer_default', 'Response');
    const q = questionsMap[key];
    if (q) {
        // label/text are typed as string | Record<string,string> | undefined —
        // both are valid inputs for getLocalizedText.
        return getLocalizedText(q.label || q.text, language, genericFallback);
    }
    if (key === 'email') return t('post.contact.email_label', 'Email Address');
    if (key === 'interview_consent') return t('post.contact.interview_consent', 'Follow-up');
    if (key === 'newsletter_consent') return t('post.contact.newsletter_consent', 'Results');
    if (key === '_recruitment_token')
        return t('admin.participant.metadata.recruitment_token', 'Recruitment token');
    if (key === 'missing_statement')
        return t('post.extreme.missing_statement', 'Missing Statement');
    if (key === 'general_comment') return t('post.extreme.general_comment', 'General Comment');
    return genericFallback;
}

// ---------------------------------------------------------------------------
// Audio-recording label resolver
// ---------------------------------------------------------------------------

/**
 * Prefix the upload path adds to a researcher-configured question id when it
 * stores an audio recording (see Step2_Questionnaire.tsx / seed_demo.py).
 */
const AUDIO_QUESTION_KEY_PREFIX = 'question_';

/**
 * Returns a human-readable label for a post-sort *audio* recording key.
 *
 * The participant-facing wording lives in the study's own
 * `postsort_config.questions[<id>].label` — a MultilangString the researcher
 * wrote in QuestionBuilder. Recordings are stored under that id prefixed with
 * `question_`, so strip the prefix before the lookup. `genericFallback` is
 * used only when the question can no longer be found (e.g. it was deleted
 * after the participant answered); the raw, internal id is never returned.
 *
 * Shared by the participant Post-Sort tab and the analysis Voices panel so
 * that one recording is named the same way on both screens.
 */
export function resolveAudioQuestionLabel(
    questionsMap: Record<string, QuestionMapEntry>,
    key: string,
    language: string,
    genericFallback: string
): string {
    const configKey = key.startsWith(AUDIO_QUESTION_KEY_PREFIX)
        ? key.slice(AUDIO_QUESTION_KEY_PREFIX.length)
        : key;
    const question = questionsMap[configKey];
    // label/text are typed as string | Record<string,string> | undefined —
    // both are valid inputs for getLocalizedText.
    return getLocalizedText(question?.label || question?.text, language, genericFallback);
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
export type QuestionMapEntry = {
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
