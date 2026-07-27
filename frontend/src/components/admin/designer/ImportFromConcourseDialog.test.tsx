import { renderWithProviders, screen } from '@/test-utils/test-utils';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ImportFromConcourseDialog } from './ImportFromConcourseDialog';

vi.mock('@/api/generated', () => ({
    useListConcoursesApiAdminConcoursesGet: () => ({
        data: { items: [{ id: 1, title: 'Demo concourse' }] },
    }),
    useGetConcourseApiAdminConcoursesConcourseIdGet: () => ({
        data: {
            id: 1,
            items: [
                {
                    id: 101,
                    status: 'accepted',
                    translations: [{ language_code: 'en', text: 'A statement' }],
                },
            ],
        },
        isLoading: false,
    }),
    useImportFromConcourseApiAdminStudiesSlugImportConcoursePost: () => ({
        mutateAsync: vi.fn(),
        isPending: false,
    }),
}));

describe('ImportFromConcourseDialog — code prefix accessible name (Task 6.7b)', () => {
    const renderDialog = () =>
        renderWithProviders(
            <ImportFromConcourseDialog
                open
                onOpenChange={vi.fn()}
                studySlug="demo-study"
                activeLocale="en"
                onImported={vi.fn()}
            />
        );

    it('names the code prefix field and lets its label focus it', async () => {
        const user = userEvent.setup();
        renderDialog();

        const field = screen.getByRole('textbox', { name: /code prefix/i });
        await user.click(screen.getByText('Code prefix'));
        expect(field).toHaveFocus();
    });
});
