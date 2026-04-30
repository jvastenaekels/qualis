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

vi.mock('../store/useResponseStore', () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock type
    const useResponseStore = (selector: (state: any) => any) => {
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
    };
    // useFineSort calls `useResponseStore.setState({...})` as a defensive
    // reset in deck mode. Provide a no-op so the page does not crash; the
    // tests do not rely on the reset being observable through this mock.
    return {
        useResponseStore: Object.assign(useResponseStore, {
            setState: vi.fn(),
            getState: () => ({
                ...responseFixture,
                placeCardInGrid: vi.fn(),
                moveCardInGrid: vi.fn(),
                swapCardsInGrid: vi.fn(),
                unplaceCard: vi.fn(),
                categorizeCard: mockCategorizeCard,
                addToDeck: mockAddToDeck,
                resetFineSort: vi.fn(),
            }),
        }),
    };
});

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

// ─────────────────────────────────────────────────────────────────────
// Task 20.5.4 — Resilience / state-restore edge cases
// ─────────────────────────────────────────────────────────────────────

describe('FineSortPage resilience — stale rough slice across modes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test.each([
        true,
        false,
    ] as const)('reconciles when draft has a stale rough slice and rough_sort_enabled=%s', async (roughEnabled) => {
        // Common config with 5 statements
        configFixture = {
            rough_sort_enabled: roughEnabled,
            statements: [
                { id: 1, text: 'Card 1' },
                { id: 2, text: 'Card 2' },
                { id: 3, text: 'Card 3' },
                { id: 4, text: 'Card 4' },
                { id: 5, text: 'Card 5' },
            ],
            grid_config: [{ score: 0, capacity: 5 }],
        };
        // Stale rough slice with 5 cards distributed across piles.
        responseFixture = {
            rough: {
                agree: [1, 2],
                disagree: [3],
                neutral: [4, 5],
                history: [1, 2, 3, 4, 5],
            },
            deck: [],
            qsort: [],
        };

        render(<FineSortPage />);

        if (roughEnabled) {
            // Rough mode: every id is already in some rough pile, so
            // the reconciler must not call categorizeCard or addToDeck.
            await waitFor(() => {
                // wait one tick to let the reconciliation effect run
                expect(mockAddToDeck).not.toHaveBeenCalled();
            });
            expect(mockCategorizeCard).not.toHaveBeenCalled();
        } else {
            // Deck mode: the stale rough slice must be ignored. The
            // defensive reset clears `rough` (via setState in the
            // hook — we cannot observe that on a mocked store) and
            // every config statement gets reconciled into the deck.
            await waitFor(() => {
                expect(mockAddToDeck).toHaveBeenCalledWith(1);
            });
            expect(mockAddToDeck).toHaveBeenCalledWith(2);
            expect(mockAddToDeck).toHaveBeenCalledWith(3);
            expect(mockAddToDeck).toHaveBeenCalledWith(4);
            expect(mockAddToDeck).toHaveBeenCalledWith(5);
            // No rough-mode fallback was used.
            expect(mockCategorizeCard).not.toHaveBeenCalled();
        }
    });
});

describe('FineSortPage resilience — resume after browser tab close (rough mode)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Restored draft: 4 statements, 2 placed in qsort, the other 2 in
        // rough piles. Selected card is part of the unplaced rough set.
        configFixture = {
            statements: [
                { id: 1, text: 'Card 1' },
                { id: 2, text: 'Card 2' },
                { id: 3, text: 'Card 3' },
                { id: 4, text: 'Card 4' },
            ],
            grid_config: [
                { score: -1, capacity: 2 },
                { score: 0, capacity: 2 },
                { score: 1, capacity: 2 },
            ],
        };
        responseFixture = {
            rough: { agree: [3], disagree: [4], neutral: [], history: [3, 4] },
            deck: [],
            qsort: [
                { statementId: 1, col: 0, row: 0 },
                { statementId: 2, col: 2, row: 0 },
            ],
        };
    });

    test('placed cards survive remount and reconciliation does not duplicate ids', async () => {
        render(<FineSortPage />);

        // Wait one tick so the reconciliation effect runs.
        await waitFor(() => {
            // No reconciliation needed: every id is either in qsort or rough.
            expect(mockAddToDeck).not.toHaveBeenCalled();
        });
        expect(mockCategorizeCard).not.toHaveBeenCalled();
    });
});

describe('FineSortPage resilience — resume code mid-flow (deck mode, last_step=4)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        configFixture = {
            rough_sort_enabled: false,
            statements: [
                { id: 1, text: 'Card 1' },
                { id: 2, text: 'Card 2' },
                { id: 3, text: 'Card 3' },
                { id: 4, text: 'Card 4' },
            ],
            grid_config: [
                { score: -1, capacity: 2 },
                { score: 0, capacity: 1 },
                { score: 1, capacity: 1 },
            ],
        };
        // Partial qsort: 2 placed, 2 still on the deck.
        responseFixture = {
            rough: { agree: [], disagree: [], neutral: [], history: [] },
            deck: [3, 4],
            qsort: [
                { statementId: 1, col: 0, row: 0 },
                { statementId: 2, col: 2, row: 0 },
            ],
        };
    });

    test('mid-flow resume in deck mode does not re-reconcile already-known ids', async () => {
        render(<FineSortPage />);

        // Reconciler must not push any of the 4 cards: 1 and 2 are placed,
        // 3 and 4 are already on the flat deck.
        await waitFor(() => {
            // Single-shot: the reconciliation effect runs synchronously after
            // mount. If anything was wrong we'd see addToDeck called.
            expect(mockAddToDeck).not.toHaveBeenCalled();
        });
        expect(mockCategorizeCard).not.toHaveBeenCalled();
    });
});

describe('FineSortPage resilience — config flip mid-session (rough → deck)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Participant started in rough mode (rough piles populated) but the
        // config now reports rough_sort_enabled=false. Backend lock prevents
        // this in production; this test only verifies the frontend does
        // not crash and the deck-mode reconciler takes over cleanly.
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
            // Stale rough slice from when the participant started with rough enabled.
            rough: { agree: [1], disagree: [2], neutral: [3], history: [1, 2, 3] },
            deck: [],
            qsort: [],
        };
    });

    test('does not crash; reconciler reroutes every id through addToDeck', async () => {
        render(<FineSortPage />);

        await waitFor(() => {
            expect(mockAddToDeck).toHaveBeenCalledWith(1);
        });
        expect(mockAddToDeck).toHaveBeenCalledWith(2);
        expect(mockAddToDeck).toHaveBeenCalledWith(3);
        // The page must NOT fall back on rough-mode reconciliation.
        expect(mockCategorizeCard).not.toHaveBeenCalled();
    });
});
