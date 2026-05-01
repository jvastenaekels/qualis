/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import type { TFunction } from 'i18next';
import { z } from 'zod';

import { evaluateVisibilityCondition } from './visibilityEvaluator';

/**
 * Minimal structural type covering the field properties read by the schema
 * builder. Callers can pass `PreSortField` (presort) or postsort question
 * config; both are super-types of this shape.
 */
export interface QuestionnaireField {
    type:
        | 'text'
        | 'textarea'
        | 'email'
        | 'number'
        | 'checkbox'
        | 'radio'
        | 'date'
        | 'select'
        | 'text_audio';
    required?: boolean;
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    visibility_condition?: {
        depends_on: string;
        operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than';
        value?: unknown;
    };
}

/**
 * react-i18next's `TFunction`. Re-exported here as `TranslateFn` so call sites
 * outside the schema builder don't need to import from `i18next`. Tests cast a
 * plain `(key) => key` stub to this type.
 */
export type TranslateFn = TFunction;

const TEXTUAL_TYPES = new Set(['text', 'textarea', 'email', 'text_audio']);

function applyStringBounds(
    base: z.ZodString,
    field: QuestionnaireField,
    t: TranslateFn
): z.ZodString {
    let s = base;
    if (field.type === 'email') {
        s = s.email(t('common.errors.email'));
    }
    if (field.minLength !== undefined) {
        s = s.min(field.minLength, t('common.errors.min_length', { count: field.minLength }));
    }
    if (field.maxLength !== undefined) {
        s = s.max(field.maxLength, t('common.errors.max_length', { count: field.maxLength }));
    }
    return s;
}

function buildRequiredFieldSchema(field: QuestionnaireField, t: TranslateFn): z.ZodTypeAny {
    // text_audio: text part is always optional — audio presence is enforced by the
    // submission handler, not by the form schema.
    if (field.type === 'text_audio') {
        return z.preprocess(
            (val) => (val === '' || val === null || val === undefined ? null : val),
            z.string().optional().nullable()
        );
    }

    if (field.type === 'checkbox') {
        return z.array(z.string()).min(1, t('presort.error_required'));
    }

    if (field.type === 'number') {
        let numSchema = z.number({
            required_error: t('presort.error_required'),
            invalid_type_error: t('presort.error_required'),
        });
        if (field.min !== undefined) {
            numSchema = numSchema.min(field.min, t('common.errors.min', { min: field.min }));
        }
        if (field.max !== undefined) {
            numSchema = numSchema.max(field.max, t('common.errors.max', { max: field.max }));
        }
        return z.preprocess((val) => {
            if (val === '' || val === null || val === undefined) return undefined;
            const num = Number(val);
            return Number.isNaN(num) ? val : num;
        }, numSchema);
    }

    // Text / textarea / email / radio / date / select — all string-shaped.
    const errorMsg = TEXTUAL_TYPES.has(field.type)
        ? t('post.extreme.min_chars')
        : t('presort.error_required');
    const stringSchema = applyStringBounds(z.string().min(1, errorMsg), field, t);
    return z.preprocess((val) => (val === null || val === undefined ? '' : val), stringSchema);
}

function buildOptionalFieldSchema(field: QuestionnaireField, t: TranslateFn): z.ZodTypeAny {
    if (field.type === 'checkbox') {
        return z.array(z.string()).optional().nullable();
    }

    if (field.type === 'number') {
        return z.preprocess((val) => {
            if (val === '' || val === null || val === undefined) return null;
            const num = Number(val);
            return Number.isNaN(num) ? val : num;
        }, z.number().optional().nullable());
    }

    // Text / textarea / email / radio / date / select / text_audio — string-shaped.
    // Bounds (.email, .min, .max) are applied to the inner z.string() before
    // wrapping in optional().nullable() so the schema stays clean (no zod cast
    // hacks) — consistent with the postsort questionnaire.
    const stringSchema = applyStringBounds(z.string(), field, t);
    return z.preprocess(
        (val) => (val === '' || val === null || val === undefined ? null : val),
        stringSchema.optional().nullable()
    );
}

/**
 * Build a Zod object schema for a questionnaire (presort or postsort).
 *
 * Hidden fields (whose `visibility_condition` is currently false) accept any
 * value and are not validated. Required fields enforce type + bounds; optional
 * fields are nullable / accept empty strings.
 *
 * The same `questions` map is passed as the `evaluateVisibilityCondition`
 * fallback so localized-option matching keeps working when one question's
 * visibility depends on another question's localized option label.
 */
export function buildQuestionnaireSchema(
    questions: Record<string, QuestionnaireField>,
    formData: Record<string, unknown>,
    t: TranslateFn
): z.ZodObject<z.ZodRawShape> {
    const shape: Record<string, z.ZodTypeAny> = {};

    for (const [key, field] of Object.entries(questions)) {
        const isVisible = evaluateVisibilityCondition(
            field.visibility_condition,
            formData,
            questions
        );
        if (!isVisible) {
            shape[key] = z.any().optional();
            continue;
        }
        shape[key] = field.required
            ? buildRequiredFieldSchema(field, t)
            : buildOptionalFieldSchema(field, t);
    }

    return z.object(shape);
}
