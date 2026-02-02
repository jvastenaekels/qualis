import { describe, it, expect } from 'vitest';
import { evaluateVisibilityCondition } from './visibilityEvaluator';

describe('evaluateVisibilityCondition', () => {
    it('should return true when values match exactly', () => {
        const result = evaluateVisibilityCondition(
            { depends_on: 'q1', operator: 'equals', value: 'Yes' },
            { q1: 'Yes' }
        );
        expect(result).toBe(true);
    });

    it('should return false when values do not match', () => {
        const result = evaluateVisibilityCondition(
            { depends_on: 'q1', operator: 'equals', value: 'Yes' },
            { q1: 'No' }
        );
        expect(result).toBe(false);
    });

    it('should return true for numeric string comparison (loose equality)', () => {
        const result = evaluateVisibilityCondition(
            { depends_on: 'q1', operator: 'equals', value: '10' },
            { q1: 10 }
        );
        expect(result).toBe(true);
    });

    it('should match against localized labels if exact match fails (Workaround)', () => {
        const questionsConfig = {
            q1: {
                type: 'radio',
                options: [
                    { value: 'yes_val', label: { en: 'Yes', fr: 'Oui' } },
                    { value: 'no_val', label: { en: 'No', fr: 'Non' } },
                ],
            },
        };

        const result = evaluateVisibilityCondition(
            { depends_on: 'q1', operator: 'equals', value: 'yes_val' },
            { q1: 'Oui' }, // User submitted "Oui" (label) instead of "yes_val"
            // biome-ignore lint/suspicious/noExplicitAny: mock config
            questionsConfig as any
        );

        // This should pass with the new logic
        expect(result).toBe(true);
    });

    it('should still fail if localized label does not match target option', () => {
        const questionsConfig = {
            q1: {
                type: 'radio',
                options: [
                    { value: 'yes_val', label: { en: 'Yes', fr: 'Oui' } },
                    { value: 'no_val', label: { en: 'No', fr: 'Non' } },
                ],
            },
        };

        const result = evaluateVisibilityCondition(
            { depends_on: 'q1', operator: 'equals', value: 'yes_val' },
            { q1: 'Non' }, // Matching "no_val" label
            // biome-ignore lint/suspicious/noExplicitAny: mock config
            questionsConfig as any
        );

        expect(result).toBe(false);
    });

    it('should match when option VALUE is localized ("Kyllä") but condition expects English LABEL ("Yes")', () => {
        // Regression test for user reported issue
        const questionsConfig = {
            q1: {
                type: 'radio',
                options: [
                    { value: 'Kyllä', label: { en: 'Yes' } },
                    { value: 'Ei', label: { en: 'No' } },
                ],
            },
        };

        const result = evaluateVisibilityCondition(
            { depends_on: 'q1', operator: 'equals', value: 'Yes' }, // Condition expects Label
            { q1: 'Kyllä' }, // Actual value is Value
            // biome-ignore lint/suspicious/noExplicitAny: mock config
            questionsConfig as any
        );

        expect(result).toBe(true);
    });
});
