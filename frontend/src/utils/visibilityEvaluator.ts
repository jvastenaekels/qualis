/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Evaluates a visibility condition against current form values.
 *
 * @param condition The visibility condition to check
 * @param values The current form values
 * @param questionsConfig Optional configuration of all questions to resolve localized options
 * @returns true if the condition is met, false otherwise
 */
export function evaluateVisibilityCondition(
    condition:
        | {
              depends_on: string;
              operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than';
              value?: unknown;
          }
        | undefined,
    // biome-ignore lint/suspicious/noExplicitAny: form values can be anything
    values: Record<string, any>,
    // biome-ignore lint/suspicious/noExplicitAny: config structure
    questionsConfig?: Record<string, any>
): boolean {
    if (!condition) return true;

    const actualValue = values[condition.depends_on];
    const targetValue = condition.value;

    // Handle case where parent question hasn't been answered yet
    if (actualValue === undefined || actualValue === null || actualValue === '') {
        // Only allow if checking for "not_equals" a value that isn't empty/null
        if (condition.operator === 'not_equals') {
            return String(actualValue) !== String(targetValue);
        }
        return false;
    }

    // Standard comparison
    let isMatch = false;
    const actualStr = String(actualValue);
    const targetStr = String(targetValue);

    switch (condition.operator) {
        case 'equals':
            if (actualStr === targetStr) {
                isMatch = true;
            }
            break;
        case 'not_equals':
            if (actualStr !== targetStr) {
                return true;
            }
            break;
        case 'contains':
            if (Array.isArray(actualValue)) {
                return actualValue.includes(targetValue);
            }
            if (typeof actualValue === 'string') {
                return actualValue.includes(targetStr);
            }
            return false;
        case 'greater_than':
            return Number(actualValue) > Number(targetValue);
        case 'less_than':
            return Number(actualValue) < Number(targetValue);
        default:
            return true;
    }

    if (isMatch) return true;

    // Fallback: Check localized labels if standard check failed
    // This handles two scenarios:
    // A) Config has internal ID (e.g. "yes_val") but user submitted localized label ("Oui")
    // B) Config has localized Label (e.g. "Yes") but user submitted internal ID ("Kyllä")
    if (
        questionsConfig &&
        condition.operator === 'equals' &&
        typeof targetValue === 'string' &&
        typeof actualValue === 'string'
    ) {
        const question = questionsConfig[condition.depends_on];
        if (question && Array.isArray(question.options)) {
            // 1. Find the "Target Option" by checking if 'targetValue' matches EITHER the option's value OR any of its labels
            // biome-ignore lint/suspicious/noExplicitAny: dynamic option type
            const targetOption = question.options.find((opt: any) => {
                const optVal = typeof opt === 'string' ? opt : opt.value;

                // Match against VALUE
                if (String(optVal) === String(targetValue)) return true;

                // Match against LABELS
                if (typeof opt === 'object' && opt.label) {
                    const labels = Object.values(opt.label);
                    if (labels.some((l) => String(l) === String(targetValue))) {
                        return true;
                    }
                }
                return false;
            });

            if (targetOption) {
                const optVal = typeof targetOption === 'string' ? targetOption : targetOption.value;

                // 2. Check if 'actualValue' matches EITHER the Target Option's value OR any of its labels

                // Check Value
                if (String(optVal) === String(actualValue)) return true;

                // Check Labels
                if (typeof targetOption === 'object' && targetOption.label) {
                    const labels = Object.values(targetOption.label);
                    if (labels.some((l) => String(l) === String(actualValue))) {
                        return true;
                    }
                }
            }
        }
    }

    return false;
}
