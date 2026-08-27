import { renderWithProviders, screen, fireEvent } from '@/test-utils/test-utils';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ImportStudyDialog } from './ImportStudyDialog';

const validateStudyImport = vi.fn();
vi.mock('@/api/admin', () => ({
    AdminService: {
        validateStudyImport: (...args: unknown[]) => validateStudyImport(...args),
        importStudyConfig: vi.fn(),
    },
}));

describe('ImportStudyDialog — validation errors/warnings headings (Task 6.7b)', () => {
    it('renders the errors and warnings sections as real headings, not dangling form labels', async () => {
        validateStudyImport.mockResolvedValue({
            data: {
                valid: false,
                errors: ['Missing study title'],
                warnings: ['Grid capacity does not match statement count'],
                summary: {
                    title: '',
                    languages: [],
                    statement_count: 0,
                    grid_range: '',
                    has_presort: false,
                    has_postsort: false,
                },
            },
        });

        const user = userEvent.setup();
        renderWithProviders(
            <ImportStudyDialog open onOpenChange={vi.fn()} projectSlug="demo-project" />
        );

        await user.click(screen.getByRole('tab', { name: /paste json/i }));
        fireEvent.change(screen.getByLabelText(/paste json configuration/i), {
            target: { value: '{"version":"1.0","study":{}}' },
        });
        await user.click(screen.getByRole('button', { name: /validate & continue/i }));

        // A <Label> with no htmlFor target used to sit here, announced as a
        // dangling form label pointing at nothing. Now it is a real heading:
        // getByRole computes that structurally, not from an attribute.
        expect(
            await screen.findByRole('heading', { name: /errors:/i, level: 4 })
        ).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /warnings:/i, level: 4 })).toBeInTheDocument();
        expect(screen.getByText('Missing study title')).toBeInTheDocument();
        expect(
            screen.getByText('Grid capacity does not match statement count')
        ).toBeInTheDocument();
    });
});
