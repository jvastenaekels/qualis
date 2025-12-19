import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import RoughSortPage from './RoughSortPage';
import { useStudyStore } from '../store/useStudyStore';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// Mocks
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

// Mock ResizeObserver for Framer Motion
global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
};

describe('RoughSortPage', () => {
    beforeEach(() => {
        useStudyStore.getState().resetSession();
        // Setup initial store state
        useStudyStore.setState({
            config: {
                slug: 'test-study',
                title: 'Test Study',
                description: 'Test Description',
                instructions: 'Test Instructions',
                presort_config: {},
                statements: [
                    { id: 1, text: 'Card 1' },
                    { id: 2, text: 'Card 2' },
                    { id: 3, text: 'Card 3' }
                ]
            }
        });
    });

    it('sets the current step to 3 on mount', () => {
        render(
            <MemoryRouter initialEntries={['/study/test-study/sort/rough']}>
                <Routes>
                    <Route path="/study/:slug/sort/rough" element={<RoughSortPage />} />
                </Routes>
            </MemoryRouter>
        );
        expect(useStudyStore.getState().session.currentStep).toBe(3);
    });

    it('renders the pedagogical hint', () => {
        render(
            <MemoryRouter initialEntries={['/study/test-study/sort/rough']}>
                 <Routes>
                    <Route path="/study/:slug/sort/rough" element={<RoughSortPage />} />
                </Routes>
            </MemoryRouter>
        );
        
        // Check for Hint (now at bottom)
        expect(screen.getByText('rough.header.hint')).toBeTruthy();
        // Check for Title
        expect(screen.getByText('rough.header.title')).toBeTruthy();
    });

    it('renders the Control Cluster buttons', () => {
        render(
            <MemoryRouter initialEntries={['/study/test-study/sort/rough']}>
                 <Routes>
                    <Route path="/study/:slug/sort/rough" element={<RoughSortPage />} />
                </Routes>
            </MemoryRouter>
        );

        expect(screen.getByLabelText('common.disagree')).toBeTruthy();
        expect(screen.getByLabelText('common.agree')).toBeTruthy();
        expect(screen.getByLabelText('common.neutral')).toBeTruthy();
    });

    it('completes the sort when all cards are categorized', () => {
        // Mock empty unsorted cards by simulating full history
         useStudyStore.setState({
             responses: {
                 rough: {
                     agree: [1, 2, 3],
                     disagree: [],
                     neutral: [],
                     history: [1, 2, 3]
                 },
                 presort: {},
                 qsort: [],
                 postsort: {
                     card_comments: {},
                     missing_statement: '',
                     general_comment: ''
                 }
             }
         });

         render(
            <MemoryRouter initialEntries={['/study/test-study/sort/rough']}>
                 <Routes>
                    <Route path="/study/:slug/sort/rough" element={<RoughSortPage />} />
                </Routes>
            </MemoryRouter>
        );

        expect(screen.getByText('rough.complete.title')).toBeTruthy();
        expect(screen.getByText('common.next')).toBeTruthy();
    });

    it('persists progress when re-navigating', () => {
        // Categorize one card
        useStudyStore.getState().categorizeCard(1, 'agree');

        const { unmount } = render(
            <MemoryRouter initialEntries={['/study/test-study/sort/rough']}>
                <Routes>
                    <Route path="/study/:slug/sort/rough" element={<RoughSortPage />} />
                </Routes>
            </MemoryRouter>
        );

        // Card 1 is gone, Card 2 is current
        expect(screen.getByText('Card 2')).toBeTruthy();

        unmount();

        render(
            <MemoryRouter initialEntries={['/study/test-study/sort/rough']}>
                <Routes>
                    <Route path="/study/:slug/sort/rough" element={<RoughSortPage />} />
                </Routes>
            </MemoryRouter>
        );

        expect(screen.getByText('Card 2')).toBeTruthy();
    });
});
