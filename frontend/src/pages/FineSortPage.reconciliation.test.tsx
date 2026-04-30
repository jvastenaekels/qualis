import { renderWithProviders as render } from '../test-utils/test-utils';
import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import FineSortPage from './FineSortPage';

// Mocks
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => ({
    ...(await vi.importActual<Record<string, unknown>>('react-router-dom')),
    useNavigate: () => mockNavigate,
    useParams: () => ({ slug: 'test-study' }),
}));

const mockCategorizeCard = vi.fn();
const mockAddToDeck = vi.fn();

// Mutable fixtures swapped per-suite via beforeEach. Module-mock factories
// read from these refs at hook call time, so each describe block can vary
// the response store / config without redefining the mocks.
type ConfigFixture = {
    rough_sort_enabled?: boolean;
    statements: { id: number; text: string }[];
    grid_config: { score: number; capacity: number }[];
};
type ResponseFixture = {
    rough: { agree: number[]; disagree: number[]; neutral: number[]; history?: number[] };
    deck: number[];
    qsort: { statementId: number; col: number; row: number }[];
};

const roughConfigFixture: ConfigFixture = {
    statements: [
        { id: 1, text: 'Card 1' },
        { id: 2, text: 'Card 2' },
        { id: 3, text: 'Card 3' }, // Missing from responses
    ],
    grid_config: [{ score: 0, capacity: 3 }],
};
const roughResponseFixture: ResponseFixture = {
    rough: { agree: [1], disagree: [], neutral: [2], history: [] },
    deck: [],
    qsort: [],
};

let configFixture: ConfigFixture = roughConfigFixture;
let responseFixture: ResponseFixture = roughResponseFixture;

vi.mock('../store/useConfigStore', () => ({
    // biome-ignore lint/suspicious/noExplicitAny: mock type
    useConfigStore: (selector: (state: any) => any) => {
        const state = { config: configFixture };
        return selector ? selector(state) : state;
    },
}));

vi.mock('../store/useResponseStore', () => ({
    // biome-ignore lint/suspicious/noExplicitAny: mock type
    useResponseStore: (selector: (state: any) => any) => {
        const state = {
            ...responseFixture,
            placeCardInGrid: vi.fn(),
            moveCardInGrid: vi.fn(),
            swapCardsInGrid: vi.fn(),
            unplaceCard: vi.fn(),
            categorizeCard: mockCategorizeCard,
            addToDeck: mockAddToDeck,
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
        configFixture = roughConfigFixture;
        responseFixture = roughResponseFixture;
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

describe('FineSortPage Reconciliation — deck mode', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        configFixture = {
            rough_sort_enabled: false,
            statements: [
                { id: 1, text: 'Card 1' },
                { id: 2, text: 'Card 2' },
                { id: 3, text: 'Card 3' },
            ],
            grid_config: [{ score: 0, capacity: 3 }],
        };
        responseFixture = {
            rough: { agree: [], disagree: [], neutral: [], history: [] },
            // Card 3 is missing from both the flat deck AND qsort — and there
            // is no rough pile to fall back on in deck mode.
            deck: [1, 2],
            qsort: [],
        };
    });

    test('orphan cards recovered into flat deck (no neutral pile)', async () => {
        render(<FineSortPage />);

        await waitFor(() => {
            expect(mockAddToDeck).toHaveBeenCalledWith(3);
        });

        // Cards already in deck must NOT be re-reconciled.
        expect(mockAddToDeck).not.toHaveBeenCalledWith(1);
        expect(mockAddToDeck).not.toHaveBeenCalledWith(2);
        // No rough-mode fallback in deck mode.
        expect(mockCategorizeCard).not.toHaveBeenCalled();
    });
});
