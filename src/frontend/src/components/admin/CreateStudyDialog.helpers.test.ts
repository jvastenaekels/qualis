import { describe, it, expect } from 'vitest';
import type { TFunction } from 'i18next';
import { parseStudyCreationError } from './CreateStudyDialog.helpers';

const t = ((_key: string, fallback?: string) => fallback ?? _key) as unknown as TFunction;

describe('parseStudyCreationError', () => {
    it('returns the i18n fallback for null/undefined', () => {
        expect(parseStudyCreationError(null, t)).toBe('Failed to create study');
        expect(parseStudyCreationError(undefined, t)).toBe('Failed to create study');
    });

    it('returns the i18n fallback for a string', () => {
        expect(parseStudyCreationError('plain', t)).toBe('Failed to create study');
    });

    it('extracts a Pydantic-style validation array', () => {
        const err = {
            response: {
                data: {
                    detail: [
                        { loc: ['body', 'slug'], msg: 'must be unique' },
                        { loc: ['body', 'title'], msg: 'too short' },
                    ],
                },
            },
        };
        expect(parseStudyCreationError(err, t)).toBe(
            'Validation errors:\nbody.slug: must be unique\nbody.title: too short'
        );
    });

    it('extracts a string detail', () => {
        const err = { response: { data: { detail: 'Slug already exists' } } };
        expect(parseStudyCreationError(err, t)).toBe('Slug already exists');
    });

    it('stringifies an object detail', () => {
        const err = { response: { data: { detail: { code: 'X', extra: 1 } } } };
        const out = parseStudyCreationError(err, t);
        expect(out).toContain('"code": "X"');
        expect(out).toContain('"extra": 1');
    });

    it('falls back to error.message when no axios detail', () => {
        const err = new Error('Network error');
        expect(parseStudyCreationError(err, t)).toBe('Network error');
    });

    it('falls back to i18n when error has no recognised shape', () => {
        const err = { foo: 'bar' };
        expect(parseStudyCreationError(err, t)).toBe('Failed to create study');
    });

    it('prefers detail over error.message', () => {
        const err = Object.assign(new Error('msg'), {
            response: { data: { detail: 'from server' } },
        });
        expect(parseStudyCreationError(err, t)).toBe('from server');
    });
});
