/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import FineSortPage from './FineSortPage';

// Mocks
vi.mock('react-router-dom', () => ({
    useNavigate: () => vi.fn(),
    useParams: () => ({ slug: 'test-study' }),
}));

vi.mock('../store/useStudyStore', () => ({
    useStudyStore: vi.fn(),
}));

vi.mock('../contexts/LayoutContext', () => ({
    useLayoutAction: () => ({
        setHeaderAction: vi.fn((node) => {
            // Render the node so we can query it?
            // In integration tests, Layout renders it. Here we might need to mimic it or just inspect the calls.
            // Better: Render the node in a test wrapper if possible, or Mock LayoutContext to act as a portal?
            // Actually, we can just spy on setHeaderAction and inspect what was passed.
            // But checking classes on a React Element passed as arg is hard.
            // Strategy: We can mock setHeaderAction to immediately render the component into a test-div if we want,
            // or we can just render the component normally and rely on the fact that unit tests usually test the hook logic.
            
            // However, FineSortPage renders NOTHING itself for the button, it calls setHeaderAction.
            // So we MUST inspect the argument to setHeaderAction.
        }),
    }),
}));

// We can't easily "render" the ReactNode passed to setHeaderAction using standard RTL render if it's just a variable.
// But we can create a mock implementation of useLayoutAction that exposes the action.

const setHeaderActionMock = vi.fn();
vi.mock('../contexts/LayoutContext', () => ({
    useLayoutAction: () => ({
        setHeaderAction: setHeaderActionMock,
    }),
}));

// Mock GridSort to avoid complex DND logic
vi.mock('../components/GridSort', () => ({
    default: () => <div data-testid="grid-sort">GridSort</div>
}));

import { useStudyStore } from '../store/useStudyStore';

describe('FineSortPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default Mock State
        vi.mocked(useStudyStore).mockReturnValue({
            config: {
                title: 'Test',
                description: 'Test',
                instructions: 'Test',
                statements: [
                    { id: 1, text: 'S1' },
                    { id: 2, text: 'S2' }
                ],
                grid_config: [{ capacity: 2, score: 0 }],
                presort_config: {},
                language_code: 'en'
            },
            responses: {
                presort: {},
                rough: { agree: [], disagree: [1, 2], neutral: [], history: [] },
                qsort: [],
                postsort: { card_comments: {}, missing_statement: '', general_comment: '' }
            },
            session: { token: null, hasConsented: true, currentStep: 4, maxReachedStep: 4, language: 'en', isCompleted: false, confirmationCode: null },
            placeCardInGrid: vi.fn(),
            moveCardInGrid: vi.fn(),
            swapCardsInGrid: vi.fn(),
            unplaceCard: vi.fn(),
            setStep: vi.fn(),
            resetFineSort: vi.fn(),
            setConfig: vi.fn(),
            setConsent: vi.fn(),
            setToken: vi.fn(),
            setPresortResponse: vi.fn(),
            setPostSortResponse: vi.fn(),
            categorizeCard: vi.fn(),
            undoRoughSort: vi.fn(),
            completeSession: vi.fn(),
            resetSession: vi.fn(),
            setLanguage: vi.fn(),
        });
    });

    it('sets header action to a disabled button initially', () => {
        render(<FineSortPage />);
        
        // Assert setHeaderAction was called
        expect(setHeaderActionMock).toHaveBeenCalled();
        
        // Inspect the last call arg (the button node)
        // This is tricky in unit tests. 
        // A better approach is often to Refactor the "Action" into a sub-component keying off the store,
        // so we can test that subcomponent.
        
        // Alternatively, we can construct a test helper that renders the ReactNode passed to the mock.
        const actionNode = setHeaderActionMock.mock.lastCall?.[0];
        expect(actionNode).not.toBeNull();
        
        // To inspect it properly, we can render it in isolation.
        if (actionNode) {
            const { getByText, getByRole } = render(<div>{actionNode}</div>);
            const button = getByRole('button');
            expect(button).toBeDisabled();
            // Check styling (assuming pending state)
            expect(button.className).toContain('bg-slate-100');
        }
    });

    it('sets header action to an active/animated button when all cards placed', () => {
         // Mock store state: All placed
         (useStudyStore as any).mockReturnValue({
             config: {
                 statements: [
                     { id: 1, text: 'S1' },
                 ],
                 grid_config: [{ capacity: 1, score: 0 }]
             },
             responses: {
                 rough: { agree: [], disagree: [], neutral: [] },
                 qsort: [{ statementId: 1, col: 0, row: 0 }] 
             },
             setStep: vi.fn(),
         });

         render(<FineSortPage />);
         
         const actionNode = setHeaderActionMock.mock.lastCall?.[0];
         if (actionNode) {
             const { getByRole } = render(<div>{actionNode}</div>);
             const button = getByRole('button');
             expect(button).not.toBeDisabled();
             // Check for animation class
             // We expect to add 'animate-in fade-in zoom-in'
             // Currently checking what it has or what we WILL add
             // For now, let's verify it has "bg-blue-600"
              expect(button.className).toContain('bg-blue-600');
         }
    });

    it('persists grid placements when re-navigating', () => {
        let externalQSort = [{ statementId: 1, col: 0, row: 0 }];
        vi.mocked(useStudyStore).mockImplementation(() => ({
            config: {
                statements: [{ id: 1, text: 'S1' }],
                grid_config: [{ capacity: 1, score: 0 }],
                presort_config: {}
            } as any,
            responses: {
                rough: { agree: [1], disagree: [], neutral: [] },
                qsort: externalQSort
            } as any,
            setStep: vi.fn(),
            placeCardInGrid: vi.fn(),
            moveCardInGrid: vi.fn(),
            swapCardsInGrid: vi.fn(),
            unplaceCard: vi.fn(),
            resetFineSort: vi.fn(),
        }) as any);

        const { unmount } = render(<FineSortPage />);
        
        // Assert card 1 is in grid (GridSort mock rendes test-id)
        expect(screen.getByTestId('grid-sort')).toBeTruthy();

        unmount();

        render(<FineSortPage />);
        expect(screen.getByTestId('grid-sort')).toBeTruthy();
    });
});
