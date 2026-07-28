import { describe, it, expect, vi } from 'vitest';
import {
    resolveAnswerLabel,
    resolveAudioQuestionLabel,
    resolveOptionText,
    buildQuestionsMap,
    classifyAnswerKey,
} from './SurveyResponseTable.helpers';
import type { TFunction } from 'i18next';

// ---------------------------------------------------------------------------
// Minimal TFunction mock
// ---------------------------------------------------------------------------

const t = vi.fn((_key: string, fallback: string) => fallback) as unknown as TFunction;

// ---------------------------------------------------------------------------
// resolveAnswerLabel
// ---------------------------------------------------------------------------

describe('resolveAnswerLabel', () => {
    it('returns localized label from questionsMap when key is present', () => {
        const map = { q1: { id: 'q1', label: 'My question' } };
        // getLocalizedText with a plain string label returns the string itself
        const result = resolveAnswerLabel(map, 'q1', 'en', t);
        expect(result).toBe('My question');
    });

    it('returns t() fallback for special key "email"', () => {
        expect(resolveAnswerLabel({}, 'email', 'en', t)).toBe('Email Address');
    });

    it('returns t() fallback for "interview_consent"', () => {
        expect(resolveAnswerLabel({}, 'interview_consent', 'en', t)).toBe('Follow-up');
    });

    it('returns t() fallback for "newsletter_consent"', () => {
        expect(resolveAnswerLabel({}, 'newsletter_consent', 'en', t)).toBe('Results');
    });

    it('returns t() fallback for "_recruitment_token"', () => {
        expect(resolveAnswerLabel({}, '_recruitment_token', 'en', t)).toBe('Recruitment token');
    });

    it('returns t() fallback for "missing_statement"', () => {
        expect(resolveAnswerLabel({}, 'missing_statement', 'en', t)).toBe('Missing Statement');
    });

    it('returns t() fallback for "general_comment"', () => {
        expect(resolveAnswerLabel({}, 'general_comment', 'en', t)).toBe('General Comment');
    });

    it('returns a generic fallback — never the raw key — when no match found', () => {
        const result = resolveAnswerLabel({}, 'unknown_key', 'en', t);
        expect(result).not.toBe('unknown_key');
        expect(result).toBe('Response');
    });

    it('returns a generic fallback — never the raw key — when the matched entry has no label or text', () => {
        // A config entry exists for this key (e.g. a legacy/malformed
        // question config), but it carries neither a label nor a text
        // field. This must degrade the same way as a missing entry, not
        // leak the key via getLocalizedText's own fallback parameter.
        const map = { q1: { id: 'q1' } };
        const result = resolveAnswerLabel(map, 'q1', 'en', t);
        expect(result).not.toBe('q1');
        expect(result).toBe('Response');
    });
});

// ---------------------------------------------------------------------------
// resolveAudioQuestionLabel
// ---------------------------------------------------------------------------

describe('resolveAudioQuestionLabel', () => {
    const GENERIC = 'Spoken comment';

    it('strips the storage "question_" prefix before looking the id up', () => {
        // Recordings are stored as "question_<id>" while postsort_config is
        // keyed by the bare id — the prefix must not defeat the lookup.
        const map = {
            q_voice: { id: 'q_voice', label: { en: 'Record a short spoken comment.' } },
        };
        expect(resolveAudioQuestionLabel(map, 'question_q_voice', 'en', GENERIC)).toBe(
            'Record a short spoken comment.'
        );
    });

    it('resolves an unprefixed key too', () => {
        const map = { q_voice: { id: 'q_voice', label: { en: 'Record a short comment.' } } };
        expect(resolveAudioQuestionLabel(map, 'q_voice', 'en', GENERIC)).toBe(
            'Record a short comment.'
        );
    });

    it('returns the requested language, not just English', () => {
        const map = {
            q_voice: {
                id: 'q_voice',
                label: { en: 'Record a short comment.', fr: 'Enregistrez un bref commentaire.' },
            },
        };
        expect(resolveAudioQuestionLabel(map, 'question_q_voice', 'fr', GENERIC)).toBe(
            'Enregistrez un bref commentaire.'
        );
    });

    it('falls back to `text` when the entry has no `label`', () => {
        const map = { q_voice: { id: 'q_voice', text: 'Legacy text field' } };
        expect(resolveAudioQuestionLabel(map, 'question_q_voice', 'en', GENERIC)).toBe(
            'Legacy text field'
        );
    });

    it('returns the generic fallback — never the key — when the question is gone', () => {
        // A populated map that simply lacks this id: the question was deleted
        // after the participant answered.
        const map = { q_other: { id: 'q_other', label: { en: 'A different question' } } };
        const result = resolveAudioQuestionLabel(map, 'question_q_1737849283000', 'en', GENERIC);
        expect(result).not.toBe('question_q_1737849283000');
        expect(result).not.toBe('q_1737849283000');
        expect(result).toBe(GENERIC);
    });

    it('returns the generic fallback when the entry carries neither label nor text', () => {
        const map = { q_voice: { id: 'q_voice' } };
        const result = resolveAudioQuestionLabel(map, 'question_q_voice', 'en', GENERIC);
        expect(result).not.toBe('q_voice');
        expect(result).toBe(GENERIC);
    });
});

