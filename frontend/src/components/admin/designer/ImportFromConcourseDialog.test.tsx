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

describe('ImportFromConcourseDialog — item row is a native label, not an ARIA-only div (Task 6.7d)', () => {
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

    it('names the checkbox from the row text and toggles it on click, exactly once', async () => {
        const user = userEvent.setup();
        renderDialog();

        // The checkbox now carries a real accessible name (the row's own
        // text) instead of the div's former unlabeled role="button".
        const checkbox = screen.getByRole('checkbox', { name: /a statement/i });
        expect(checkbox).not.toBeChecked();

        // Click on the row text (not the checkbox itself) — native <label>
        // click-forwarding, not a hand-rolled onClick.
        await user.click(screen.getByText('A statement'));
        expect(checkbox).toBeChecked();

        // Click again to flip back — proves it toggles by exactly one step
        // per click, i.e. no double-firing from a leftover row handler.
        await user.click(screen.getByText('A statement'));
        expect(checkbox).not.toBeChecked();
    });

    it('toggles exactly once when the checkbox itself is clicked directly', async () => {
        const user = userEvent.setup();
        renderDialog();

        const checkbox = screen.getByRole('checkbox', { name: /a statement/i });
        await user.click(checkbox);
        expect(checkbox).toBeChecked();
        await user.click(checkbox);
        expect(checkbox).not.toBeChecked();
    });

    it('stays keyboard-operable: Tab to the checkbox, Space toggles it', async () => {
        const user = userEvent.setup();
        renderDialog();

        const checkbox = screen.getByRole('checkbox', { name: /a statement/i });
        checkbox.focus();
        expect(checkbox).toHaveFocus();

        await user.keyboard(' ');
        expect(checkbox).toBeChecked();
    });

    it('renders the row as a <label>, with no leftover role="button"/tabIndex', () => {
        renderDialog();

        const row = screen.getByText('A statement').closest('label');
        expect(row).not.toBeNull();
        expect(row).not.toHaveAttribute('role');
        expect(row).not.toHaveAttribute('tabindex');
    });
});
