/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StudyLayout from './layouts/StudyLayout';
import type { StudyConfig } from './schemas/study';
import { useConfigStore } from './store/useConfigStore';
import { useSessionStore } from './store/useSessionStore';
import { renderWithProviders } from './test-utils/test-utils';

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
                    <Route path="fine-sort" element={<MockFineSort />} />
                    <Route path="*" element={<div data-testid="page-error">Error</div>} />
                </Route>
            </Routes>,
            { initialEntries: ['/study/demo/fine-sort'] }
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
                    <Route path="fine-sort" element={<MockFineSort />} />
                </Route>
            </Routes>,
            { initialEntries: ['/study/demo/fine-sort'] }
        );

        expect(screen.getByTestId('page-fine')).toBeTruthy();
    });

    it('redirects from base study URL to welcome by default', () => {
        renderWithProviders(
            <Routes>
                <Route path="/study/:slug" element={<StudyLayout />}>
                    <Route path="welcome" element={<MockWelcome />} />
                </Route>
            </Routes>,
            { initialEntries: ['/study/demo'] }
        );

        expect(screen.getByTestId('page-welcome')).toBeTruthy();
    });

    it('redirects from base study URL to current step in session', () => {
        // Mock current step as 3 (Rough Sort)
        useSessionStore.getState().setStep(3);
        // Consent is required for Rough Sort
        useSessionStore.getState().setConsent(true);

        renderWithProviders(
            <Routes>
                <Route path="/study/:slug" element={<StudyLayout />}>
                    <Route path="welcome" element={<MockWelcome />} />
                    <Route
                        path="rough-sort"
                        element={<div data-testid="rough-sort-page">Rough</div>}
                    />
                </Route>
            </Routes>,
            { initialEntries: ['/study/demo'] }
        );

        expect(screen.getByTestId('rough-sort-page')).toBeTruthy();
    });
});
