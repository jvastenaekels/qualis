/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Qualis Team
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { describe, it, expect } from 'vitest';
import { normalisePresortConfig, presortFields, postsortConfig, processSteps } from './studyConfig';

describe('presortFields — legacy/new union collapse', () => {
    it('returns the field map for the legacy flat-record shape', () => {
        const cfg = { presort_config: { age: { type: 'number', label: 'Age' } } };
        expect(presortFields(cfg)).toEqual({ age: { type: 'number', label: 'Age' } });
    });

    it('returns config.fields for the new {enabled, fields} shape', () => {
        const cfg = {
            presort_config: { enabled: true, fields: { age: { type: 'number', label: 'Age' } } },
        };
        expect(presortFields(cfg)).toEqual({ age: { type: 'number', label: 'Age' } });
    });

    it('returns {} when presort_config is absent or null', () => {
        expect(presortFields({})).toEqual({});
        expect(presortFields({ presort_config: null })).toEqual({});
        expect(presortFields(null)).toEqual({});
    });

    // Regression (admin-E2E crash): new-shape config with `enabled` but NO
    // `fields` key (presort enabled, zero fields — very common). MUST NOT
    // fall through to the legacy branch and return the wrapper object (whose
    // boolean `enabled` would then be iterated as a "field" by
    // normalizeQuestionMap → normalizeQuestion(true) → "Cannot create
    // property 'label' on boolean 'true'"). Pre-W2 code read `.fields` here
    // (undefined → safe no-op); the accessor must reproduce that.
    it('returns {} for an enabled wrapper that has no fields key', () => {
        expect(presortFields({ presort_config: { enabled: true } })).toEqual({});
        expect(presortFields({ presort_config: { enabled: false } })).toEqual({});
    });
});

describe('postsortConfig', () => {
    it('returns the postsort object when present', () => {
        const cfg = { postsort_config: { ask_missing: true } };
        expect(postsortConfig(cfg)).toEqual({ ask_missing: true });
    });
    it('returns undefined when absent', () => {
        expect(postsortConfig({})).toBeUndefined();
        expect(postsortConfig(null)).toBeUndefined();
    });
});

describe('processSteps', () => {
    it('returns the steps array from a config/draft', () => {
        const steps = [{ id: '1', title: 'A', description: '', icon: 'X' }];
        expect(processSteps({ process_steps: steps })).toEqual(steps);
    });
    it('returns the steps array from a translation-like object', () => {
        const steps = [{ id: '1', title: 'A', description: '', icon: 'X' }];
        expect(processSteps({ process_steps: steps } as object)).toEqual(steps);
    });
    it('returns [] when absent or null', () => {
        expect(processSteps({})).toEqual([]);
        expect(processSteps(null)).toEqual([]);
        expect(processSteps({ process_steps: null })).toEqual([]);
    });
});

describe('normalisePresortConfig — the one place that knows the flat form', () => {
    it('lifts a flat field map into {enabled: true, fields}', () => {
        const flat = { age: { type: 'number', label: 'Age' } };
        expect(normalisePresortConfig(flat)).toEqual({ enabled: true, fields: flat });
    });

    it('fills in the missing half of a partial wrapper', () => {
        expect(normalisePresortConfig({ enabled: false })).toEqual({ enabled: false, fields: {} });
        const fields = { q1: { type: 'text', label: 'Q' } };
        expect(normalisePresortConfig({ fields })).toEqual({ enabled: true, fields });
    });

    it('returns an enabled empty config for null, undefined or {}', () => {
        for (const raw of [null, undefined, {}]) {
            expect(normalisePresortConfig(raw)).toEqual({ enabled: true, fields: {} });
        }
    });

    it('keeps unknown top-level keys of the wrapped form', () => {
        const raw = { enabled: true, fields: {}, intro: 'hi' };
        expect(normalisePresortConfig(raw)).toEqual(raw);
    });

    it('never returns the input object itself (callers mutate the result)', () => {
        const raw = { enabled: true, fields: {} };
        expect(normalisePresortConfig(raw)).not.toBe(raw);
    });
});
