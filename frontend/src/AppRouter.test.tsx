/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from './test/test-utils';
import { Routes, Route } from 'react-router-dom';
import StudyLayout from './layouts/StudyLayout';
import { useSessionStore } from './store/useSessionStore';
import { useConfigStore } from './store/useConfigStore';
import type { StudyConfig } from './schemas/study';

vi.mock('./pages/PreSortPage', () => ({
    default: () => <div data-testid="presort-page">PreSortPage</div>,
}));
vi.mock('./pages/RoughSortPage', () => ({
    default: () => <div data-testid="rough-sort-page">RoughSortPage</div>,
}));

// Mock Pages
const MockFineSort = () => <div data-testid="page-fine">Fine Page</div>;
const MockWelcome = () => <div data-testid="page-welcome">Welcome Page</div>;

const mockConfig: StudyConfig = {
    slug: 'demo',
    title: 'Test',
    description: 'Test',
    instructions: 'Test',
    statements: [],
    presort_config: {},
    grid_config: [],
};

describe('App Routing Protection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Use unknown to acknowledge the cast for mock payload
        useConfigStore.getState().setConfig(mockConfig);
        useSessionStore.getState().resetSession();
    });

    it('redirects to welcome if not consented on protected route', () => {
        // Session is NOT consented (default after reset)
        renderWithProviders(
            <Routes>
                <Route path="/study/:slug" element={<StudyLayout />}>
                    <Route path="welcome" element={<MockWelcome />} />
                    <Route path="sort">
                        <Route path="fine" element={<MockFineSort />} />
                    </Route>
                    <Route path="*" element={<div data-testid="page-error">Error</div>} />
                </Route>
            </Routes>,
            { initialEntries: ['/study/demo/sort/fine'] }
        );

        // Should NOT show Fine Page
        expect(screen.queryByTestId('page-fine')).toBeNull();
        // Should Redirect to Welcome
        expect(screen.getByTestId('page-welcome')).toBeTruthy();
    });

    it('allows access if consented', () => {
        // Set session as consented
        useSessionStore.getState().setConsent(true);

        renderWithProviders(
            <Routes>
                <Route path="/study/:slug" element={<StudyLayout />}>
                    <Route path="sort/fine" element={<MockFineSort />} />
                </Route>
            </Routes>,
            { initialEntries: ['/study/demo/sort/fine'] }
        );

        expect(screen.getByTestId('page-fine')).toBeTruthy();
    });
});
