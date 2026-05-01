import { describe, expect, it } from 'vitest';

import {
    buildQuestionnaireSchema,
    type QuestionnaireField,
    type TranslateFn,
} from './buildQuestionnaireSchema';

// Identity translator — return the key so error messages are stable for assertions.
// Cast through `unknown` because i18next's TFunction has overloaded signatures
// that we don't reproduce here; the builder only uses the `(key, options?)` shape.
const t = ((key: string) => key) as unknown as TranslateFn;

const Q = (overrides: Partial<QuestionnaireField> & { type: QuestionnaireField['type'] }) =>
    overrides as QuestionnaireField;

describe('buildQuestionnaireSchema', () => {
    describe('hidden fields (visibility_condition false)', () => {
        it('skips validation when condition is not met', () => {
            const questions = {
                gender: Q({ type: 'select', required: true }),
                pregnancy_weeks: Q({
                    type: 'number',
                    required: true,
                    visibility_condition: {
                        depends_on: 'gender',
                        operator: 'equals',
                        value: 'female',
                    },
                }),
            };
            const schema = buildQuestionnaireSchema(questions, { gender: 'male' }, t);

            // pregnancy_weeks is hidden → any value passes (including missing).
            expect(schema.safeParse({ gender: 'male' }).success).toBe(true);
            expect(
                schema.safeParse({ gender: 'male', pregnancy_weeks: 'not a number' }).success
            ).toBe(true);
        });

        it('enforces validation when condition is met', () => {
            const questions = {
                gender: Q({ type: 'select', required: true }),
                pregnancy_weeks: Q({
                    type: 'number',
                    required: true,
                    visibility_condition: {
                        depends_on: 'gender',
                        operator: 'equals',
                        value: 'female',
                    },
                }),
            };
            const schema = buildQuestionnaireSchema(questions, { gender: 'female' }, t);

            // Visible required → missing fails.
            expect(schema.safeParse({ gender: 'female' }).success).toBe(false);
            expect(schema.safeParse({ gender: 'female', pregnancy_weeks: 12 }).success).toBe(true);
        });
    });

    describe('required fields', () => {
        it('text rejects empty string and accepts non-empty', () => {
            const schema = buildQuestionnaireSchema(
                { name: Q({ type: 'text', required: true }) },
                {},
                t
            );
            expect(schema.safeParse({ name: '' }).success).toBe(false);
            expect(schema.safeParse({ name: 'Alice' }).success).toBe(true);
        });

        it('text enforces minLength / maxLength', () => {
            const schema = buildQuestionnaireSchema(
                { code: Q({ type: 'text', required: true, minLength: 3, maxLength: 5 }) },
                {},
                t
            );
            expect(schema.safeParse({ code: 'ab' }).success).toBe(false);
            expect(schema.safeParse({ code: 'abc' }).success).toBe(true);
            expect(schema.safeParse({ code: 'abcdef' }).success).toBe(false);
        });

        it('email validates format', () => {
            const schema = buildQuestionnaireSchema(
                { addr: Q({ type: 'email', required: true }) },
                {},
                t
            );
            expect(schema.safeParse({ addr: 'not-an-email' }).success).toBe(false);
            expect(schema.safeParse({ addr: 'user@example.com' }).success).toBe(true);
        });

        it('number coerces strings, applies min/max', () => {
            const schema = buildQuestionnaireSchema(
                { age: Q({ type: 'number', required: true, min: 18, max: 65 }) },
                {},
                t
            );
            expect(schema.safeParse({ age: '17' }).success).toBe(false);
            expect(schema.safeParse({ age: '30' }).success).toBe(true);
            expect(schema.safeParse({ age: 70 }).success).toBe(false);
            expect(schema.safeParse({ age: '' }).success).toBe(false);
        });

        it('checkbox requires at least one selection', () => {
            const schema = buildQuestionnaireSchema(
                { topics: Q({ type: 'checkbox', required: true }) },
                {},
                t
            );
            expect(schema.safeParse({ topics: [] }).success).toBe(false);
            expect(schema.safeParse({ topics: ['a'] }).success).toBe(true);
        });

        it('text_audio leaves the text optional (audio enforced elsewhere)', () => {
            const schema = buildQuestionnaireSchema(
                { feedback: Q({ type: 'text_audio', required: true }) },
                {},
                t
            );
            // Text part is genuinely optional; presence of audio is checked outside the schema.
            expect(schema.safeParse({ feedback: '' }).success).toBe(true);
            expect(schema.safeParse({ feedback: null }).success).toBe(true);
            expect(schema.safeParse({ feedback: 'something' }).success).toBe(true);
        });
    });

    describe('optional fields', () => {
        it('text accepts empty / null / undefined', () => {
            const schema = buildQuestionnaireSchema(
                { note: Q({ type: 'text', required: false }) },
                {},
                t
            );
            expect(schema.safeParse({ note: '' }).success).toBe(true);
            expect(schema.safeParse({ note: null }).success).toBe(true);
            expect(schema.safeParse({}).success).toBe(true);
            expect(schema.safeParse({ note: 'hello' }).success).toBe(true);
        });

        it('email accepts empty but rejects malformed when present', () => {
            const schema = buildQuestionnaireSchema(
                { addr: Q({ type: 'email', required: false }) },
                {},
                t
            );
            expect(schema.safeParse({ addr: '' }).success).toBe(true);
            expect(schema.safeParse({ addr: null }).success).toBe(true);
            expect(schema.safeParse({ addr: 'user@example.com' }).success).toBe(true);
            expect(schema.safeParse({ addr: 'not-an-email' }).success).toBe(false);
        });

        it('number accepts empty / null and validates type otherwise', () => {
            const schema = buildQuestionnaireSchema(
                { age: Q({ type: 'number', required: false }) },
                {},
                t
            );
            expect(schema.safeParse({ age: '' }).success).toBe(true);
            expect(schema.safeParse({ age: null }).success).toBe(true);
            expect(schema.safeParse({ age: '30' }).success).toBe(true);
            expect(schema.safeParse({ age: 30 }).success).toBe(true);
        });

        it('checkbox accepts empty / null', () => {
            const schema = buildQuestionnaireSchema(
                { topics: Q({ type: 'checkbox', required: false }) },
                {},
                t
            );
            expect(schema.safeParse({ topics: [] }).success).toBe(true);
            expect(schema.safeParse({ topics: null }).success).toBe(true);
            expect(schema.safeParse({ topics: ['a'] }).success).toBe(true);
        });
    });

    describe('shape integrity', () => {
        it('returns a ZodObject containing every key from the input map', () => {
            const questions = {
                a: Q({ type: 'text', required: true }),
                b: Q({ type: 'number', required: false }),
                c: Q({ type: 'checkbox', required: true }),
            };
            const schema = buildQuestionnaireSchema(questions, {}, t);
            expect(Object.keys(schema.shape).sort()).toEqual(['a', 'b', 'c']);
        });
    });
});
