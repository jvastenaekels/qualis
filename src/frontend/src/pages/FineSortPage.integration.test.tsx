/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StudyConfig } from '../schemas/study';
import { renderWithProviders, screen, setupStoreMocks } from '../test-utils/test-utils';
import FineSortPage from './FineSortPage';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
    Trans: ({ children, i18nKey }: { children: React.ReactNode; i18nKey?: string }) =>
        children || i18nKey,
    initReactI18next: { type: '3rdParty', init: () => {} },
    I18nextProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

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
vi.mock('../store/useResponseStore', () => ({ useResponseStore: vi.fn() }));
vi.mock('../store/useUIStore', () => ({ useUIStore: vi.fn() }));

// Mock useStudyConfig
vi.mock('../hooks/useStudyConfig', () => ({
    useStudyConfig: vi.fn(() => ({
        isLoading: false,
        error: null,
        retry: vi.fn(),
    })),
}));

// Mock translation

// Mock GridSort
vi.mock('../components/GridSort', () => ({
    default: ({ isAllPlaced, onValidate }: { isAllPlaced: boolean; onValidate: () => void }) => (
        <div data-testid="grid-sort">
            GridSort
            {isAllPlaced && (
                <button type="button" onClick={onValidate}>
                    fine.actions.validate
                </button>
            )}
        </div>
    ),
}));

// biome-ignore lint/suspicious/noExplicitAny: mock global
(global as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

describe('FineSortPage Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders "Finish Sorting" button in Header when grid is full', () => {
        setupStoreMocks({
            useConfigStore: { config: mockConfig, isLoading: false },
            useSessionStore: {
                hasConsented: true,
                currentStep: 4,
                isCompleted: false,
                language: 'en',
                setStep: vi.fn(),
            },
            useResponseStore: {
                rough: { agree: [], disagree: [], neutral: [] },
                qsort: [
                    { statementId: 1, col: 0, row: 0 },
                    { statementId: 2, col: 0, row: 1 },
                ],
            },
            useUIStore: {
                hoveredCard: null,
                setHoveredCard: vi.fn(),
                setSelectedCard: vi.fn(),
                setActiveCard: vi.fn(),
            },
        });

        renderWithProviders(<FineSortPage />, {
            initialEntries: ['/study/demo/sort/fine'],
        });

        expect(screen.getAllByText(/fine.actions.validate/i).length).toBeGreaterThan(0);
        const btns = screen.getAllByRole('button', {
            name: /fine.actions.validate/i,
        });
        for (const btn of btns) {
            expect((btn as HTMLButtonElement).disabled).toBe(false);
        }
    });

    it('hides "Finish Sorting" button when grid is NOT full', () => {
        setupStoreMocks({
            useConfigStore: { config: mockConfig, isLoading: false },
            useSessionStore: {
                currentStep: 4,
                hasConsented: true,
                isSaving: false,
                language: 'en',
                setStep: vi.fn(),
            },
            useResponseStore: {
                rough: { agree: [], disagree: [], neutral: [1, 2] },
                qsort: [],
            },
            useUIStore: {
                hoveredCard: null,
                setHoveredCard: vi.fn(),
                setSelectedCard: vi.fn(),
                setActiveCard: vi.fn(),
            },
        });

        renderWithProviders(<FineSortPage />, {
            initialEntries: ['/study/demo/sort/fine'],
        });

        expect(screen.queryAllByRole('button', { name: /fine.actions.validate/i }).length).toBe(0);
    });
});

const deckConfig: StudyConfig = {
    ...mockConfig,
    rough_sort_enabled: false,
};

describe('FineSortPage Integration — deck mode', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows "Finish Sorting" when grid is full in deck mode', () => {
        setupStoreMocks({
            useConfigStore: { config: deckConfig, isLoading: false },
            useSessionStore: {
                hasConsented: true,
                currentStep: 4,
                isCompleted: false,
                language: 'en',
                setStep: vi.fn(),
            },
            useResponseStore: {
                rough: { agree: [], disagree: [], neutral: [], history: [] },
                deck: [],
                qsort: [
                    { statementId: 1, col: 0, row: 0 },
                    { statementId: 2, col: 0, row: 1 },
                ],
            },
            useUIStore: {
                hoveredCard: null,
                setHoveredCard: vi.fn(),
                setSelectedCard: vi.fn(),
                setActiveCard: vi.fn(),
            },
        });

        renderWithProviders(<FineSortPage />, {
            initialEntries: ['/study/demo/sort/fine'],
        });

        const btns = screen.getAllByRole('button', {
            name: /fine.actions.validate/i,
        });
        expect(btns.length).toBeGreaterThan(0);
        for (const btn of btns) {
            expect((btn as HTMLButtonElement).disabled).toBe(false);
        }
    });

    it('hides "Finish Sorting" when grid is NOT full in deck mode', () => {
        setupStoreMocks({
            useConfigStore: { config: deckConfig, isLoading: false },
            useSessionStore: {
                currentStep: 4,
                hasConsented: true,
                isSaving: false,
                language: 'en',
                setStep: vi.fn(),
            },
            useResponseStore: {
                rough: { agree: [], disagree: [], neutral: [], history: [] },
                deck: [1, 2],
                qsort: [],
            },
            useUIStore: {
                hoveredCard: null,
                setHoveredCard: vi.fn(),
                setSelectedCard: vi.fn(),
                setActiveCard: vi.fn(),
            },
        });

        renderWithProviders(<FineSortPage />, {
            initialEntries: ['/study/demo/sort/fine'],
        });

        expect(screen.queryAllByRole('button', { name: /fine.actions.validate/i }).length).toBe(0);
    });
});
