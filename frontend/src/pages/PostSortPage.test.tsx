import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PostSortPage from './PostSortPage';
import { MemoryRouter } from 'react-router-dom';
import { useStudyStore } from '../store/useStudyStore';
import { LayoutProvider } from '../contexts/LayoutContext';

// Mock Store
vi.mock('../store/useStudyStore');
const mockUseStudyStore = useStudyStore as unknown as ReturnType<typeof vi.fn>;

// Mock translation
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key })
}));

describe('PostSortPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const mockConfig = {
        statements: [
            { id: 1, text: 'Card 1 (Extreme -4)' },
            { id: 2, text: 'Card 2 (Extreme +4)' },
            { id: 3, text: 'Card 3 (Neutral 0)' }
        ],
        postsort_config: { extreme_columns: [-4, 4] }
    };

    const mockResponses = {
        qsort: [
            { statementId: 1, col: 0, row: 0 }, // Index 0 -> Score -4
            { statementId: 2, col: 8, row: 0 }, // Index 8 -> Score +4
            { statementId: 3, col: 4, row: 0 }, // Index 4 -> Score 0
        ],
        postsort: {
             card_comments: {},
             missing_statement: '',
             general_comment: ''
        }
    };

    const setup = () => {
        const setPostSortResponseSpy = vi.fn();
        const setStepSpy = vi.fn();

        mockUseStudyStore.mockReturnValue({
            config: mockConfig,
            responses: mockResponses,
            setPostSortResponse: setPostSortResponseSpy,
            setStep: setStepSpy,
            session: { hasConsented: true }
        });

        return { setPostSortResponseSpy, setStepSpy };
    };

    it('renders loading state if config is missing', () => {
        mockUseStudyStore.mockReturnValue({ config: null, setStep: vi.fn() });
        render(
             <MemoryRouter>
                <LayoutProvider>
                    <PostSortPage />
                </LayoutProvider>
            </MemoryRouter>
        );
        expect(screen.getByText('common.loading')).toBeTruthy();
    });

    it('identifies and displays extreme cards only', () => {
        setup();
        render(
            <MemoryRouter>
                <LayoutProvider>
                    <PostSortPage />
                </LayoutProvider>
            </MemoryRouter>
        );

        // Should receive Step 5 update
        // expect(setStepSpy).toHaveBeenCalledWith(5);

        // Extreme Cards
        expect(screen.getByText(/Card 1 \(Extreme -4\)/)).toBeTruthy();
        expect(screen.getByText(/Card 2 \(Extreme \+4\)/)).toBeTruthy();
        
        // Neutral Card logic (should NOT be visible in the prompt list)
        // We look for the text in blockquotes. 
        // Note: 'Card 3 (Neutral 0)' is in the document? No, getCardText uses statements array.
        // But the "Card 3" shouldn't be rendered as a prompt.
        const card3 = screen.queryByText('Card 3 (Neutral 0)');
        expect(card3).toBeNull();
    });

    it('shows validation error for short comments on submit', async () => {
         setup();
         render(
             <MemoryRouter>
                 <LayoutProvider>
                     <PostSortPage />
                 </LayoutProvider>
             </MemoryRouter>
         );

         const submitBtn = screen.getByText('post.submit');
         fireEvent.click(submitBtn);

         // Validation message should appear for both cards
         // "post.extreme.min_chars"
         const warnings = await screen.findAllByText('post.extreme.min_chars');
         expect(warnings.length).toBe(2); // One for each extreme card
    });

    it('updates store when typing comments', () => {
        const { setPostSortResponseSpy } = setup();
        render(
            <MemoryRouter>
                <LayoutProvider>
                    <PostSortPage />
                </LayoutProvider>
            </MemoryRouter>
        );

        const textAreas = screen.getAllByPlaceholderText('post.extreme.placeholder');
        // First one is Card 1 (-4)
        fireEvent.change(textAreas[0], { target: { value: 'This is a valid comment because it is long enough.' } });

        expect(setPostSortResponseSpy).toHaveBeenCalledWith('card_comments', expect.objectContaining({
            1: 'This is a valid comment because it is long enough.'
        }));
    });

    it('tracks missing statement and general comments', () => {
         const { setPostSortResponseSpy } = setup();
         render(
             <MemoryRouter>
                 <LayoutProvider>
                     <PostSortPage />
                 </LayoutProvider>
             </MemoryRouter>
         );
         
         // Missing statement
         const missingInput = screen.getByLabelText('post.missing.label');
         fireEvent.change(missingInput, { target: { value: 'I feel like X is missing' } });
         expect(setPostSortResponseSpy).toHaveBeenCalledWith('missing_statement', 'I feel like X is missing');

         // General
         const generalInput = screen.getByLabelText('post.general.label');
         fireEvent.change(generalInput, { target: { value: 'Great study!' } });
         expect(setPostSortResponseSpy).toHaveBeenCalledWith('general_comment', 'Great study!');
    });
});
