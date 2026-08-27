/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

type Operator = 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than';

interface VisibilityCondition {
    depends_on: string;
    operator: Operator;
    value?: unknown;
}

// biome-ignore lint/suspicious/noExplicitAny: form values can be anything
type FormValues = Record<string, any>;
// biome-ignore lint/suspicious/noExplicitAny: config structure is dynamic
type QuestionsConfig = Record<string, any>;

/** Comparison when the actual value is empty (undefined / null / ''). */
function evaluateEmpty(operator: Operator, actualValue: unknown, targetValue: unknown): boolean {
    if (operator === 'not_equals') {
        return String(actualValue) !== String(targetValue);
    }
    return false;
}

/**
 * Standard scalar/array comparison.
 * Returns true|false for terminal operators (contains/greater_than/less_than/not_equals),
 * and 'fallback' for `equals` when the strict comparison failed (caller may try
 * the localized-label fallback).
 */
function compareValues(
    operator: Operator,
    actualValue: unknown,
    targetValue: unknown
): boolean | 'fallback' {
    const actualStr = String(actualValue);
    const targetStr = String(targetValue);

    switch (operator) {
        case 'equals':
            return actualStr === targetStr ? true : 'fallback';
        case 'not_equals':
            return actualStr !== targetStr;
        case 'contains':
            if (Array.isArray(actualValue)) return actualValue.includes(targetValue);
            if (typeof actualValue === 'string') return actualValue.includes(targetStr);
            return false;
        case 'greater_than':
            return Number(actualValue) > Number(targetValue);
        case 'less_than':
            return Number(actualValue) < Number(targetValue);
        default:
            return true;
    }
}

/**
 * Fallback for `equals` when the strict comparison failed.
 *
 * Handles two scenarios where condition target and submitted value disagree on
 * value-vs-label representation of the same option:
 *  A) Config has internal id ("yes_val") but user submitted localized label ("Oui").
 *  B) Config has localized value ("Kyllä") but condition references the English label ("Yes").
 *
 * Returns true iff condition.value and the submitted value resolve to the same option.
 */
function matchLocalizedOption(
    questionsConfig: QuestionsConfig | undefined,
    dependsOn: string,
    targetValue: unknown,
    actualValue: unknown
): boolean {
    if (!questionsConfig || typeof targetValue !== 'string' || typeof actualValue !== 'string') {
        return false;
    }
    const question = questionsConfig[dependsOn];
    if (!question || !Array.isArray(question.options)) return false;

    // biome-ignore lint/suspicious/noExplicitAny: dynamic option type
    const optionMatchesValue = (opt: any, candidate: string): boolean => {
        const optVal = typeof opt === 'string' ? opt : opt.value;
        if (String(optVal) === candidate) return true;
        if (typeof opt === 'object' && opt.label) {
            return Object.values(opt.label).some((l) => String(l) === candidate);
        }
        return false;
    };

    const targetOption = question.options.find(
        // biome-ignore lint/suspicious/noExplicitAny: dynamic option type
        (opt: any) => optionMatchesValue(opt, String(targetValue))
    );
    if (!targetOption) return false;

    return optionMatchesValue(targetOption, String(actualValue));
}

/**
 * Evaluates a visibility condition against current form values.
 *
 * @param condition The visibility condition to check
 * @param values The current form values
 * @param questionsConfig Optional configuration of all questions to resolve localized options
 * @returns true if the condition is met, false otherwise
 */
export function evaluateVisibilityCondition(
    condition: VisibilityCondition | undefined,
    values: FormValues,
    questionsConfig?: QuestionsConfig
): boolean {
    if (!condition) return true;

    const actualValue = values[condition.depends_on];
    const targetValue = condition.value;

    if (actualValue === undefined || actualValue === null || actualValue === '') {
        return evaluateEmpty(condition.operator, actualValue, targetValue);
    }

    const result = compareValues(condition.operator, actualValue, targetValue);
    if (result !== 'fallback') return result;

    return matchLocalizedOption(questionsConfig, condition.depends_on, targetValue, actualValue);
}
