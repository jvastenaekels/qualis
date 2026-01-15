import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import FineSortPage from './FineSortPage';

// Mocks
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => ({
    ...(await vi.importActual<Record<string, unknown>>('react-router-dom')),
    useNavigate: () => mockNavigate,
    useParams: () => ({ slug: 'test-study' }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

// Mock Stores
const mockCategorizeCard = vi.fn();

vi.mock('../store/useConfigStore', () => ({
    // biome-ignore lint/suspicious/noExplicitAny: mock type
    useConfigStore: (selector: (state: any) => any) => {
        const state = {
            config: {
                statements: [
                    { id: 1, text: 'Card 1' },
                    { id: 2, text: 'Card 2' },
                    { id: 3, text: 'Card 3' }, // Missing from responses
                ],
                grid_config: [{ score: 0, capacity: 3 }],
            },
        };
        return selector ? selector(state) : state;
    },
}));

vi.mock('../store/useResponseStore', () => ({
    // biome-ignore lint/suspicious/noExplicitAny: mock type
    useResponseStore: (selector: (state: any) => any) => {
        const state = {
            rough: {
                agree: [1],
                disagree: [],
                neutral: [2], // Card 3 is missing entirely
            },
            qsort: [],
            placeCardInGrid: vi.fn(),
            moveCardInGrid: vi.fn(),
            swapCardsInGrid: vi.fn(),
            unplaceCard: vi.fn(),
            categorizeCard: mockCategorizeCard,
            resetFineSort: vi.fn(),
        };
        return selector ? selector(state) : state;
    },
}));

vi.mock('../store/useSessionStore', () => ({
    // biome-ignore lint/suspicious/noExplicitAny: mock type
    useSessionStore: (selector: (state: any) => any) => {
        const state = {
            setStep: vi.fn(),
        };
        return selector ? selector(state) : state;
    },
}));

vi.mock('../store/useUIStore', () => ({
    // biome-ignore lint/suspicious/noExplicitAny: mock type
    useUIStore: (selector: (state: any) => any) => {
        const state = {
            setSelectedCard: vi.fn(),
        };
        return selector ? selector(state) : state;
    },
}));

vi.mock('../hooks/useLayout', () => ({
    useLayoutAction: () => ({
        setHeaderAction: vi.fn(),
    }),
}));

// Mock DnD Hook to avoid complex DnD logic
vi.mock('../hooks/useFineSortDrag', () => ({
    useFineSortDrag: () => ({
        activeId: null,
        handleDragStart: vi.fn(),
        handleDragMove: vi.fn(),
        handleDragEnd: vi.fn(),
        handleCardClick: vi.fn(),
        handleSlotClick: vi.fn(),
    }),
}));

describe('FineSortPage Reconciliation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('recovers missing cards into neutral deck on mount', async () => {
        render(<FineSortPage />);

        // Card 3 is in config but not in rough/qsort.
        // It should trigger categorizeCard(3, 'neutral')
        await waitFor(() => {
            expect(mockCategorizeCard).toHaveBeenCalledWith(3, 'neutral');
        });

        // Ensure other cards are NOT reconciled
        expect(mockCategorizeCard).not.toHaveBeenCalledWith(1, expect.anything());
        expect(mockCategorizeCard).not.toHaveBeenCalledWith(2, expect.anything());
    });
});
