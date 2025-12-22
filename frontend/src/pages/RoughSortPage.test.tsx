/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import RoughSortPage from './RoughSortPage';
import { useConfigStore } from '../store/useConfigStore';
import { useSessionStore } from '../store/useSessionStore';
import { useResponseStore } from '../store/useResponseStore';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// Mocks
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

// Mock ResizeObserver for Framer Motion
global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
};

const mockConfig = {
    slug: 'test-study',
    title: 'Test Study',
    description: 'Test Description',
    instructions: 'Test Instructions',
    presort_config: {},
    statements: [
        { id: 1, text: 'Card 1' },
        { id: 2, text: 'Card 2' },
        { id: 3, text: 'Card 3' }
    ]
};

describe('RoughSortPage', () => {
    beforeEach(() => {
        // Reset all stores
        useConfigStore.getState().setConfig(mockConfig as any);
        useSessionStore.getState().resetSession();
        useResponseStore.getState().resetResponses();
    });

    it('sets the current step to 3 on mount', () => {
        render(
            <MemoryRouter initialEntries={['/study/test-study/sort/rough']}>
                <Routes>
                    <Route path="/study/:slug/sort/rough" element={<RoughSortPage />} />
                </Routes>
            </MemoryRouter>
        );
        expect(useSessionStore.getState().currentStep).toBe(3);
    });

    it('renders the pedagogical hint', () => {
        render(
            <MemoryRouter initialEntries={['/study/test-study/sort/rough']}>
                 <Routes>
                    <Route path="/study/:slug/sort/rough" element={<RoughSortPage />} />
                </Routes>
            </MemoryRouter>
        );
        
        // Check for Hint (now at bottom)
        expect(screen.getByText('rough.header.hint')).toBeTruthy();
        // Check for Title
        expect(screen.getByText('rough.header.title')).toBeTruthy();
    });

    it('renders the Control Cluster buttons', () => {
        render(
            <MemoryRouter initialEntries={['/study/test-study/sort/rough']}>
                 <Routes>
                    <Route path="/study/:slug/sort/rough" element={<RoughSortPage />} />
                </Routes>
            </MemoryRouter>
        );

        expect(screen.getByLabelText('common.disagree')).toBeTruthy();
        expect(screen.getByLabelText('common.agree')).toBeTruthy();
        expect(screen.getByLabelText('common.neutral')).toBeTruthy();
    });

    it('completes the sort when all cards are categorized', () => {
        // Setup: All cards already categorized
        useResponseStore.getState().categorizeCard(1, 'agree');
        useResponseStore.getState().categorizeCard(2, 'agree');
        useResponseStore.getState().categorizeCard(3, 'agree');

         render(
            <MemoryRouter initialEntries={['/study/test-study/sort/rough']}>
                 <Routes>
                    <Route path="/study/:slug/sort/rough" element={<RoughSortPage />} />
                </Routes>
            </MemoryRouter>
        );

        expect(screen.getByText('rough.complete.title')).toBeTruthy();
        expect(screen.getByText('common.next')).toBeTruthy();
    });

    it('persists progress when re-navigating', () => {
        // Categorize one card
        useResponseStore.getState().categorizeCard(1, 'agree');

        const { unmount } = render(
            <MemoryRouter initialEntries={['/study/test-study/sort/rough']}>
                <Routes>
                    <Route path="/study/:slug/sort/rough" element={<RoughSortPage />} />
                </Routes>
            </MemoryRouter>
        );

        // Card 1 is gone, Card 2 is current
        expect(screen.getByText('Card 2')).toBeTruthy();

        unmount();

        render(
            <MemoryRouter initialEntries={['/study/test-study/sort/rough']}>
                <Routes>
                    <Route path="/study/:slug/sort/rough" element={<RoughSortPage />} />
                </Routes>
            </MemoryRouter>
        );

        expect(screen.getByText('Card 2')).toBeTruthy();
    });
});
