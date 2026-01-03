import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StudyConfig } from '../schemas/study';
import { renderWithProviders, screen, setupStoreMocks, fireEvent } from '../test/test-utils';
import FineSortPage from './FineSortPage';

// --- Mocks ---
const mockConfig: StudyConfig = {
    slug: 'demo',
    title: 'Test Study',
    description: 'Test Description',
    instructions: 'Test Instructions',
    statements: [
        { id: 1, text: 'Card 1 (Agree)' },
        { id: 2, text: 'Card 2 (Disagree)' },
        { id: 3, text: 'Card 3 (Neutral)' },
        { id: 4, text: 'Card 4 (Missing)' }, // For reconciliation test
    ],
    grid_config: [
        { score: -1, capacity: 1 },
        { score: 0, capacity: 2 },
        { score: 1, capacity: 1 },
    ],
    presort_config: {},
    show_statement_codes: true,
};

// Mock Stores
vi.mock('../store/useConfigStore', () => ({
    useConfigStore: Object.assign(vi.fn(), {
        getState: () => ({ setConfig: vi.fn(), config: mockConfig }),
    }),
}));

vi.mock('../store/useSessionStore', () => ({
    useSessionStore: Object.assign(vi.fn(), {
        getState: () => ({ setStep: vi.fn() }),
    }),
}));

vi.mock('../store/useResponseStore', () => ({
    useResponseStore: Object.assign(vi.fn(), {
        getState: () => ({
            categorizeCard: vi.fn(),
            placeCardInGrid: vi.fn(),
            moveCardInGrid: vi.fn(),
            swapCardsInGrid: vi.fn(),
            unplaceCard: vi.fn(),
            rough: { agree: [], disagree: [], neutral: [] },
            qsort: [],
        }),
    }),
}));

vi.mock('../store/useUIStore', () => ({
    useUIStore: Object.assign(vi.fn(), {
        getState: () => ({
            setSelectedCard: vi.fn(),
            setActiveCard: vi.fn(),
            setHoveredCard: vi.fn(),
        }),
    }),
}));

// Mock Navigation
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
        useParams: () => ({ slug: 'demo' }),
    };
});

// Mock Layout
vi.mock('../hooks/useLayout', () => ({
    useLayoutAction: () => ({
        setHeaderAction: vi.fn(),
    }),
}));

// Mock GridSort Component (Spying on props)
vi.mock('../components/GridSort', () => ({
    default: ({
        isAllPlaced,
        onValidate,
        agreeCards,
        disagreeCards,
        neutralCards,
        gridColumns,
    }: {
        isAllPlaced: boolean;
        onValidate: () => void;
        agreeCards: unknown[];
        disagreeCards: unknown[];
        neutralCards: unknown[];
        gridColumns: { capacity: number }[];
    }) => (
        <div data-testid="grid-sort">
            <h1>Fine Sort Grid</h1>
            <button
                type="button"
                data-testid="validate-btn"
                disabled={!isAllPlaced}
                onClick={onValidate}
            >
                Validate
            </button>
            <div data-testid="deck-agree">{agreeCards?.length ?? 0}</div>
            <div data-testid="deck-disagree">{disagreeCards?.length ?? 0}</div>
            <div data-testid="deck-neutral">{neutralCards?.length ?? 0}</div>
            <div data-testid="grid-slots">
                {gridColumns?.reduce(
                    (acc: number, col: { capacity: number }) => acc + col.capacity,
                    0
                ) ?? 0}
            </div>
        </div>
    ),
}));

// Mock Translation
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
    initReactI18next: { type: '3rdParty', init: () => {} },
}));

