/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StudyConfig } from '../schemas/study';
import { act, renderWithProviders, screen, setupStoreMocks } from '../test/test-utils';
import FineSortPage from './FineSortPage';

const mockConfig: StudyConfig = {
    slug: 'demo',
    title: 'Test',
    description: 'Test',
    instructions: 'Test',
    statements: [
        { id: 1, text: 'S1' },
        { id: 2, text: 'S2' },
    ],
    grid_config: [{ score: 0, capacity: 2 }],
    presort_config: {},
};

// Mock Stores (Core)
vi.mock('../store/useConfigStore', () => ({
    useConfigStore: Object.assign(vi.fn(), {
        getState: () => ({ setConfig: vi.fn(), config: mockConfig }),
    }),
}));
vi.mock('../store/useSessionStore', () => ({ useSessionStore: vi.fn() }));
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
vi.mock('../store/useUIStore', () => ({ useUIStore: vi.fn() }));

// Mocks
vi.mock('../hooks/useLayout', () => ({
    useLayoutAction: () => ({
        setHeaderAction: vi.fn(),
    }),
}));

// Mock GridSort
vi.mock('../components/GridSort', () => ({
    // biome-ignore lint/suspicious/noExplicitAny: mock prop
    default: ({ isAllPlaced, onValidate, showCodes }: any) => (
        <div data-testid="grid-sort">
            GridSort
            <span data-testid="show-codes">{String(showCodes)}</span>
            {isAllPlaced && (
                <button type="button" onClick={onValidate}>
                    fine.actions.validate
                </button>
            )}
        </div>
    ),
}));

// Mock useStudyConfig
vi.mock('../hooks/useStudyConfig', () => ({
    useStudyConfig: () => ({ isLoading: false, error: null }),
}));

// Mock translation
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
    initReactI18next: { type: '3rdParty', init: () => {} },
}));

describe('FineSortPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('does not show validation button when not all cards are placed', () => {
        setupStoreMocks({
            useConfigStore: { config: mockConfig },
            useResponseStore: {
                categorizeCard: vi.fn(),
                rough: { agree: [1, 2], disagree: [], neutral: [] },
                qsort: [],
            },
            useSessionStore: {
                hasConsented: true,
                currentStep: 4,
                isCompleted: false,
                language: 'en',
                setStep: vi.fn(),
            },
            useUIStore: {
                hoveredCard: null,
                setActiveCard: vi.fn(),
                setHoveredCard: vi.fn(),
                setSelectedCard: vi.fn(),
            },
        });

        act(() => {
            renderWithProviders(<FineSortPage />);
        });

        expect(screen.queryByText('fine.actions.validate')).toBeNull();
    });

    it('shows validation button when all cards placed', () => {
        const singleCardConfig: StudyConfig = {
            ...mockConfig,
            statements: [{ id: 1, text: 'S1' }],
            grid_config: [{ capacity: 1, score: 0 }],
        };

        setupStoreMocks({
            useConfigStore: { config: singleCardConfig },
            useResponseStore: {
                categorizeCard: vi.fn(),
                rough: { agree: [1], disagree: [], neutral: [] },
                qsort: [{ statementId: 1, col: 0, row: 0 }],
            },
            useSessionStore: {
                hasConsented: true,
                currentStep: 4,
                isCompleted: false,
                language: 'en',
                setStep: vi.fn(),
            },
            useUIStore: {
                hoveredCard: null,
                setActiveCard: vi.fn(),
                setHoveredCard: vi.fn(),
                setSelectedCard: vi.fn(),
            },
        });

        act(() => {
            renderWithProviders(<FineSortPage />);
        });

        expect(screen.getByText('fine.actions.validate')).toBeInTheDocument();
    });

    it('passes show_statement_codes config to GridSort', () => {
        const configWithCodes: StudyConfig = {
            ...mockConfig,
            show_statement_codes: true,
        };

        setupStoreMocks({
            useConfigStore: { config: configWithCodes },
            useResponseStore: {
                categorizeCard: vi.fn(),
                rough: { agree: [], disagree: [], neutral: [] },
                qsort: [],
            },
            useSessionStore: {
                hasConsented: true,
                currentStep: 4,
                isCompleted: false,
                language: 'en',
                setStep: vi.fn(),
            },
            useUIStore: {
                hoveredCard: null,
                setActiveCard: vi.fn(),
                setHoveredCard: vi.fn(),
                setSelectedCard: vi.fn(),
            },
        });

        act(() => {
            renderWithProviders(<FineSortPage />);
        });
        expect(screen.getByTestId('show-codes')).toHaveTextContent('true');
    });
});
