import { describe, it, expect } from 'vitest';
import type { TFunction } from 'i18next';
import { resolveBreadcrumbLabel } from './AdminLayout.helpers';

// Stub t: returns the translation key + interpolation when applicable, or the
// fallback if provided.
const t = ((key: string, fallbackOrOpts?: unknown, opts?: Record<string, unknown>) => {
    if (typeof fallbackOrOpts === 'string') {
        // Has fallback string + maybe options
        if (opts) {
            let s = fallbackOrOpts;
            for (const [k, v] of Object.entries(opts)) {
                s = s.replace(`{{${k}}}`, String(v));
            }
            return s;
        }
        return fallbackOrOpts;
    }
    // No fallback: interpolate options into key for visibility
    if (fallbackOrOpts && typeof fallbackOrOpts === 'object') {
        let s = key;
        for (const [k, v] of Object.entries(fallbackOrOpts as Record<string, unknown>)) {
            s = s.replace(`{{${k}}}`, String(v));
        }
        return s;
    }
    return key;
}) as unknown as TFunction;

describe('resolveBreadcrumbLabel', () => {
    it('returns dashboard for empty pathname', () => {
        expect(resolveBreadcrumbLabel('/', null, undefined, t)).toBe('admin.breadcrumbs.dashboard');
    });

    it('returns dashboard for /admin tail', () => {
        expect(resolveBreadcrumbLabel('/admin', null, undefined, t)).toBe(
            'admin.breadcrumbs.dashboard'
        );
    });

    it('returns study_dashboard when last segment matches activeStudyId', () => {
        expect(
            resolveBreadcrumbLabel('/app/proj1/studies/study-abc', 'study-abc', undefined, t)
        ).toBe('admin.breadcrumbs.study_dashboard');
    });

    it('returns project.create.title for /new tail', () => {
        expect(resolveBreadcrumbLabel('/app/proj1/projects/new', null, undefined, t)).toBe(
            'admin.project.create.title'
        );
    });

    it('handles /concourses/:id detail route with digit id', () => {
        expect(resolveBreadcrumbLabel('/app/proj1/concourses/42', null, undefined, t)).toBe(
            'Concourse'
        );
    });

    it('handles /participants/:id detail route with the participant code', () => {
        expect(
            resolveBreadcrumbLabel(
                '/app/proj1/studies/study/participants/7',
                null,
                { code: 'ABCDEF01' },
                t
            )
        ).toBe('Participant ABCDEF01');
    });

    it('falls back to the URL id when participant fetch is in-flight', () => {
        expect(
            resolveBreadcrumbLabel('/app/proj1/studies/study/participants/7', null, undefined, t)
        ).toBe('Participant 7');
    });

    it('maps known segments via the mapping table (with fallback)', () => {
        expect(resolveBreadcrumbLabel('/app/proj1/data', null, undefined, t)).toBe('Data');
        expect(resolveBreadcrumbLabel('/app/proj1/privacy', null, undefined, t)).toBe(
            'Data privacy'
        );
        expect(resolveBreadcrumbLabel('/app/proj1/account', null, undefined, t)).toBe(
            'Account settings'
        );
        expect(resolveBreadcrumbLabel('/app/proj1/concourses', null, undefined, t)).toBe(
            'Concourse'
        );
    });

    it('maps known segments via the mapping table (no fallback)', () => {
        expect(resolveBreadcrumbLabel('/app/proj1/dashboard', null, undefined, t)).toBe(
            'admin.breadcrumbs.dashboard'
        );
        expect(resolveBreadcrumbLabel('/app/proj1/exports', null, undefined, t)).toBe(
            'admin.breadcrumbs.exports'
        );
        expect(resolveBreadcrumbLabel('/app/proj1/settings', null, undefined, t)).toBe(
            'admin.breadcrumbs.settings'
        );
    });

    it('Title-cases unknown segments as fallback', () => {
        expect(resolveBreadcrumbLabel('/app/proj1/banana', null, undefined, t)).toBe('Banana');
    });
});
