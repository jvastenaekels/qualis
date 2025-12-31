/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, act } from '@testing-library/react';
import { renderWithProviders } from '../test/test-utils';
import RoughSortPage from './RoughSortPage';
import { useConfigStore } from '../store/useConfigStore';
import { useSessionStore } from '../store/useSessionStore';
import { useResponseStore } from '../store/useResponseStore';
import { Route, Routes } from 'react-router-dom';
import type { StudyConfig } from '../schemas/study';

// Mocks
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

// Mock CardStack to capture ref and simulate behavior
vi.mock('../components/CardStack', async () => {
    const { forwardRef, useImperativeHandle } = await import('react');
    return {
        default: forwardRef(({ statement, onVote }: any, ref: any) => {
            useImperativeHandle(ref, () => ({
                swipe: (dir: string) => onVote(dir),
            }));
            return <div data-testid="card-stack">{statement?.text}</div>;
        }),
    };
});

// Mock ResizeObserver for Framer Motion

const mockConfig = {
    slug: 'test-study',
    title: 'Test Study',
    description: 'Test Description',
    instructions: 'Test Instructions',
    presort_config: {},
    statements: [
        { id: 1, text: 'Card 1' },
        { id: 2, text: 'Card 2' },
        { id: 3, text: 'Card 3' },
    ],
};

describe('RoughSortPage', () => {
    beforeEach(() => {
        // Reset all stores
        useConfigStore.getState().setConfig(mockConfig as unknown as StudyConfig);
        useSessionStore.getState().resetSession();
        useResponseStore.getState().resetResponses();
    });

    it('sets the current step to 3 on mount', () => {
        renderWithProviders(
            <Routes>
                <Route path="/study/:slug/sort/rough" element={<RoughSortPage />} />
            </Routes>,
            { initialEntries: ['/study/test-study/sort/rough'] }
        );
        expect(useSessionStore.getState().currentStep).toBe(3);
    });

    it('renders the pedagogical hint', () => {
        vi.useFakeTimers();
        renderWithProviders(
            <Routes>
                <Route path="/study/:slug/sort/rough" element={<RoughSortPage />} />
            </Routes>,
            { initialEntries: ['/study/test-study/sort/rough'] }
        );

        // Fast-forward time to trigger the hint (1500ms delay)
        act(() => {
            vi.advanceTimersByTime(2000);
        });

        // Check for Hint (now at bottom)
        expect(screen.getByText('rough.header.hint')).toBeTruthy();
        // Check for Title
        expect(screen.getByText('rough.header.title')).toBeTruthy();

        vi.useRealTimers();
    });

    it('renders the Control Cluster buttons', () => {
        renderWithProviders(
            <Routes>
                <Route path="/study/:slug/sort/rough" element={<RoughSortPage />} />
            </Routes>,
            { initialEntries: ['/study/test-study/sort/rough'] }
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

        renderWithProviders(
            <Routes>
                <Route path="/study/:slug/sort/rough" element={<RoughSortPage />} />
            </Routes>,
            { initialEntries: ['/study/test-study/sort/rough'] }
        );

        expect(screen.getByText('rough.complete.title')).toBeTruthy();
        expect(screen.getByText('common.next')).toBeTruthy();
    });

    it('persists progress when re-navigating', () => {
        // Categorize one card
        useResponseStore.getState().categorizeCard(1, 'agree');

        const { unmount } = renderWithProviders(
            <Routes>
                <Route path="/study/:slug/sort/rough" element={<RoughSortPage />} />
            </Routes>,
            { initialEntries: ['/study/test-study/sort/rough'] }
        );

        // Card 1 is gone, Card 2 is current
        expect(screen.getByText('Card 2')).toBeTruthy();

        unmount();

        renderWithProviders(
            <Routes>
                <Route path="/study/:slug/sort/rough" element={<RoughSortPage />} />
            </Routes>,
            { initialEntries: ['/study/test-study/sort/rough'] }
        );
    });

    it('handles keyboard navigation (Arrow Keys)', () => {
        renderWithProviders(
            <Routes>
                <Route path="/study/:slug/sort/rough" element={<RoughSortPage />} />
            </Routes>,
            { initialEntries: ['/study/test-study/sort/rough'] }
        );

        // Arrow Right -> Agree
        act(() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
        });

        // Assert state change directly
        const updatedStore = useResponseStore.getState();
        // Since we categorized card 1, it should be in history and assigned 'agree'
        expect(updatedStore.rough.history).toContain(1);
        expect(updatedStore.rough.agree).toContain(1);
    });

    it('handles keyboard undo (Z key)', () => {
        const store = useResponseStore.getState();
        // Pre-fill history to allow undo
        store.categorizeCard(1, 'agree'); // Use action to populate state correctly

        renderWithProviders(
            <Routes>
                <Route path="/study/:slug/sort/rough" element={<RoughSortPage />} />
            </Routes>,
            { initialEntries: ['/study/test-study/sort/rough'] }
        );

        expect(useResponseStore.getState().rough.history.length).toBe(1);

        act(() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z' }));
        });

        expect(useResponseStore.getState().rough.history.length).toBe(0);
    });

    it('handles button clicks (Agree/Disagree/Neutral)', () => {
        renderWithProviders(
            <Routes>
                <Route path="/study/:slug/sort/rough" element={<RoughSortPage />} />
            </Routes>,
            { initialEntries: ['/study/test-study/sort/rough'] }
        );

        // Click Agree
        act(() => {
            const agreeBtn = screen.getByLabelText('common.agree');
            agreeBtn.click();
        });
        expect(useResponseStore.getState().rough.agree).toContain(1);

        // Reset for next click (since card 1 moves, we need to reset or check next card if available,
        // but here we only have cards 1,2,3. Card 1 is now handled.)
        // Actually, if we click agree, Card 1 goes to agree. Next is Card 2.

        // Clicks on subsequent cards
        act(() => {
            const disagreeBtn = screen.getByLabelText('common.disagree');
            disagreeBtn.click();
        });
        // Card 2 should be in disagree
        expect(useResponseStore.getState().rough.disagree).toContain(2);

        act(() => {
            const neutralBtn = screen.getByLabelText('common.neutral');
            neutralBtn.click();
        });
        // Card 3 should be in neutral
        expect(useResponseStore.getState().rough.neutral).toContain(3);
    });
});
