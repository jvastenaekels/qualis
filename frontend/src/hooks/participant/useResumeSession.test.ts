/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Pure-helper tests for the resume session module.
 *
 * Hook integration is covered by `pages/ResumePage.test.tsx`; here we lock the
 * behaviour of the two pure helpers (`parseResumeError`, `validateDraftResponses`)
 * so a future regression in the error → state mapping or the per-key draft
 * fallback fails immediately, without rendering.
 */

import { describe, expect, it } from 'vitest';

import { initialResponses } from '../../store/useResponseStore';
import { parseResumeError, validateDraftResponses } from './useResumeSession';

describe('parseResumeError', () => {
    it('maps 404 to not_found', () => {
        expect(parseResumeError({ status: 404 })).toEqual({ kind: 'error', code: 'not_found' });
    });

    it('maps 410 to redirect-completed (already submitted)', () => {
        expect(parseResumeError({ status: 410 })).toEqual({ kind: 'redirect-completed' });
    });

    it('maps 403 to study_closed', () => {
        expect(parseResumeError({ status: 403 })).toEqual({ kind: 'error', code: 'study_closed' });
    });

    it('maps 429 to rate_limited', () => {
        expect(parseResumeError({ status: 429 })).toEqual({ kind: 'error', code: 'rate_limited' });
    });

    it('falls back to generic error for unknown status', () => {
        expect(parseResumeError({ status: 500 })).toEqual({ kind: 'error', code: 'error' });
    });

    it('falls back to generic error when no status field is present', () => {
        expect(parseResumeError(new Error('network'))).toEqual({ kind: 'error', code: 'error' });
        expect(parseResumeError(undefined)).toEqual({ kind: 'error', code: 'error' });
        expect(parseResumeError(null)).toEqual({ kind: 'error', code: 'error' });
        expect(parseResumeError('string-error')).toEqual({ kind: 'error', code: 'error' });
    });
});

describe('validateDraftResponses', () => {
    it('returns null for empty / missing drafts', () => {
        expect(validateDraftResponses(undefined)).toBeNull();
        expect(validateDraftResponses(null)).toBeNull();
        expect(validateDraftResponses({})).toBeNull();
    });

    it('returns null when draft is not a plain object', () => {
        expect(validateDraftResponses([1, 2, 3])).toBeNull();
        expect(validateDraftResponses('not-an-object')).toBeNull();
    });

    it('passes through a fully valid draft unchanged', () => {
        const draft = {
            presort: { q1: 'yes' },
            rough: { agree: [1], disagree: [2], neutral: [3], history: ['drag-1'] },
            qsort: [[1], [2]],
            postsort: { feedback: 'good' },
        };
        const result = validateDraftResponses(draft);
        expect(result).toEqual(draft);
    });

    it('falls back per-key when one key is malformed without poisoning others', () => {
        const draft = {
            presort: { q1: 'yes' }, // valid
            rough: { agree: 'not-an-array' }, // invalid
            qsort: [[1]], // valid
            postsort: 'not-an-object', // invalid
        };
        const result = validateDraftResponses(draft);
        expect(result).toEqual({
            presort: { q1: 'yes' },
            rough: initialResponses.rough,
            qsort: [[1]],
            postsort: initialResponses.postsort,
        });
    });

    it('falls back to initialResponses on every malformed slice', () => {
        const draft = {
            presort: 'bad',
            rough: { agree: 'bad' },
            qsort: 'bad',
            postsort: [1, 2, 3],
        };
        const result = validateDraftResponses(draft);
        // The hydration writes only the subset the resume payload covers
        // (presort/rough/qsort/postsort); `deck` is intentionally not part of
        // the validated shape.
        expect(result).toEqual({
            presort: initialResponses.presort,
            rough: initialResponses.rough,
            qsort: initialResponses.qsort,
            postsort: initialResponses.postsort,
        });
    });

    it('rejects a rough slice with the wrong array shape on any subkey', () => {
        const draft = {
            presort: {},
            rough: {
                agree: [1],
                disagree: [2],
                neutral: [3],
                history: 'not-an-array', // breaks the shape
            },
            qsort: [],
            postsort: {},
        };
        const result = validateDraftResponses(draft);
        expect(result?.rough).toEqual(initialResponses.rough);
    });
});
