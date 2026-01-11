import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StudyLayout from '../layouts/StudyLayout';
import { useConfigStore } from '../store/useConfigStore';
import { useResponseStore } from '../store/useResponseStore';
import { useSessionStore } from '../store/useSessionStore';
import { renderWithProviders } from '../test-utils/test-utils';
import PostSortPage from './PostSortPage';

// Mock GridSort
vi.mock('../components/GridSort', () => ({
    // biome-ignore lint/suspicious/noExplicitAny: mock props
    default: ({ isAllPlaced, onValidate, showCodes }: any) => (
        <div data-testid="grid-sort">
            {/* biome-ignore lint/a11y/useButtonType: mock component */}
            <button onClick={() => onValidate(isAllPlaced)}>Validate</button>
            {showCodes && <span>Show Codes</span>}
        </div>
    ),
}));

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
    useStudyConfig: vi.fn(() => ({ isLoading: false, error: null, retry: vi.fn() })),
}));

describe('PostSortPage', () => {
    beforeEach(() => {
        useConfigStore.getState().resetConfig();
        useResponseStore.getState().resetResponses();
        useSessionStore.getState().resetSession();

        // Setup basic config
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
                // biome-ignore lint/suspicious/noExplicitAny: mock config
            } as any,
        });

        useSessionStore.setState({
            hasConsented: true,
            currentStep: 5,
        });
    });

    it('Redirects to /fine-sort if qsort is incomplete', async () => {
        // Setup incomplete qsort (0 cards placed)
        useResponseStore.setState({
            qsort: [],
        });

        renderWithProviders(
            <Routes>
                <Route path="/study/:slug" element={<StudyLayout />}>
                    <Route path="post-sort" element={<PostSortPage />} />
                    <Route path="fine-sort" element={<div>Fine Sort Page</div>} />
                </Route>
            </Routes>,
            { initialEntries: ['/study/demo/post-sort'] }
        );

        // Should redirect to Fine Sort (which renders "Fine Sort Page")
        expect(await screen.findByText('Fine Sort Page')).toBeInTheDocument();
    });

    it('Renders Post Sort page if qsort is complete', async () => {
        // Setup complete qsort (all 2 cards placed)
        useResponseStore.setState({
            qsort: [
                { statementId: 1, col: 0, row: 0 },
                { statementId: 2, col: 1, row: 0 },
            ],
        });

        renderWithProviders(
            <Routes>
                <Route path="/study/:slug" element={<StudyLayout />}>
                    <Route path="post-sort" element={<PostSortPage />} />
                </Route>
            </Routes>,
            { initialEntries: ['/study/demo/post-sort'] }
        );

        // Should render Post Sort specific content (e.g. Title)
        // Note: Title key is 'post.title', real i18n returns "To conclude"
        expect(await screen.findByText('To conclude')).toBeInTheDocument();
    });

    it('Renders specific prompts for positive and negative extremes', async () => {
        useConfigStore.setState({
            config: {
                statements: [
                    { id: 1, text: 'Card Negative' },
                    { id: 2, text: 'Card Positive' },
                ],
                slug: 'demo',
                grid_config: [
                    { score: -1, capacity: 1 },
                    { score: 1, capacity: 1 },
                ],
                postsort_config: {
                    extreme_columns: [-1, 1],
                    prompts: {
                        extreme_negative: 'Why so negative?',
                        extreme_positive: 'Why so positive?',
                    },
                },
                state: 'active',
                // biome-ignore lint/suspicious/noExplicitAny: mock config
            } as any,
        });

        useResponseStore.setState({
            qsort: [
                { statementId: 1, col: 0, row: 0 }, // Score -1
                { statementId: 2, col: 1, row: 0 }, // Score 1
            ],
        });

        renderWithProviders(
            <Routes>
                <Route path="/study/:slug" element={<StudyLayout />}>
                    <Route path="post-sort" element={<PostSortPage />} />
                </Route>
            </Routes>,
            { initialEntries: ['/study/demo/post-sort'] }
        );

        expect(await screen.findByText('Why so negative?')).toBeInTheDocument();
        expect(await screen.findByText('Why so positive?')).toBeInTheDocument();
    });
});
