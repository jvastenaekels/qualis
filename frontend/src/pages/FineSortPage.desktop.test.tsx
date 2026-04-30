import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StudyLayout from '../layouts/StudyLayout';
import { useConfigStore } from '../store/useConfigStore';
import { useResponseStore } from '../store/useResponseStore';
import { useSessionStore } from '../store/useSessionStore';
import { renderWithProviders } from '../test-utils/test-utils';
import { setViewport } from '../test-utils/viewports';
import FineSortPage from './FineSortPage';

// Stub the network-driven config loader so MSW cannot overwrite per-test
// setConfig payloads (e.g. rough_sort_enabled=false in deck-mode tests).
vi.mock('../hooks/useStudyConfig', () => ({
    useStudyConfig: () => ({
        retry: vi.fn(),
        unlock: vi.fn(),
        passwordError: false,
    }),
}));

describe('FineSortPage Desktop Layout (Integration)', () => {
    beforeEach(() => {
        useConfigStore.getState().resetConfig();
        useResponseStore.getState().resetResponses();
        useSessionStore.getState().resetSession();

        setViewport('desktop');
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

describe('FineSortPage Desktop (deck mode)', () => {
    beforeEach(() => {
        useConfigStore.getState().resetConfig();
        useResponseStore.getState().resetResponses();
        useSessionStore.getState().resetSession();
        setViewport('desktop');
    });

    it('flat deck still uses lg:grid-cols-2 layout', async () => {
        useResponseStore.getState().addToDeck(1);
        useResponseStore.getState().addToDeck(2);
        useResponseStore.getState().addToDeck(3);
        useSessionStore.getState().setConsent(true);
        useConfigStore.getState().setConfig({
            slug: 'demo-deck',
            title: 'Deck Study',
            rough_sort_enabled: false,
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
            { initialEntries: ['/study/demo-deck/fine-sort'] }
        );

        const deckContainer = await screen.findByTestId('deck-cards-container');
        expect(deckContainer).toBeTruthy();
        expect(deckContainer.className).toContain('lg:grid-cols-2');
    });
});
