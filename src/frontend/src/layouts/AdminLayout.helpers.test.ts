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
        expect(resolveBreadcrumbLabel('/', null, undefined, t)).toBe('Dashboard');
    });

    it('returns dashboard for /admin tail', () => {
        expect(resolveBreadcrumbLabel('/admin', null, undefined, t)).toBe('Dashboard');
    });

    it('returns study_dashboard when last segment matches activeStudyId', () => {
        expect(
            resolveBreadcrumbLabel('/app/proj1/studies/study-abc', 'study-abc', undefined, t)
        ).toBe('Overview');
    });

    it('returns project.create.title for /new tail', () => {
        expect(resolveBreadcrumbLabel('/app/proj1/projects/new', null, undefined, t)).toBe(
            'Create project'
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

    it('maps known segments via the mapping table', () => {
        expect(resolveBreadcrumbLabel('/app/proj1/dashboard', null, undefined, t)).toBe(
            'Dashboard'
        );
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
        expect(resolveBreadcrumbLabel('/app/proj1/members', null, undefined, t)).toBe(
            'Team members'
        );
        expect(resolveBreadcrumbLabel('/app/proj1/studies/s/design', 's', undefined, t)).toBe(
            'Design'
        );
        expect(resolveBreadcrumbLabel('/app/proj1/studies/s/recruitment', 's', undefined, t)).toBe(
            'Access'
        );
        expect(resolveBreadcrumbLabel('/app/proj1/studies/s/analysis', 's', undefined, t)).toBe(
            'Analysis'
        );
    });

    // --- Naming canon (CLAUDE.md) -------------------------------------------
    // One label per section, propagated to admin.sidebar.<s>,
    // admin.breadcrumbs.<s> and admin.<s>.title. The `settings` URL segment is
    // used by two different pages, so it must resolve by context: a bare
    // "Settings" leaf makes the breadcrumb — the single source of truth for
    // hierarchy — unable to say which page you are on.

    it('labels the project settings breadcrumb "Project settings", matching admin.sidebar.project_settings', () => {
        expect(resolveBreadcrumbLabel('/app/proj1/settings', null, undefined, t)).toBe(
            'Project settings'
        );
    });

    it('labels the study settings breadcrumb "Study settings", matching admin.sidebar.settings', () => {
        expect(
            resolveBreadcrumbLabel(
                '/app/proj1/studies/study-abc/settings',
                'study-abc',
                undefined,
                t
            )
        ).toBe('Study settings');
    });

    it('distinguishes study settings from project settings in the breadcrumb', () => {
        const project = resolveBreadcrumbLabel('/app/proj1/settings', null, undefined, t);
        const study = resolveBreadcrumbLabel(
            '/app/proj1/studies/study-abc/settings',
            'study-abc',
            undefined,
            t
        );
        expect(project).not.toBe(study);
    });

    it('resolves the study settings breadcrumb from the URL, not from the active-study store', () => {
        // activeStudyId is store state and can lag a route change by a render.
        // The URL is authoritative for hierarchy.
        expect(
            resolveBreadcrumbLabel('/app/proj1/studies/study-abc/settings', null, undefined, t)
        ).toBe('Study settings');
    });

    it('has a mapping entry for the superuser /app/users segment', () => {
        // Previously this fell through to the Title-case fallback and only
        // *looked* right because "users" title-cases to "Users".
        expect(resolveBreadcrumbLabel('/app/users', null, undefined, t)).toBe('Users');
    });

    it('never fabricates a Title-cased label for an unmapped segment', () => {
        // CLAUDE.md: every static URL segment must have a `mapping` entry, with
        // no fallback to `last.charAt(0).toUpperCase()`. AdminLayout.breadcrumb-coverage
        // .test.ts proves the mapping is exhaustive over the real route table;
        // this pins that the fabricating fallback is gone.
        expect(resolveBreadcrumbLabel('/app/proj1/banana', null, undefined, t)).toBe('banana');
    });
});
