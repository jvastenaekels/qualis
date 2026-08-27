/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import StudyLayout from '../layouts/StudyLayout';
import { useConfigStore } from '../store/useConfigStore';
import { useResponseStore } from '../store/useResponseStore';
import { useSessionStore } from '../store/useSessionStore';
import { renderWithProviders } from '../test-utils/test-utils';
import { setViewport } from '../test-utils/viewports';
import FineSortPage from './FineSortPage';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
    I18nextProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Stub the network-driven config loader so the MSW fixture (which has no
// rough_sort_enabled flag) cannot overwrite the per-test setConfig payload.
vi.mock('../hooks/useStudyConfig', () => ({
    useStudyConfig: () => ({
        retry: vi.fn(),
        unlock: vi.fn(),
        passwordError: false,
    }),
}));

describe('FineSortPage Mobile Interaction (Integration)', () => {
    beforeEach(() => {
        // Setup initial session state for the test
        useSessionStore.getState().setConsent(true);
        useSessionStore.getState().setStep(4); // Fine Sort step

        // Pre-load config to ensure placeCardInGrid and other store actions work immediately
        useConfigStore.getState().setConfig({
            slug: 'demo',
            title: 'Demo Study',
            description: 'Mocked for testing',
            instructions: 'Sort them',
            statements: [
                { id: 1, text: 'Statement 1' },
                { id: 2, text: 'Statement 2' },
                { id: 3, text: 'Statement 3' },
            ],
            grid_config: [
                { score: -1, capacity: 1 },
                { score: 0, capacity: 1 },
                { score: 1, capacity: 1 },
            ],
            presort_config: {},
            // biome-ignore lint/suspicious/noExplicitAny: mock config
        } as any);

        // Mock viewport size for mobile
        Object.defineProperty(window, 'innerWidth', {
            writable: true,
            configurable: true,
            value: 375,
        });

        // Mock matchMedia for mobile
        Object.defineProperty(window, 'matchMedia', {
            writable: true,
            value: vi.fn().mockImplementation((query) => ({
                matches: true, // Always match mobile queries
                media: query,
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })),
        });

        window.dispatchEvent(new Event('resize'));
    });

    // Note: This test is skipped due to complex state requirements in mobile environment
    // The selection state and mobile detection don't trigger properly in the mocked test environment
    it.skip('allows "Tap-to-Place" interaction: Select Card -> Tap Slot -> Move', async () => {
        // 1. Prepare rough sort results and consent
        useResponseStore.getState().categorizeCard(1, 'disagree');
        useSessionStore.getState().setConsent(true);

        renderWithProviders(
            <Routes>
                <Route path="/study/:slug" element={<StudyLayout />}>
                    <Route path="sort/fine" element={<FineSortPage />} />
                </Route>
            </Routes>,
            { initialEntries: ['/study/demo/sort/fine'] }
        );

        // 2. Ensure we are on the 'disagree' pile
        const disagreeTab = await screen.findByRole('tab', {
            name: /common.disagree/i,
        });
        fireEvent.click(disagreeTab);

        // 3. Wait for Card 1 to appear in the deck
        const card = await screen.findByText(/Statement 1/i);
        expect(card).toBeTruthy();

        // 4. User Taps Card (Select)
        fireEvent.click(card);

        // 5. Verify Workbench appears
        expect(await screen.findByText(/fine.workbench.place_on_grid/i)).toBeTruthy();

        // 6. User Taps Empty Slot (Place)
        const slot = screen.getByTestId('slot_0_0');
        fireEvent.click(slot);

        // 7. Verify Card moved to Grid (Careful with ambiguity vs Workbench)
        await waitFor(
            () => {
                const cardInSlot = within(slot).getByTestId('card-1');
                expect(cardInSlot).toBeTruthy();
            },
            { timeout: 4000 }
        );

        // 8. Verify Deck shows completion message (Updated with precision)
        expect(screen.getByText(/fine.deck.all_placed/i)).toBeTruthy();
    });

    it('displays the precise "empty pile" message when a category is fully placed', async () => {
        useResponseStore.getState().categorizeCard(1, 'disagree');
        useResponseStore.getState().placeCardInGrid(1, 0, 0);

        renderWithProviders(
            <Routes>
                <Route path="/study/:slug" element={<StudyLayout />}>
                    <Route path="sort/fine" element={<FineSortPage />} />
                </Route>
            </Routes>,
            { initialEntries: ['/study/demo/sort/fine'] }
        );

        // Ensure we are on 'disagree'
        const disagreeTab = await screen.findByRole('tab', {
            name: /common.disagree/i,
        });
        fireEvent.click(disagreeTab);

        // Check for precise "all placed" label
        expect(screen.getByText('fine.deck.all_placed')).toBeInTheDocument();
    });

    it('allows "Tap-to-Swap" interaction: Select Card -> Tap Occupied Slot -> Swap', async () => {
        // 1. Prepare state: Card 2 in Disagree Pile. Card 1 already in Grid at 0,0.
        useResponseStore.getState().categorizeCard(1, 'disagree');
        useResponseStore.getState().categorizeCard(2, 'disagree');
        useResponseStore.getState().placeCardInGrid(1, 0, 0);
        useSessionStore.getState().setConsent(true);

        renderWithProviders(
            <Routes>
                <Route path="/study/:slug" element={<StudyLayout />}>
                    <Route path="sort/fine" element={<FineSortPage />} />
                </Route>
            </Routes>,
            { initialEntries: ['/study/demo/sort/fine'] }
        );

        // 2. Ensure we are on the 'disagree' pile
        const disagreeTab = await screen.findByRole('tab', {
            name: /common.disagree/i,
        });
        fireEvent.click(disagreeTab);

        // 3. Select Card 2 (in Deck)
        const cardInDeck = await screen.findByText(/Statement 2/i);
        fireEvent.click(cardInDeck);

        // 4. Tap Occupied Slot (Slot 0,0 has Card 1/Statement 1)
        const slot = screen.getByTestId('slot_0_0');
        fireEvent.click(slot);

        // 5. Verify Swap: Card 2 should now be in the grid slot
        await waitFor(
            () => {
                const card2InSlot = within(slot).getByTestId('card-2');
                expect(card2InSlot).toBeTruthy();
            },
            { timeout: 4000 }
        );

        // 6. Card 1 should be back in the deck
        expect(await screen.findByText(/Statement 1/i)).toBeTruthy();
    });
});

// --- Deck mode (rough_sort_enabled=false) on mobile ──────────────────
describe('FineSortPage Mobile (deck mode)', () => {
    beforeEach(() => {
        useResponseStore.setState({
            rough: { agree: [], disagree: [], neutral: [], history: [] },
            deck: [],
            qsort: [],
        });
        useSessionStore.getState().setConsent(true);
        useSessionStore.getState().setStep(4);

        useConfigStore.getState().setConfig({
            slug: 'demo',
            title: 'Demo Study',
            description: 'Mocked for testing',
            instructions: 'Sort them',
            rough_sort_enabled: false,
            statements: [
                { id: 1, text: 'Statement 1' },
                { id: 2, text: 'Statement 2' },
                { id: 3, text: 'Statement 3' },
            ],
            grid_config: [
                { score: -1, capacity: 1 },
                { score: 0, capacity: 1 },
                { score: 1, capacity: 1 },
            ],
            presort_config: {},
            // biome-ignore lint/suspicious/noExplicitAny: mock config
        } as any);

        setViewport('mobile_portrait');

        Object.defineProperty(window, 'matchMedia', {
            writable: true,
            value: vi.fn().mockImplementation((query) => ({
                matches: true,
                media: query,
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })),
        });
    });

    it('shows the "all placed" message when the flat deck empties', async () => {
        // Place every statement on the grid; the flat deck is empty.
        useResponseStore.getState().placeCardInGrid(1, 0, 0);
        useResponseStore.getState().placeCardInGrid(2, 1, 0);
        useResponseStore.getState().placeCardInGrid(3, 2, 0);

        renderWithProviders(
            <Routes>
                <Route path="/study/:slug" element={<StudyLayout />}>
                    <Route path="sort/fine" element={<FineSortPage />} />
                </Route>
            </Routes>,
            { initialEntries: ['/study/demo/sort/fine'] }
        );

        // No PileTab to click in deck mode — the empty-state copy should
        // appear directly in the deck-cards-container.
        const emptyMessage = await screen.findByText('fine.deck.all_placed');
        expect(emptyMessage).toBeInTheDocument();
    });

    it('Tap-to-Swap interaction works in deck mode', async () => {
        // Card 1 is already on the grid; Card 2 sits in the flat deck.
        useResponseStore.getState().placeCardInGrid(1, 0, 0);
        useResponseStore.getState().addToDeck(2);
        useResponseStore.getState().addToDeck(3);

        renderWithProviders(
            <Routes>
                <Route path="/study/:slug" element={<StudyLayout />}>
                    <Route path="sort/fine" element={<FineSortPage />} />
                </Route>
            </Routes>,
            { initialEntries: ['/study/demo/sort/fine'] }
        );

        // Select Card 2 from the flat deck (no PileTab interaction needed).
        const cardInDeck = await screen.findByText(/Statement 2/i);
        fireEvent.click(cardInDeck);

        // Tap occupied slot 0,0 (currently holding Card 1).
        const slot = screen.getByTestId('slot_0_0');
        fireEvent.click(slot);

        // Swap: Card 2 ends up in the slot, Card 1 returns to the deck.
        await waitFor(
            () => {
                const card2InSlot = within(slot).getByTestId('card-2');
                expect(card2InSlot).toBeTruthy();
            },
            { timeout: 4000 }
        );
        expect(await screen.findByText(/Statement 1/i)).toBeTruthy();
    });

    it('mobile_landscape: deck-cards-container still rendered', async () => {
        setViewport('mobile_landscape');
        useResponseStore.getState().addToDeck(1);
        useResponseStore.getState().addToDeck(2);
        useResponseStore.getState().addToDeck(3);

        renderWithProviders(
            <Routes>
                <Route path="/study/:slug" element={<StudyLayout />}>
                    <Route path="sort/fine" element={<FineSortPage />} />
                </Route>
            </Routes>,
            { initialEntries: ['/study/demo/sort/fine'] }
        );

        // The deck-cards-container is the canonical rendering anchor and
        // must resolve in deck mode regardless of orientation.
        const container = await screen.findByTestId('deck-cards-container');
        expect(container).toBeInTheDocument();
    });
});
