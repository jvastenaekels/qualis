/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { z } from 'zod';

export const ConsentSchema = z.object({
    title: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    accept: z.string().optional().nullable(),
    decline: z.string().optional().nullable(),
});

export const GridConfigSchema = z.object({
    score: z.number(),
    capacity: z.number(),
});

export const StatementSchema = z.object({
    id: z.number(),
    text: z.string(),
    code: z.string().optional(),
});

export const PreSortFieldSchema = z.object({
    type: z.enum(['text', 'number', 'select', 'checkbox', 'radio', 'date', 'email', 'textarea']),
    label: z.union([z.string(), z.record(z.string())]),
    required: z.boolean().optional(),
    options: z
        .array(
            z.union([
                z.string(),
                z.object({
                    value: z.string(),
                    label: z.union([z.string(), z.record(z.string())]),
                }),
            ])
        )
        .optional(),
    placeholder: z.union([z.string(), z.record(z.string())]).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    minLength: z.number().optional(),
    maxLength: z.number().optional(),
    rows: z.number().optional(),
});

export const StudyConfigSchema = z.object({
    slug: z.string(),
    title: z.string(),
    subtitle: z.string().optional().nullable(),
    description: z.string(),
    objective: z.string().optional().nullable(),
    instructions: z.string(),
    presort_config: z.record(PreSortFieldSchema),
    grid_config: z.array(GridConfigSchema).optional(),
    postsort_config: z
        .object({
            extreme_columns: z.array(z.number()).optional(),
            ask_missing: z.boolean().optional(),
            ask_general_comment: z.boolean().optional(),
            prompts: z
                .object({
                    extreme: z.union([z.string(), z.record(z.string())]).optional(),
                    missing: z.union([z.string(), z.record(z.string())]).optional(),
                    general: z.union([z.string(), z.record(z.string())]).optional(),
                })
                .optional(),
        })
        .optional(),
    statements: z.array(StatementSchema),
    consent: ConsentSchema.optional(),
    ui_labels: z.record(z.string()).optional(),
    available_languages: z.array(z.string()).optional(),
    language: z.string().optional(),
    show_statement_codes: z.boolean().optional(),
    state: z.enum(['draft', 'active', 'paused', 'closed']).optional(),
});

export type StudyConfig = z.infer<typeof StudyConfigSchema>;
export type PreSortField = z.infer<typeof PreSortFieldSchema>;
export type Statement = z.infer<typeof StatementSchema>;
