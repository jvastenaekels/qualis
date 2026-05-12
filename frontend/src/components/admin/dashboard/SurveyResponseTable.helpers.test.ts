import { describe, it, expect, vi } from 'vitest';
import {
    resolveAnswerLabel,
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
        expect(resolveAnswerLabel({}, '_recruitment_token', 'en', t)).toBe('Ref');
    });

    it('returns t() fallback for "missing_statement"', () => {
        expect(resolveAnswerLabel({}, 'missing_statement', 'en', t)).toBe('Missing Statement');
    });

    it('returns t() fallback for "general_comment"', () => {
        expect(resolveAnswerLabel({}, 'general_comment', 'en', t)).toBe('General Comment');
    });

    it('returns raw key when no match found', () => {
        expect(resolveAnswerLabel({}, 'unknown_key', 'en', t)).toBe('unknown_key');
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
