/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Qualis Team
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { describe, it, expect } from 'vitest';
import { presortFields, postsortConfig, processSteps } from './studyConfig';

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
