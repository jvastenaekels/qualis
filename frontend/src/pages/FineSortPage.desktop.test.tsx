import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import StudyLayout from '../layouts/StudyLayout';
import { useConfigStore } from '../store/useConfigStore';
import { useResponseStore } from '../store/useResponseStore';
import { useSessionStore } from '../store/useSessionStore';
import { renderWithProviders } from '../test-utils/test-utils';
import FineSortPage from './FineSortPage';

describe('FineSortPage Desktop Layout (Integration)', () => {
    beforeEach(() => {
        useConfigStore.getState().resetConfig();
        useResponseStore.getState().resetResponses();
        useSessionStore.getState().resetSession();

        // Mock viewport size for desktop
        Object.defineProperty(window, 'innerWidth', {
            writable: true,
            configurable: true,
            value: 1200,
        });
        window.dispatchEvent(new Event('resize'));
    });

    it('organizes deck cards in two columns on desktop', async () => {
        // 1. Prepare rough sort results with multiple cards and consent
        useResponseStore.getState().categorizeCard(1, 'disagree');
        useResponseStore.getState().categorizeCard(2, 'disagree');
        useResponseStore.getState().categorizeCard(3, 'disagree');
        useSessionStore.getState().setConsent(true);
        useConfigStore.getState().setConfig({
            slug: 'demo-study',
            title: 'Demo Study',
            statements: [
                { id: 1, code: '1', text: 'Statement 1' },
                { id: 2, code: '2', text: 'Statement 2' },
                { id: 3, code: '3', text: 'Statement 3' },
            ],
            grid_config: [
                { score: -1, capacity: 1 },
                { score: 0, capacity: 1 },
                { score: 1, capacity: 1 },
            ],
            // biome-ignore lint/suspicious/noExplicitAny: partial mock
        } as any);

        renderWithProviders(
            <Routes>
                <Route path="/study/:slug" element={<StudyLayout />}>
                    <Route path="fine-sort" element={<FineSortPage />} />
                </Route>
            </Routes>,
            { initialEntries: ['/study/demo-study/fine-sort'] }
        );

        // 2. Wait for cards to appear
        await screen.findByText(/Statement 1/i);
        await screen.findByText(/Statement 2/i);
        await screen.findByText(/Statement 3/i);

        // 3. Verify they are inside a grid container with 2 columns
        const deckContainer = screen.getByTestId('deck-cards-container');
        expect(deckContainer).toBeTruthy();
        expect(deckContainer.className).toContain('lg:grid-cols-2');
    });
});
