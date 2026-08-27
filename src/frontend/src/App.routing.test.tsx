/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Routing-level tests for the router config exported from App.tsx.
 *
 * These exercise the REAL route array (not a hand-built duplicate) via
 * react-router's own matching engine, so a route added, removed, or
 * reordered in App.tsx is verified here without any drift between the
 * "real" config and a test double of it.
 */

import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, matchRoutes, RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { routes } from './App';
import i18n from './test-utils/i18n-test';

describe('router: unknown URLs', () => {
    it('renders the styled error page for an unknown admin URL instead of the router default screen', async () => {
        const testRouter = createMemoryRouter(routes, {
            initialEntries: ['/app/example-project/nope'],
        });

        render(
            <I18nextProvider i18n={i18n}>
                <RouterProvider router={testRouter} />
            </I18nextProvider>
        );

        // Positive assertion: the app's own styled error page rendered (not a
        // blank screen, which would make the "Hey developer" absence below
        // vacuously true).
        expect(await screen.findByRole('heading', { name: /not found/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /go to home/i })).toBeInTheDocument();

        // Negative assertion: react-router's unstyled default error boundary
        // (the "💿 Hey developer" screen) did not take over.
        expect(screen.queryByText(/Hey developer/i)).not.toBeInTheDocument();
    });
});

describe('router: real routes still resolve after the catch-all is added', () => {
    // matchRoutes walks the exact same `routes` array App.tsx passes to
    // createBrowserRouter. For each real path we assert the deepest matched
    // route is the intended leaf, not the trailing `path: '*'` catch-all —
    // guarding against a future reorder shadowing everything below it.
    it.each([
        { path: '/', label: 'landing page' },
        { path: '/login', label: 'login page' },
        { path: '/hub', label: 'researcher hub' },
        { path: '/app/example-project/dashboard', label: 'project dashboard' },
        { path: '/study/bioeconomy-futures', label: 'participant study layout' },
        { path: '/study/bioeconomy-futures/welcome', label: 'participant welcome step' },
    ])('$label ($path) does not fall through to the catch-all', ({ path }) => {
        const matches = matchRoutes(routes, path);

        expect(matches).not.toBeNull();
        const deepest = matches?.[matches.length - 1];
        expect(deepest?.route.path).not.toBe('*');
    });

    it('matches an unknown top-level URL only against the trailing catch-all route', () => {
        const matches = matchRoutes(routes, '/app/example-project/nope');

        expect(matches).not.toBeNull();
        const deepest = matches?.[matches.length - 1];
        expect(deepest?.route.path).toBe('*');
    });

    it('keeps the catch-all as the last entry so it cannot shadow any other route', () => {
        const catchAllIndex = routes.findIndex((route) => route.path === '*');

        expect(catchAllIndex).toBe(routes.length - 1);
    });
});
