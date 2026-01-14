/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StudyConfig } from '../schemas/study';
import { renderWithProviders, screen, setupStoreMocks } from '../test-utils/test-utils';
import RoughSortPage from './RoughSortPage';

const mockConfig: StudyConfig = {
    slug: 'demo',
    title: 'Test',
    description: 'Test',
    instructions: 'Test',
    statements: [{ id: 1, text: 'S1' }],
    grid_config: [],
    presort_config: {},
};

// Mock Stores (Core)
vi.mock('../store/useConfigStore', () => ({
    useConfigStore: Object.assign(vi.fn(), {
        getState: () => ({ setConfig: vi.fn(), config: mockConfig }),
    }),
}));
vi.mock('../store/useSessionStore', () => ({
    useSessionStore: Object.assign(vi.fn(), {
        getState: () => ({ resetSession: vi.fn() }),
    }),
}));
vi.mock('../store/useResponseStore', () => ({
    useResponseStore: Object.assign(vi.fn(), {
        getState: () => ({ resetResponses: vi.fn() }),
    }),
}));
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
// Mock Translation removed

describe('RoughSortPage Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows "Next" button in page body when rough sort is complete', () => {
        setupStoreMocks({
            useConfigStore: { config: mockConfig },
            useResponseStore: {
                rough: { history: [1], agree: [], disagree: [], neutral: [] },
                categorizeCard: vi.fn(),
                undoRoughSort: vi.fn(),
            },
            useSessionStore: {
                hasConsented: true,
                currentStep: 3,
                isSaving: false,
                setStep: vi.fn(),
                setLanguage: vi.fn(),
            },
            useUIStore: { hoveredCard: null, setHoveredCard: vi.fn() },
        });

        renderWithProviders(<RoughSortPage />, {
            initialEntries: ['/study/demo/sort/rough'],
        });

        const nextBtns = screen.getAllByText('Next step');
        expect(nextBtns.length).toBeGreaterThan(0);
    });

    it('does not show "Next" button when incomplete', () => {
        setupStoreMocks({
            useConfigStore: { config: mockConfig },
            useResponseStore: {
                rough: { history: [], agree: [], disagree: [], neutral: [] },
                categorizeCard: vi.fn(),
                undoRoughSort: vi.fn(),
            },
            useSessionStore: {
                hasConsented: true,
                currentStep: 3,
                isSaving: false,
                setStep: vi.fn(),
                setLanguage: vi.fn(),
            },
            useUIStore: { hoveredCard: null, setHoveredCard: vi.fn() },
        });

        renderWithProviders(<RoughSortPage />, {
            initialEntries: ['/study/demo/sort/rough'],
        });

        expect(screen.queryByText('Next step')).toBeNull();
    });
});
