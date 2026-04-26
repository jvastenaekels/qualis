import { renderWithProviders, screen, fireEvent, waitFor } from '@/test-utils/test-utils';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { FactorNoteEditor } from './FactorNoteEditor';

const { mockMutate, mockUpdateHook } = vi.hoisted(() => ({
    mockMutate: vi.fn(),
    mockUpdateHook: vi.fn(),
}));

vi.mock('@/api/generated', () => ({
    useUpdateAnalysisRunApiAdminStudiesSlugAnalysisRunsRunIdPatch: mockUpdateHook,
    getListAnalysisRunsApiAdminStudiesSlugAnalysisRunsGetQueryKey: vi.fn(() => [
        '/api/admin/studies/demo/analysis/runs',
    ]),
}));

describe('FactorNoteEditor', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUpdateHook.mockReturnValue({
            mutate: mockMutate,
            isPending: false,
        });
    });

    it('shows the empty hint when no narrative exists', () => {
        renderWithProviders(
            <FactorNoteEditor slug="demo" runId={1} factorIndex={0} currentNote="" />
        );
        expect(
            screen.getByText(/Add an interpretive narrative for this factor/i)
        ).toBeInTheDocument();
    });

    it('renders the existing narrative as a clickable preview', () => {
        renderWithProviders(
            <FactorNoteEditor
                slug="demo"
                runId={42}
                factorIndex={1}
                currentNote="Technocratic-ecological discourse"
            />
        );
        expect(screen.getByText(/Technocratic-ecological discourse/i)).toBeInTheDocument();
    });

    it('switches to edit mode when the preview is clicked, and PATCHes on save with the right key', async () => {
        renderWithProviders(
            <FactorNoteEditor slug="demo" runId={42} factorIndex={2} currentNote="initial" />
        );

        const preview = screen.getByLabelText(/Edit factor 3 narrative/i);
        fireEvent.click(preview);

        const textarea = screen.getByRole('textbox');
        fireEvent.change(textarea, { target: { value: 'updated narrative' } });

        const save = screen.getByLabelText(/Save factor narrative/i);
        fireEvent.click(save);

        await waitFor(() => {
            expect(mockMutate).toHaveBeenCalledTimes(1);
        });
        const [args] = mockMutate.mock.calls[0];
        expect(args).toEqual({
            slug: 'demo',
            runId: 42,
            data: { factor_notes: { '3': 'updated narrative' } },
        });
    });

    it('disables save when the draft exceeds 4000 characters', () => {
        renderWithProviders(
            <FactorNoteEditor slug="demo" runId={1} factorIndex={0} currentNote="x" />
        );

        fireEvent.click(screen.getByLabelText(/Edit factor 1 narrative/i));

        const textarea = screen.getByRole('textbox');
        fireEvent.change(textarea, { target: { value: 'x'.repeat(4001) } });

        const save = screen.getByLabelText(/Save factor narrative/i);
        expect(save).toBeDisabled();
    });

    it('cancels editing without firing the mutation', () => {
        renderWithProviders(
            <FactorNoteEditor slug="demo" runId={1} factorIndex={0} currentNote="initial" />
        );

        fireEvent.click(screen.getByLabelText(/Edit factor 1 narrative/i));
        const textarea = screen.getByRole('textbox');
        fireEvent.change(textarea, { target: { value: 'changed' } });

        fireEvent.click(screen.getByLabelText(/Cancel editing/i));
        expect(mockMutate).not.toHaveBeenCalled();
    });

    it('resets the draft when currentNote changes (e.g. after switching runs)', () => {
        const { rerender } = renderWithProviders(
            <FactorNoteEditor slug="demo" runId={1} factorIndex={0} currentNote="A" />
        );
        expect(screen.getByText('A')).toBeInTheDocument();

        rerender(<FactorNoteEditor slug="demo" runId={2} factorIndex={0} currentNote="B" />);
        expect(screen.getByText('B')).toBeInTheDocument();
        expect(screen.queryByText('A')).not.toBeInTheDocument();
    });
});
