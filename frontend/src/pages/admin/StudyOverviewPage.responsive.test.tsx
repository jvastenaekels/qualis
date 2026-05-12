import { renderWithProviders, screen } from '@/test-utils/test-utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useLoaderData, useRevalidator } from 'react-router-dom';
import StudyOverviewPage from './StudyOverviewPage';

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useLoaderData: vi.fn(),
        useRevalidator: vi.fn(),
    };
});

vi.mock('@/hooks/useAdminContext', () => ({
    useAdminContext: () => ({
        project: { slug: 'test-project' },
    }),
}));

vi.mock('@/components/admin/dashboard/StudyStatusControl', () => ({
    default: () => <div data-testid="study-status-control" />,
}));

vi.mock('@/components/admin/dashboard/RecruitmentModule', () => ({
    default: () => <div data-testid="recruitment-module" />,
}));

describe('StudyOverviewPage responsive layout', () => {
    beforeEach(() => {
        vi.mocked(useLoaderData).mockReturnValue({
            slug: 'responsive-study',
            stats: {
                completed_count: 8,
                started_count: 10,
                median_duration_seconds: 240,
            },
            participants: [],
            study: {
                state: 'active',
                rough_sort_enabled: true,
                translations: [{ language_code: 'en', title: 'Responsive Study' }],
            },
        });
        vi.mocked(useRevalidator).mockReturnValue({
            revalidate: vi.fn(),
            state: 'idle',
        } as ReturnType<typeof useRevalidator>);
    });

    it('uses large-screen breakpoints for overview grids and recruitment column', () => {
        renderWithProviders(<StudyOverviewPage />);

        const metricsGrid = screen.getByTestId('overview-metrics-grid');
        expect(metricsGrid.className).toContain('lg:grid-cols-3');
        expect(metricsGrid.className).not.toContain('md:grid-cols-3');

        const contentGrid = screen.getByTestId('overview-content-grid');
        expect(contentGrid.className).toContain('lg:grid-cols-12');
        expect(contentGrid.className).not.toContain('md:grid-cols-12');

        const recentActivityCard = screen.getByTestId('recent-activity-card');
        expect(recentActivityCard.className).toContain('lg:col-span-8');
        expect(recentActivityCard.className).not.toContain('md:col-span-8');

        const recruitmentColumn = screen.getByTestId('overview-recruitment-column');
        expect(recruitmentColumn.className).toContain('lg:col-span-4');
        expect(recruitmentColumn.className).not.toContain('md:col-span-4');
    });

    it('allows metric labels to shrink and wrap', () => {
        renderWithProviders(<StudyOverviewPage />);

        for (const label of [
            /sample size|number of participants/i,
            /completion rate/i,
            /median duration/i,
        ]) {
            const labelSpan = screen.getByText(label);

            expect(labelSpan.className).toContain('min-w-0');
            expect(labelSpan.className).toContain('break-words');
        }
    });
});
