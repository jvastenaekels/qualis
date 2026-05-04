import { describe, it, expect } from 'vitest';
import { resolveLegacyTarget } from './LegacyRedirect.helpers';

const projects = [
    { slug: 'proj1', id: 1 },
    { slug: 'proj2', id: 2 },
];

const studies = [
    { slug: 'study-a', project: { slug: 'proj1', id: 1 } },
    { slug: 'study-b', project: { slug: 'proj2', id: 2 } },
];

describe('resolveLegacyTarget', () => {
    it('/admin → last visited study has priority', () => {
        const r = resolveLegacyTarget('/admin', projects, studies, 'study-a');
        expect(r.target).toBe('/app/proj1/studies/study-a');
    });

    it('/admin → first project when no last-visited', () => {
        const r = resolveLegacyTarget('/admin', projects, studies, null);
        expect(r.target).toBe('/app/proj1/dashboard');
    });

    it('/admin → /hub when no projects', () => {
        const r = resolveLegacyTarget('/admin', [], [], null);
        expect(r.target).toBe('/hub');
    });

    it('/admin/studies/:slug → migrates with activeStudy/activeProjectId set', () => {
        const r = resolveLegacyTarget('/admin/studies/study-a', projects, studies, null);
        expect(r.target).toBe('/app/proj1/studies/study-a');
        expect(r.activeStudy).toBe('study-a');
        expect(r.activeProjectId).toBe(1);
    });

    it('/admin/studies/:slug/exports → maps to /data', () => {
        const r = resolveLegacyTarget('/admin/studies/study-a/exports', projects, studies, null);
        expect(r.target).toBe('/app/proj1/studies/study-a/data');
    });

    it('/admin/studies/:slug/team → maps to project /team (decommissioned)', () => {
        const r = resolveLegacyTarget('/admin/studies/study-a/team', projects, studies, null);
        expect(r.target).toBe('/app/proj1/team');
    });

    it('/admin/studies/:slug/sub → preserves sub path', () => {
        const r = resolveLegacyTarget(
            '/admin/studies/study-a/recruitment',
            projects,
            studies,
            null
        );
        expect(r.target).toBe('/app/proj1/studies/study-a/recruitment');
    });

    it('/admin/w/:slug → /app/:slug/dashboard with activeProjectId', () => {
        const r = resolveLegacyTarget('/admin/w/proj2', projects, studies, null);
        expect(r.target).toBe('/app/proj2/dashboard');
        expect(r.activeProjectId).toBe(2);
    });

    it('/admin/workspaces/:slug/settings → /app/:slug/settings', () => {
        const r = resolveLegacyTarget('/admin/workspaces/proj2/settings', projects, studies, null);
        expect(r.target).toBe('/app/proj2/settings');
        expect(r.activeProjectId).toBe(2);
    });

    it('/admin/profile → /app/:firstProj/account', () => {
        const r = resolveLegacyTarget('/admin/profile', projects, studies, null);
        expect(r.target).toBe('/app/proj1/account');
    });

    it('/admin/profile → /hub when no projects', () => {
        const r = resolveLegacyTarget('/admin/profile', [], [], null);
        expect(r.target).toBe('/hub');
    });

    it('unknown legacy path → /hub fallback', () => {
        const r = resolveLegacyTarget('/admin/something/unknown', projects, studies, null);
        expect(r.target).toBe('/hub');
    });
});
