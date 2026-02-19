import { screen, fireEvent } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConfigStore } from '../store/useConfigStore';
import { useResponseStore } from '../store/useResponseStore';
import { useSessionStore } from '../store/useSessionStore';
import { renderWithProviders } from '../test-utils/test-utils';
import PostSortPage from './PostSortPage';
import userEvent from '@testing-library/user-event';

// Mock dependencies
vi.mock('../hooks/useSubmitStudy', () => ({
    useSubmitStudy: vi.fn(() => ({
        submit: vi.fn(),
        isLoading: false,
        isSuccess: false,
        error: null,
        confirmationCode: null,
    })),
}));

// Mock useStudyConfig since it's used in StudyLayout
vi.mock('../hooks/useStudyConfig', () => ({
    useStudyConfig: vi.fn(() => ({
        isLoading: false,
        error: null,
        retry: vi.fn(),
    })),
}));

describe('PostSortPage', () => {
    beforeEach(() => {
        useConfigStore.getState().resetConfig();
        useResponseStore.getState().resetResponses();
        useSessionStore.getState().resetSession();

        // Setup base config
        useConfigStore.setState({
            config: {
                statements: [
                    { id: 1, text: 'S1' },
                    { id: 2, text: 'S2' },
                ],
                title: 'Test Study',
                slug: 'demo',
                grid_config: [
                    { score: -1, capacity: 1 },
                    { score: 1, capacity: 1 },
                ],
                state: 'active',
                postsort_config: {
                    extreme_columns: [-1, 1],
                    missing_statements_enabled: true,
                },
                // biome-ignore lint/suspicious/noExplicitAny: mock
            } as any,
        });

        useResponseStore.setState({
            qsort: [
                { statementId: 1, col: 0, row: 0 },
                { statementId: 2, col: 1, row: 0 },
            ],
            postsort: {
                card_comments: {},
                missing_statement: '',
                general_comment: '',
                questions_answers: {},
                audio_recordings: {},
            },
        });

        useSessionStore.setState({
            hasConsented: true,
            currentStep: 5,
        });
    });

    it('Redirects to /fine-sort if qsort is incomplete', async () => {
        useResponseStore.setState({ qsort: [] });

        renderWithProviders(
            <Routes>
                <Route path="/study/:slug/post-sort" element={<PostSortPage />} />
                <Route path="/study/:slug/fine-sort" element={<div>Fine Sort Page</div>} />
            </Routes>,
            { initialEntries: ['/study/demo/post-sort'] }
        );

        expect(await screen.findByText('Fine Sort Page')).toBeInTheDocument();
    });

    it('Renders Step 1 (Feedback) initially', async () => {
        renderWithProviders(
            <Routes>
                <Route path="/study/:slug/post-sort" element={<PostSortPage />} />
            </Routes>,
            { initialEntries: ['/study/demo/post-sort'] }
        );

        // Step 1 content
        expect(await screen.findByText(/Key Choices/i)).toBeInTheDocument();
        // Check for Additional Comments section
        expect(await screen.findByText(/surprising, unclear, or confusing/i)).toBeInTheDocument();
    });

    it('Validates Step 1 before proceeding to Step 2 (Updated)', async () => {
        const user = userEvent.setup();

        renderWithProviders(
            <Routes>
                <Route path="/study/:slug/post-sort" element={<PostSortPage />} />
            </Routes>,
            { initialEntries: ['/study/demo/post-sort'] }
        );

        // Try to click Next without filling extreme comments
        const nextBtn = await screen.findByRole('button', { name: /Next Step/i });
        await user.click(nextBtn);

        // Should see validation error
        expect(await screen.findByText('Please fill in all required fields.')).toBeInTheDocument();

        // Fill comments
        const inputs = screen.getAllByTestId('extreme-comment-input');
        for (const input of inputs) {
            fireEvent.change(input, { target: { value: 'Because it is true and long enough' } });
        }

        // Click Next again
        await user.click(nextBtn);

        // Should be on Step 2 now
        expect(await screen.findByTestId('postsort-submit-btn')).toBeInTheDocument();
    });

    it('Handles Missing Statements input', async () => {
        const user = userEvent.setup();

        renderWithProviders(
            <Routes>
                <Route path="/study/:slug/post-sort" element={<PostSortPage />} />
            </Routes>,
            { initialEntries: ['/study/demo/post-sort'] }
        );

        const missingInput = document.getElementById('missing-statements') as HTMLTextAreaElement;
        await user.type(missingInput, 'I missed the topic of AI safety.');

        expect(useResponseStore.getState().postsort.missing_statement).toBe(
            'I missed the topic of AI safety.'
        );
    });

    it('Allows navigating back from Step 2 to Step 1', async () => {
        const user = userEvent.setup();

        renderWithProviders(
            <Routes>
                <Route path="/study/:slug/post-sort" element={<PostSortPage />} />
            </Routes>,
            { initialEntries: ['/study/demo/post-sort'] }
        );

        // Fill Step 1 to proceed
        const inputs = screen.getAllByTestId('extreme-comment-input');
        for (const input of inputs) {
            fireEvent.change(input, { target: { value: 'Reason is long enough' } });
        }
        await user.click(screen.getByRole('button', { name: /Next Step/i }));

        // Expect Step 2
        expect(await screen.findByTestId('postsort-submit-btn')).toBeInTheDocument();

        // Click Back
        await user.click(screen.getByRole('button', { name: /Back/i }));

        // Expect Step 1 again
        expect(await screen.findByText(/Your Perspective/i)).toBeInTheDocument();
    });

    it('Allows selecting a statement from the optional comments dropdown', async () => {
        const user = userEvent.setup();

        // Set state BEFORE rendering
        useConfigStore.setState({
            config: {
                statements: [
                    { id: 1, text: 'S1' },
                    { id: 2, text: 'S2' },
                    { id: 3, text: 'S3 text content' },
                ],
                title: 'Test Study',
                slug: 'demo',
                grid_config: [
                    { score: -1, capacity: 1 },
                    { score: 0, capacity: 1 },
                    { score: 1, capacity: 1 },
                ],
                state: 'active',
                postsort_config: {
                    extreme_columns: [-1, 1],
                    allow_random_comments: true,
                },
                // biome-ignore lint/suspicious/noExplicitAny: mock
            } as any,
        });

        useResponseStore.setState({
            qsort: [
                { statementId: 1, col: 0, row: 0 },
                { statementId: 2, col: 2, row: 0 },
                { statementId: 3, col: 1, row: 0 },
            ],
            // biome-ignore lint/suspicious/noExplicitAny: mock
            postsort: { card_comments: {} } as any,
        });

        renderWithProviders(
            <Routes>
                <Route path="/study/:slug/post-sort" element={<PostSortPage />} />
            </Routes>,
            { initialEntries: ['/study/demo/post-sort'] }
        );

        // Find the dropdown
        const select = screen.getByDisplayValue(/Select a statement/i);

        // Selection by label (show_statement_codes defaults to false, so no "S3:" prefix)
        const option = screen.getByText(/S3 text content/i) as HTMLOptionElement;
        await user.selectOptions(select, option);

        // Verify it's in the store
        expect(useResponseStore.getState().postsort.card_comments?.[3]).toBe('');

        // Now check the document
        // Verify the card block appeared (check for Remove button first)
        expect(await screen.findByTitle(/Remove/i)).toBeInTheDocument();

        // Then check content
        expect(await screen.findByText(/S3 text content/i)).toBeInTheDocument();
    });

    it('Shows share links on success screen', async () => {
        const { useSubmitStudy } = await import('../hooks/useSubmitStudy');
        vi.mocked(useSubmitStudy).mockReturnValue({
            submit: vi.fn(),
            isLoading: false,
            isSuccess: true,
            error: null,
            confirmationCode: 'ABC12345',
        });

        renderWithProviders(
            <Routes>
                <Route path="/study/:slug/post-sort" element={<PostSortPage />} />
            </Routes>,
            { initialEntries: ['/study/demo/post-sort'] }
        );

        expect(await screen.findByTestId('thank-you-message')).toBeInTheDocument();
        expect(screen.getByText('Spread the word')).toBeInTheDocument();
        expect(screen.getByText('Copy link')).toBeInTheDocument();
    });
});
