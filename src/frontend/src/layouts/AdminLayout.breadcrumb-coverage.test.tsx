/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Breadcrumb coverage over the REAL route table.
 *
 * CLAUDE.md's admin header policy: "Every static URL segment must have an entry
 * in the `mapping` table (no fallback to `last.charAt(0).toUpperCase()`)."
 *
 * That rule is only enforceable if something checks the mapping against the
 * routes that actually exist. This walks the exported `routes` array from
 * App.tsx, collects every static leaf segment rendered inside an <AdminLayout>,
 * and asserts each one resolves to a real label rather than to the raw segment.
 *
 * A new admin route whose segment is missing from SEGMENT_LABEL_KEYS fails here.
 */

import type { ReactElement } from 'react';
import type { RouteObject } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import { routes } from '../App';
import AdminLayout from './AdminLayout';
import { resolveBreadcrumbLabel } from './AdminLayout.helpers';

/** Stub `t`: returns the fallback when given, otherwise the key. */
const t = ((key: string, fallback?: unknown) =>
    typeof fallback === 'string' ? fallback : key) as unknown as TFunction;

function isAdminLayout(route: RouteObject): boolean {
    const element = route.element as ReactElement | undefined;
    return !!element && typeof element === 'object' && element.type === AdminLayout;
}

/**
 * Collect the full path of every leaf route rendered under an <AdminLayout>.
 * `parent` is the accumulated path prefix; `inAdmin` flips true once an
 * AdminLayout route is entered and stays true for its whole subtree.
 */
function collectAdminPaths(
    routeList: RouteObject[],
    parent: string,
    inAdmin: boolean,
    out: string[]
): void {
    for (const route of routeList) {
        const here = inAdmin || isAdminLayout(route);
        const path = route.path ? `${parent}/${route.path}`.replace(/\/+/g, '/') : parent;
        if (route.children) {
            collectAdminPaths(route.children, path, here, out);
        } else if (here && route.path) {
            out.push(path);
        }
    }
}

const adminPaths: string[] = [];
collectAdminPaths(routes, '', false, adminPaths);

describe('breadcrumb mapping covers the real admin route table', () => {
    it('finds the admin routes at all (guards against a vacuous pass)', () => {
        expect(adminPaths.length).toBeGreaterThan(8);
        expect(adminPaths).toContain('/app/:projectSlug/settings');
        expect(adminPaths).toContain('/app/:projectSlug/studies/:studySlug/settings');
        expect(adminPaths).toContain('/app/users');
    });

    it.each(adminPaths)('resolves a label for %s', (routePath: string) => {
        // Substitute concrete values for the dynamic segments so the helper
        // sees a realistic pathname.
        const pathname = routePath
            .replace(':projectSlug', 'example-project')
            .replace(':studySlug', 'study-abc')
            .replace(':concourseId', '42')
            .replace(':participantId', '7');
        const segments = pathname.split('/').filter(Boolean);
        const last = segments[segments.length - 1];

        const label = resolveBreadcrumbLabel(pathname, 'study-abc', { code: 'ABCDEF01' }, t);

        expect(label).toBeTruthy();
        // The raw segment coming back means the mapping has no entry for it.
        expect(label).not.toBe(last);
        // A dotted i18n key coming back means the entry has no fallback.
        expect(label).not.toMatch(/^admin\./);
    });
});