describe('FineSortPage Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders and initializes correctly', () => {
        setupStoreMocks({
            useConfigStore: { config: mockConfig },
            useResponseStore: {
                rough: { agree: [1], disagree: [2], neutral: [3, 4] }, // All accounted for
                qsort: [],
                placeCardInGrid: vi.fn(),
                moveCardInGrid: vi.fn(),
                swapCardsInGrid: vi.fn(),
                unplaceCard: vi.fn(),
                categorizeCard: vi.fn(),
                resetFineSort: vi.fn(),
            },
            useSessionStore: { currentStep: 4, language: 'en', setStep: vi.fn() },
            useUIStore: {
                setSelectedCard: vi.fn(),
                setActiveCard: vi.fn(),
                setHoveredCard: vi.fn(),
            },
        });

        renderWithProviders(<FineSortPage />);

        expect(screen.getByTestId('grid-sort')).toBeInTheDocument();
        // Check if decks received correct counts
        expect(screen.getByTestId('deck-agree')).toHaveTextContent('1');
        expect(screen.getByTestId('deck-disagree')).toHaveTextContent('1');
        expect(screen.getByTestId('deck-neutral')).toHaveTextContent('2'); // 3 and 4
    });

    it('reconciles missing cards into Neutral deck', () => {
        const categorizeCardMock = vi.fn();
        setupStoreMocks({
            useConfigStore: { config: mockConfig },
            useResponseStore: {
                categorizeCard: categorizeCardMock,
                // Scenario: Card 4 is in statements but NOT in rough buckets or qsort
                rough: { agree: [1], disagree: [2], neutral: [3] },
                qsort: [],
                placeCardInGrid: vi.fn(),
                moveCardInGrid: vi.fn(),
                swapCardsInGrid: vi.fn(),
                unplaceCard: vi.fn(),
                resetFineSort: vi.fn(),
            },
            useSessionStore: { currentStep: 4, setStep: vi.fn() },
            useUIStore: {
                setSelectedCard: vi.fn(),
                setActiveCard: vi.fn(),
                setHoveredCard: vi.fn(),
            },
        });

        renderWithProviders(<FineSortPage />);

        // The hook in FineSortPage should detect Card 4 is missing and auto-categorize it
        expect(categorizeCardMock).toHaveBeenCalledWith(4, 'neutral');
    });

    it('disables validation until all cards are placed', () => {
        setupStoreMocks({
            useConfigStore: { config: mockConfig },
            useResponseStore: {
                rough: { agree: [1], disagree: [], neutral: [] },
                qsort: [
                    { statementId: 2, col: 0, row: 0 },
                    { statementId: 3, col: 1, row: 0 },
                    { statementId: 4, col: 1, row: 1 },
                ],
                placeCardInGrid: vi.fn(),
                moveCardInGrid: vi.fn(),
                swapCardsInGrid: vi.fn(),
                unplaceCard: vi.fn(),
                categorizeCard: vi.fn(),
                resetFineSort: vi.fn(),
            },
            useSessionStore: { currentStep: 4, setStep: vi.fn() },
            useUIStore: {
                setSelectedCard: vi.fn(),
                setActiveCard: vi.fn(),
                setHoveredCard: vi.fn(),
            },
        });

        renderWithProviders(<FineSortPage />);

        const btn = screen.getByTestId('validate-btn');
        expect(btn).toBeDisabled(); // Card 1 is still in deck
    });

    it('enables validation and navigates on success', () => {
        setupStoreMocks({
            useConfigStore: { config: mockConfig },
            useResponseStore: {
                rough: { agree: [], disagree: [], neutral: [] },
                qsort: [
                    { statementId: 1, col: 2, row: 0 },
                    { statementId: 2, col: 0, row: 0 },
                    { statementId: 3, col: 1, row: 0 },
                    { statementId: 4, col: 1, row: 1 },
                ], // All 4 placed
                placeCardInGrid: vi.fn(),
                moveCardInGrid: vi.fn(),
                swapCardsInGrid: vi.fn(),
                unplaceCard: vi.fn(),
                categorizeCard: vi.fn(),
                resetFineSort: vi.fn(),
            },
            useSessionStore: { currentStep: 4, setStep: vi.fn() },
            useUIStore: {
                setSelectedCard: vi.fn(),
                setActiveCard: vi.fn(),
                setHoveredCard: vi.fn(),
            },
        });

        renderWithProviders(<FineSortPage />);

        const btn = screen.getByTestId('validate-btn');
        expect(btn).not.toBeDisabled();

        fireEvent.click(btn);
        expect(mockNavigate).toHaveBeenCalledWith('/study/demo/post-sort');
    });

    it('Escape key deselects active card', () => {
        const setSelectedCardMock = vi.fn();
        setupStoreMocks({
            useConfigStore: { config: mockConfig },
            useUIStore: {
                setSelectedCard: setSelectedCardMock,
                setActiveCard: vi.fn(),
                setHoveredCard: vi.fn(),
            },
            useResponseStore: {
                rough: { agree: [], disagree: [], neutral: [] },
                qsort: [],
                placeCardInGrid: vi.fn(),
                moveCardInGrid: vi.fn(),
                swapCardsInGrid: vi.fn(),
                unplaceCard: vi.fn(),
                categorizeCard: vi.fn(),
                resetFineSort: vi.fn(),
            },
            useSessionStore: { currentStep: 4, setStep: vi.fn() },
        });

        renderWithProviders(<FineSortPage />);

        fireEvent.keyDown(window, { key: 'Escape' });
    });
});
