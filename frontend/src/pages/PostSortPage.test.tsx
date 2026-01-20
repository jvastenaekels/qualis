import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StudyLayout from '../layouts/StudyLayout';
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
                <Route path="/study/:slug" element={<StudyLayout />}>
                    <Route path="post-sort" element={<PostSortPage />} />
                    <Route path="fine-sort" element={<div>Fine Sort Page</div>} />
                </Route>
            </Routes>,
            { initialEntries: ['/study/demo/post-sort'] }
        );

        expect(await screen.findByText('Fine Sort Page')).toBeInTheDocument();
    });

    it('Renders Step 1 (Feedback) initially', async () => {
        renderWithProviders(
            <Routes>
                <Route path="/study/:slug" element={<StudyLayout />}>
                    <Route path="post-sort" element={<PostSortPage />} />
                </Route>
            </Routes>,
            { initialEntries: ['/study/demo/post-sort'] }
        );

        // Step 1 title (Post Sort)
        expect(await screen.findByText('To conclude')).toBeInTheDocument();
        // Check for Missing Statements section
        expect(await screen.findByText('Missing Statements')).toBeInTheDocument();
    });

    it('Validates Step 1 before proceeding to Step 2 (Updated)', async () => {
        const user = userEvent.setup();

        renderWithProviders(
            <Routes>
                <Route path="/study/:slug" element={<StudyLayout />}>
                    <Route path="post-sort" element={<PostSortPage />} />
                </Route>
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
            await user.type(input, 'Because it is true');
        }

        // Click Next again
        await user.click(nextBtn);

        // Should be on Step 2 now (Final Questions)
        expect(await screen.findByText('Step 2: Questions')).toBeInTheDocument();
    });

    it('Handles Missing Statements input', async () => {
        const user = userEvent.setup();

        renderWithProviders(
            <Routes>
                <Route path="/study/:slug" element={<StudyLayout />}>
                    <Route path="post-sort" element={<PostSortPage />} />
                </Route>
            </Routes>,
            { initialEntries: ['/study/demo/post-sort'] }
        );

        const missingInput = screen.getByLabelText('Missing Statements Input');
        await user.type(missingInput, 'I missed the topic of AI safety.');

        expect(useResponseStore.getState().postsort.missing_statement).toBe(
            'I missed the topic of AI safety.'
        );
    });

    it('Allows navigating back from Step 2 to Step 1', async () => {
        const user = userEvent.setup();

        renderWithProviders(
            <Routes>
                <Route path="/study/:slug" element={<StudyLayout />}>
                    <Route path="post-sort" element={<PostSortPage />} />
                </Route>
            </Routes>,
            { initialEntries: ['/study/demo/post-sort'] }
        );

        // Fill Step 1 to proceed
        const inputs = screen.getAllByTestId('extreme-comment-input');
        for (const input of inputs) {
            await user.type(input, 'Reason');
        }
        await user.click(screen.getByRole('button', { name: /Next Step/i }));

        // Expect Step 2
        expect(await screen.findByText('Step 2: Questions')).toBeInTheDocument();

        // Click Back
        await user.click(screen.getByRole('button', { name: /Back/i }));

        // Expect Step 1 again
        expect(await screen.findByText('To conclude')).toBeInTheDocument();
    });
});