// ---------------------------------------------------------------------------
// resolveOptionText
// ---------------------------------------------------------------------------

describe('resolveOptionText', () => {
    it('matches simple string option and returns it', () => {
        const options = ['yes', 'no', 'maybe'];
        expect(resolveOptionText(options, 'yes', 'en')).toBe('yes');
    });

    it('matches object option by value and returns localized label', () => {
        const options = [
            { value: '1', label: 'One' },
            { value: '2', label: 'Two' },
        ];
        expect(resolveOptionText(options, '1', 'en')).toBe('One');
    });

    it('coerces numeric val to string for object comparison', () => {
        const options = [{ value: '3', label: 'Three' }];
        expect(resolveOptionText(options, 3, 'en')).toBe('Three');
    });

    it('returns String(val) when no option matches', () => {
        expect(resolveOptionText([{ value: 'x', label: 'X' }], 'z', 'en')).toBe('z');
    });

    it('returns String(val) for empty options array', () => {
        expect(resolveOptionText([], 'foo', 'en')).toBe('foo');
    });
});

// ---------------------------------------------------------------------------
// buildQuestionsMap
// ---------------------------------------------------------------------------

describe('buildQuestionsMap', () => {
    it('builds map from array of questions keyed by id', () => {
        const config = {
            questions: [
                { id: 'q1', label: 'L1' },
                { id: 'q2', label: 'L2' },
            ],
        };
        const map = buildQuestionsMap(config);
        expect(map.q1).toEqual({ id: 'q1', label: 'L1' });
        expect(map.q2).toEqual({ id: 'q2', label: 'L2' });
    });

    it('builds map from "fields" key', () => {
        const config = { fields: [{ id: 'f1', label: 'F1' }] };
        const map = buildQuestionsMap(config);
        expect(map.f1).toEqual({ id: 'f1', label: 'F1' });
    });

    it('builds map from object-style questions', () => {
        const config = { questions: { q1: { label: 'L1' } } };
        const map = buildQuestionsMap(config);
        expect(map.q1).toMatchObject({ id: 'q1', label: 'L1' });
    });

    it('returns empty map for empty config', () => {
        expect(buildQuestionsMap({})).toEqual({});
    });

    it('handles array config (flat list)', () => {
        const config = [{ id: 'a1', label: 'A1' }];
        const map = buildQuestionsMap(config as unknown as Record<string, unknown>);
        expect(map.a1).toEqual({ id: 'a1', label: 'A1' });
    });
});

// ---------------------------------------------------------------------------
// classifyAnswerKey
// ---------------------------------------------------------------------------

describe('classifyAnswerKey', () => {
    it('classifies "email" as identity', () => {
        expect(classifyAnswerKey('email')).toBe('identity');
    });

    it('classifies "interview_consent" as identity', () => {
        expect(classifyAnswerKey('interview_consent')).toBe('identity');
    });

    it('classifies "newsletter_consent" as identity', () => {
        expect(classifyAnswerKey('newsletter_consent')).toBe('identity');
    });

    it('classifies "_recruitment_token" as identity', () => {
        expect(classifyAnswerKey('_recruitment_token')).toBe('identity');
    });

    it('classifies "missing_statement" as feedback', () => {
        expect(classifyAnswerKey('missing_statement')).toBe('feedback');
    });

    it('classifies "general_comment" as feedback', () => {
        expect(classifyAnswerKey('general_comment')).toBe('feedback');
    });

    it('classifies arbitrary survey keys as questions', () => {
        expect(classifyAnswerKey('q_1')).toBe('questions');
        expect(classifyAnswerKey('age')).toBe('questions');
        expect(classifyAnswerKey('custom_field')).toBe('questions');
    });
});
