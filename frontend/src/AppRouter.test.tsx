/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import StudyLayout from './layouts/StudyLayout';
import { useSessionStore } from './store/useSessionStore';
import { useConfigStore } from './store/useConfigStore';

// Mock Pages
const MockFineSort = () => <div data-testid="page-fine">Fine Page</div>;
const MockWelcome = () => <div data-testid="page-welcome">Welcome Page</div>;

const mockConfig = {
    slug: 'demo',
    title: 'Test',
    description: 'Test',
    instructions: 'Test',
    statements: []
};

describe('App Routing Protection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useConfigStore.getState().setConfig(mockConfig as any);
        useSessionStore.getState().resetSession();
    });

    it('redirects to welcome if not consented on protected route', () => {
        // Session is NOT consented (default after reset)
        render(
            <MemoryRouter initialEntries={['/study/demo/sort/fine']}>
                 <Routes>
                    <Route path="/study/:slug" element={<StudyLayout />}>
                       <Route path="welcome" element={<MockWelcome />} />
                       <Route path="sort">
                         <Route path="fine" element={<MockFineSort />} />
                       </Route>
                       <Route path="*" element={<div data-testid="page-error">Error</div>} />
                    </Route>
                 </Routes>
            </MemoryRouter>
        );

        // Should NOT show Fine Page
        expect(screen.queryByTestId('page-fine')).toBeNull();
        // Should Redirect to Welcome
        expect(screen.getByTestId('page-welcome')).toBeTruthy();
    });

    it('allows access if consented', () => {
        // Set session as consented
        useSessionStore.getState().setConsent(true);

        render(
            <MemoryRouter initialEntries={['/study/demo/sort/fine']}>
                 <Routes>
                    <Route path="/study/:slug" element={<StudyLayout />}>
                       <Route path="sort/fine" element={<MockFineSort />} />
                    </Route>
                 </Routes>
            </MemoryRouter>
        );

        expect(screen.getByTestId('page-fine')).toBeTruthy();
    });
});
