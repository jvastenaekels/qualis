import { renderWithProviders, screen } from '@/test-utils/test-utils';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { FocusModeHeader } from './FocusModeHeader';
import type { StudyRead } from '@/api/model';

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return { ...actual, useNavigate: () => navigate };
});

const studyWithEnTitle = {
    id: 1,
    slug: 'flemish-climate-attitudes-pilot-2024',
    project_id: 7,
    translations: [
        { language: 'en', title: 'Flemish Climate Attitudes (Pilot 2024)', description: '' },
    ],
    // biome-ignore lint/suspicious/noExplicitAny: minimal stub
} as any as StudyRead;

describe('FocusModeHeader', () => {
    it('renders the translated study title in the badge, not the slug', () => {
        renderWithProviders(
            <FocusModeHeader
                projectSlug="demo"
                projectTitle="Demo Project"
                study={studyWithEnTitle}
                studySlug={studyWithEnTitle.slug}
            />
        );
        expect(screen.getByText('Flemish Climate Attitudes (Pilot 2024)')).toBeInTheDocument();
        expect(screen.queryByText('flemish-climate-attitudes-pilot-2024')).not.toBeInTheDocument();
    });

    it('falls back to the slug when the study has no translations yet', () => {
        renderWithProviders(
            <FocusModeHeader
                projectSlug="demo"
                projectTitle="Demo Project"
                study={undefined}
                studySlug="my-new-study"
            />
        );
        expect(screen.getByText('my-new-study')).toBeInTheDocument();
    });

    it('back button navigates to /app/<projectSlug>/dashboard', async () => {
        navigate.mockReset();
        renderWithProviders(
            <FocusModeHeader
                projectSlug="demo"
                projectTitle="Demo Project"
                study={studyWithEnTitle}
                studySlug={studyWithEnTitle.slug}
            />
        );
        await userEvent.click(screen.getByRole('button', { name: /demo project/i }));
        expect(navigate).toHaveBeenCalledWith('/app/demo/dashboard');
    });
});
