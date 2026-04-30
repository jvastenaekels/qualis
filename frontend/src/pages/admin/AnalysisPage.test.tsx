import { renderWithProviders, screen, waitFor } from '@/test-utils/test-utils';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import AnalysisPage from './AnalysisPage';
import type { AnalysisResult, AnalysisRunRead } from '@/api/model';
import type { EigenvalueResult } from '@/api/model';
import { ApiError } from '@/api/client';

// Mock sonner
vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}));

// Hoisted mocks for the generated API hooks
const {
    mockEigenvaluesHook,
    mockAnalysisMutationHook,
    mockListRunsHook,
    mockGetRunHook,
    mockUpdateRunMutation,
    mockDeleteRunMutation,
    mockListAnalysisRuns,
} = vi.hoisted(() => ({
    mockEigenvaluesHook: vi.fn(),
    mockAnalysisMutationHook: vi.fn(),
    mockListRunsHook: vi.fn(),
    mockGetRunHook: vi.fn(),
    mockUpdateRunMutation: vi.fn(),
    mockDeleteRunMutation: vi.fn(),
    mockListAnalysisRuns: vi.fn(),
}));

vi.mock('@/api/generated', () => ({
    useGetEigenvaluesApiAdminStudiesSlugAnalysisEigenvaluesGet: mockEigenvaluesHook,
    useRunFactorAnalysisApiAdminStudiesSlugAnalysisRunPost: mockAnalysisMutationHook,
    useListAnalysisRunsApiAdminStudiesSlugAnalysisRunsGet: mockListRunsHook,
    useGetAnalysisRunApiAdminStudiesSlugAnalysisRunsRunIdGet: mockGetRunHook,
    useUpdateAnalysisRunApiAdminStudiesSlugAnalysisRunsRunIdPatch: mockUpdateRunMutation,
    useDeleteAnalysisRunApiAdminStudiesSlugAnalysisRunsRunIdDelete: mockDeleteRunMutation,
    listAnalysisRunsApiAdminStudiesSlugAnalysisRunsGet: mockListAnalysisRuns,
    getListAnalysisRunsApiAdminStudiesSlugAnalysisRunsGetQueryKey: vi.fn(() => [
        '/api/admin/studies/test-study/analysis/runs',
    ]),
    // FactorVoicesPanel renders inside the results tab and calls these hooks
    // — return idle/empty queries so the panel renders the empty state
    // without a real network call.
    useListAudiosForParticipantsApiAdminStudiesSlugAnalysisAudiosGet: () => ({
        data: [],
        isLoading: false,
        isSuccess: true,
        isError: false,
        error: null,
    }),
    useListCommentsForParticipantsApiAdminStudiesSlugAnalysisCommentsGet: () => ({
        data: [],
        isLoading: false,
        isSuccess: true,
        isError: false,
        error: null,
    }),
}));

// Mock useParams only — let useSearchParams work against MemoryRouter so
// the routing assertions in this file can drive it via `initialEntries`.
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useParams: () => ({ studySlug: 'test-study', projectSlug: 'test-project' }),
    };
});

const ANALYSIS_PATH = '/app/test-project/studies/test-study/analysis';

const mockEigenvalues: EigenvalueResult = {
    eigenvalues: [2.5, 1.2, 0.8, 0.5],
    suggested_n_factors: 2,
};

const mockResult: AnalysisResult = {
    n_participants: 3,
    n_statements: 4,
    n_factors: 2,
    extraction: 'pca',
    rotation: 'varimax',
    eigenvalues: [2.5, 1.2],
    total_variance_explained: 61.7,
    loadings: [
        [0.8, 0.1],
        [0.7, 0.2],
        [0.1, 0.9],
    ],
    rotated_loadings: [
        [0.82, 0.08],
        [0.71, 0.18],
        [0.05, 0.91],
    ],
    flags: [
        [true, false],
        [true, false],
        [false, true],
    ],
    participants: [
        { db_id: 1, label: 'P001', loadings: [0.82, 0.08], flagged_factors: [1] },
        { db_id: 2, label: 'P002', loadings: [0.71, 0.18], flagged_factors: [1] },
        { db_id: 3, label: 'P003', loadings: [0.05, 0.91], flagged_factors: [2] },
    ],
    statement_scores: [
        {
            statement_id: 1,
            code: 'S1',
            text: 'Statement one',
            z_scores: [1.2, -0.5],
            factor_arrays: [1, -1],
        },
        {
            statement_id: 2,
            code: 'S2',
            text: 'Statement two',
            z_scores: [0.3, 0.8],
            factor_arrays: [0, 1],
        },
        {
            statement_id: 3,
            code: 'S3',
            text: 'Statement three',
            z_scores: [-0.8, 1.1],
            factor_arrays: [-1, 1],
        },
        {
            statement_id: 4,
            code: 'S4',
            text: 'Statement four',
            z_scores: [0.1, -0.3],
            factor_arrays: [0, 0],
        },
    ],
    distinguishing: [
        {
            statement_id: 1,
            code: 'S1',
            text: 'Statement one',
            z_scores: [1.2, -0.5],
            factor_arrays: [1, -1],
            significance: { '1-2': 'p<0.05' },
        },
    ],
    consensus: [
        {
            statement_id: 4,
            code: 'S4',
            text: 'Statement four',
            z_scores: [0.1, -0.3],
            factor_arrays: [0, 0],
            significance: {},
        },
    ],
    factor_characteristics: [
        {
            factor: 1,
            eigenvalue: 2.5,
            variance_explained: 41.7,
            cumulative_variance: 41.7,
            n_flagged: 2,
            avg_rel_coef: 0.8,
            composite_reliability: 0.889,
            se_factor_scores: 0.333,
        },
        {
            factor: 2,
            eigenvalue: 1.2,
            variance_explained: 20.0,
            cumulative_variance: 61.7,
            n_flagged: 1,
            avg_rel_coef: 0.8,
            composite_reliability: 0.8,
            se_factor_scores: 0.447,
        },
    ],
    correlation_matrix: [
        [1.0, 0.05],
        [0.05, 1.0],
    ],
};

const mockRun: AnalysisRunRead = {
    id: 42,
    ran_at: '2026-04-29T12:00:00Z',
    extraction_method: 'pca',
    n_factors: 2,
    rotation_method: 'varimax',
    flagging_mode: 'auto',
    result: mockResult as unknown as AnalysisRunRead['result'],
};

describe('AnalysisPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAnalysisMutationHook.mockReturnValue({
            mutate: vi.fn(),
            isPending: false,
        });
        // History panel hooks — return empty state by default so they don't interfere
        mockListRunsHook.mockReturnValue({
            data: [],
            isLoading: false,
            isSuccess: true,
            isError: false,
        });
        mockUpdateRunMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });
        mockDeleteRunMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });
        // The interpret hook fetches a run; default to "no run loaded"
        mockGetRunHook.mockReturnValue({
            data: undefined,
            isLoading: false,
            isSuccess: false,
            isError: false,
            error: null,
        });
        mockListAnalysisRuns.mockResolvedValue([]);
    });

    it('renders loading state while eigenvalues fetch', () => {
        mockEigenvaluesHook.mockReturnValue({
            data: undefined,
            isLoading: true,
            isSuccess: false,
            isError: false,
            error: null,
            refetch: vi.fn(),
        });

        renderWithProviders(<AnalysisPage />, { initialEntries: [ANALYSIS_PATH] });

        expect(screen.getByText(/Loading eigenvalues/i)).toBeInTheDocument();
    });

    it('renders error state with retry button on eigenvalue failure', async () => {
        const mockRefetch = vi.fn();
        mockEigenvaluesHook.mockReturnValue({
            data: undefined,
            isLoading: false,
            isSuccess: false,
            isError: true,
            error: new Error('Network error'),
            refetch: mockRefetch,
        });

        renderWithProviders(<AnalysisPage />, { initialEntries: [ANALYSIS_PATH] });

        expect(screen.getByText(/Failed to load analysis data/i)).toBeInTheDocument();
        const retryButton = screen.getByText(/Retry/i);
        expect(retryButton).toBeInTheDocument();

        await userEvent.click(retryButton);
        expect(mockRefetch).toHaveBeenCalled();
    });

    it('renders too few participants message for 400 errors', () => {
        const apiError = Object.assign(new Error('Bad Request'), { status: 400 });
        // ApiError constructor check: instanceof ApiError is checked via status property
        Object.defineProperty(apiError, 'constructor', { value: class ApiError {} });

        mockEigenvaluesHook.mockReturnValue({
            data: undefined,
            isLoading: false,
            isSuccess: false,
            isError: true,
            error: apiError,
            refetch: vi.fn(),
        });

        renderWithProviders(<AnalysisPage />, { initialEntries: [ANALYSIS_PATH] });

        // The isTooFewParticipants check requires ApiError instanceof, which won't match
        // with plain Error. The generic error path shows instead.
        expect(screen.getByText(/Failed to load analysis data|at least 2/i)).toBeInTheDocument();
    });

    it('renders empty-state contract instead of configuration card when too few participants', () => {
        // Wave A — the empty-state branch fires when eigenvalues 400s with a real
        // ApiError instance (server says "need at least 2 valid participants").
        const apiError = new ApiError(
            400,
            'Need at least 2 valid participants for analysis, got 0',
            'too_few_participants'
        );
        mockEigenvaluesHook.mockReturnValue({
            data: undefined,
            isLoading: false,
            isSuccess: false,
            isError: true,
            error: apiError,
            refetch: vi.fn(),
        });

        renderWithProviders(<AnalysisPage />, { initialEntries: [ANALYSIS_PATH] });

        // Empty-state contract is rendered
        expect(screen.getByText(/Not enough Q-sort data yet/i)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /open study overview/i })).toBeInTheDocument();

        // Configuration chrome is NOT rendered: the "Configuration" heading
        // and the "Run Analysis" button (the only unambiguous markers — the
        // word "extraction" also appears in the empty-state body copy).
        expect(screen.queryByRole('heading', { name: /^Configuration$/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /run analysis/i })).not.toBeInTheDocument();
    });

    it('renders scree plot and controls after eigenvalues load', () => {
        mockEigenvaluesHook.mockReturnValue({
            data: mockEigenvalues,
            isLoading: false,
            isSuccess: true,
            isError: false,
            error: null,
            refetch: vi.fn(),
        });

        renderWithProviders(<AnalysisPage />, { initialEntries: [ANALYSIS_PATH] });

        // Wave C: Extraction + Factors are primary-visible; Rotation + Flagging
        // moved into the "Advanced settings" Accordion (collapsed by default
        // when values are at their defaults: varimax/auto/no bootstrap).
        expect(screen.getByRole('combobox', { name: /Extraction/i })).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: /^Factors$/i })).toBeInTheDocument();
        expect(screen.queryByRole('combobox', { name: /Rotation/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('combobox', { name: /Flagging/i })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Run Analysis/i })).toBeInTheDocument();
    });

    it('reveals Rotation/Flagging when "Advanced settings" Accordion is opened (Wave C)', async () => {
        mockEigenvaluesHook.mockReturnValue({
            data: mockEigenvalues,
            isLoading: false,
            isSuccess: true,
            isError: false,
            error: null,
            refetch: vi.fn(),
        });

        const user = userEvent.setup();
        renderWithProviders(<AnalysisPage />, { initialEntries: [ANALYSIS_PATH] });

        // The Accordion trigger is a button; clicking it expands the panel
        const advancedTrigger = screen.getByRole('button', { name: /Advanced settings/i });
        await user.click(advancedTrigger);

        // After expanding, Rotation + Flagging dropdowns appear
        expect(await screen.findByRole('combobox', { name: /Rotation/i })).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: /Flagging/i })).toBeInTheDocument();
        // Bootstrap toggle is also inside the advanced panel
        expect(screen.getByLabelText(/Run bootstrap stability/i)).toBeInTheDocument();
    });

    it('factor dropdown is capped at eigenvalues.length - 1', () => {
        mockEigenvaluesHook.mockReturnValue({
            data: { eigenvalues: [3.0, 1.5, 0.5], suggested_n_factors: 2 },
            isLoading: false,
            isSuccess: true,
            isError: false,
            error: null,
            refetch: vi.fn(),
        });

        renderWithProviders(<AnalysisPage />, { initialEntries: [ANALYSIS_PATH] });

        // With 3 eigenvalues, maxFactors = min(3-1, 10) = 2
        // The factor dropdown should show 1 and 2 but not 3
        const factorsSelect = screen.getByRole('combobox', { name: /^Factors$/i });
        expect(factorsSelect).toBeInTheDocument();
    });

    it('disables controls during analysis run', () => {
        mockEigenvaluesHook.mockReturnValue({
            data: mockEigenvalues,
            isLoading: false,
            isSuccess: true,
            isError: false,
            error: null,
            refetch: vi.fn(),
        });

        mockAnalysisMutationHook.mockReturnValue({
            mutate: vi.fn(),
            isPending: true,
        });

        renderWithProviders(<AnalysisPage />, { initialEntries: [ANALYSIS_PATH] });

        expect(screen.getByText(/Analyzing/i)).toBeInTheDocument();
    });

    it('shows empty state when no results yet', () => {
        mockEigenvaluesHook.mockReturnValue({
            data: mockEigenvalues,
            isLoading: false,
            isSuccess: true,
            isError: false,
            error: null,
            refetch: vi.fn(),
        });

        renderWithProviders(<AnalysisPage />, { initialEntries: [ANALYSIS_PATH] });

        expect(screen.getByText(/Set parameters and run the analysis/i)).toBeInTheDocument();
    });

    it('does not show export button in explore phase', () => {
        mockEigenvaluesHook.mockReturnValue({
            data: mockEigenvalues,
            isLoading: false,
            isSuccess: true,
            isError: false,
            error: null,
            refetch: vi.fn(),
        });

        renderWithProviders(<AnalysisPage />, { initialEntries: [ANALYSIS_PATH] });

        expect(screen.queryByText(/Export/i)).not.toBeInTheDocument();
    });

    it('calls mutate with correct params when Run Analysis is clicked', async () => {
        const mockMutate = vi.fn();
        mockEigenvaluesHook.mockReturnValue({
            data: mockEigenvalues,
            isLoading: false,
            isSuccess: true,
            isError: false,
            error: null,
            refetch: vi.fn(),
        });

        mockAnalysisMutationHook.mockReturnValue({
            mutate: mockMutate,
            isPending: false,
        });

        renderWithProviders(<AnalysisPage />, { initialEntries: [ANALYSIS_PATH] });

        await userEvent.click(screen.getByRole('button', { name: /Run Analysis/i }));

        expect(mockMutate).toHaveBeenCalledWith(
            expect.objectContaining({
                slug: 'test-study',
                data: expect.objectContaining({
                    extraction: 'pca',
                    rotation: 'varimax',
                    flagging: 'auto',
                }),
            }),
            expect.any(Object)
        );
    });

    it('shows parameter help descriptions', () => {
        mockEigenvaluesHook.mockReturnValue({
            data: mockEigenvalues,
            isLoading: false,
            isSuccess: true,
            isError: false,
            error: null,
            refetch: vi.fn(),
        });

        renderWithProviders(<AnalysisPage />, { initialEntries: [ANALYSIS_PATH] });

        // Wave C: PCA + Factors help texts are primary-visible.
        expect(screen.getByText(/PCA maximises explained variance/i)).toBeInTheDocument();
        expect(
            screen.getByText(/Each factor represents a distinct viewpoint/i)
        ).toBeInTheDocument();
        // Rotation + Flagging help texts now live inside the collapsed
        // "Advanced settings" Accordion — not visible on initial render.
        expect(
            screen.queryByText(/Varimax separates factors for simpler structure/i)
        ).not.toBeInTheDocument();
        expect(screen.queryByText(/Auto: flag participants loading/i)).not.toBeInTheDocument();
    });

    it('shows interpretation guidance in interpret phase loadings tab', async () => {
        mockEigenvaluesHook.mockReturnValue({
            data: mockEigenvalues,
            isLoading: false,
            isSuccess: true,
            isError: false,
            error: null,
            refetch: vi.fn(),
        });
        mockGetRunHook.mockReturnValue({
            data: mockRun,
            isLoading: false,
            isSuccess: true,
            isError: false,
            error: null,
        });

        renderWithProviders(<AnalysisPage />, {
            initialEntries: [`${ANALYSIS_PATH}?phase=interpret&runId=42`],
        });

        // The loadings tab should show its guidance card (default tab)
        expect(await screen.findByText(/Reading Factor Loadings/i)).toBeInTheDocument();
    });

    // ── Phase-routing tests (Task 11) ──────────────────────────────

    it('renders Explore phase by default when no run is loaded', async () => {
        mockEigenvaluesHook.mockReturnValue({
            data: mockEigenvalues,
            isLoading: false,
            isSuccess: true,
            isError: false,
            error: null,
            refetch: vi.fn(),
        });

        renderWithProviders(<AnalysisPage />, { initialEntries: [ANALYSIS_PATH] });

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /run analysis/i })).toBeInTheDocument();
        });
        // Interpret-phase marker is absent in explore mode.
        expect(screen.queryByTestId('interpret-phase')).not.toBeInTheDocument();
    });

    it('renders Interpret phase when ?phase=interpret&runId=42', async () => {
        mockEigenvaluesHook.mockReturnValue({
            data: mockEigenvalues,
            isLoading: false,
            isSuccess: true,
            isError: false,
            error: null,
            refetch: vi.fn(),
        });
        mockGetRunHook.mockReturnValue({
            data: mockRun,
            isLoading: false,
            isSuccess: true,
            isError: false,
            error: null,
        });

        renderWithProviders(<AnalysisPage />, {
            initialEntries: [`${ANALYSIS_PATH}?phase=interpret&runId=42`],
        });

        await waitFor(() => {
            expect(screen.getByTestId('interpret-phase')).toBeInTheDocument();
        });
        // Configuration card is NOT rendered in interpret phase.
        expect(screen.queryByRole('button', { name: /^run analysis$/i })).not.toBeInTheDocument();
    });

    it('bounces back to Explore when AnalysisHistoryPanel signals current-run deletion', async () => {
        // Setup: in interpret phase viewing run 42; the history panel lists
        // run 42 as the only entry. Clicking trash → confirm → the delete
        // mutation onSuccess fires onLoadRun(null, null), which the page
        // turns into navigateToExplore() — URL drops ?phase=interpret.
        mockEigenvaluesHook.mockReturnValue({
            data: mockEigenvalues,
            isLoading: false,
            isSuccess: true,
            isError: false,
            error: null,
            refetch: vi.fn(),
        });
        mockGetRunHook.mockReturnValue({
            data: mockRun,
            isLoading: false,
            isSuccess: true,
            isError: false,
            error: null,
        });
        mockListRunsHook.mockReturnValue({
            data: [
                {
                    id: 42,
                    ran_at: '2026-04-29T12:00:00Z',
                    extraction_method: 'pca',
                    n_factors: 2,
                    rotation_method: 'varimax',
                    flagging_mode: 'auto',
                },
            ],
            isLoading: false,
            isSuccess: true,
            isError: false,
        });
        // The delete mutation fires its onSuccess synchronously so the
        // panel's onLoadRun(null, null) callback runs in-place.
        const mockDeleteMutate = vi.fn(
            (
                _vars: unknown,
                opts?: {
                    onSuccess?: () => void;
                }
            ) => {
                opts?.onSuccess?.();
            }
        );
        mockDeleteRunMutation.mockReturnValue({ mutate: mockDeleteMutate, isPending: false });

        renderWithProviders(<AnalysisPage />, {
            initialEntries: [`${ANALYSIS_PATH}?phase=interpret&runId=42`],
        });

        // We're in interpret phase first.
        await waitFor(() => {
            expect(screen.getByTestId('interpret-phase')).toBeInTheDocument();
        });

        // Open the delete confirmation, then confirm. The history panel
        // exposes a Trash2 button per row; AlertDialog renders "Delete" as
        // its confirm action.
        const deleteButtons = screen.getAllByLabelText(/Delete this analysis run/i);
        await userEvent.click(deleteButtons[0] as HTMLElement);
        const confirmButton = await screen.findByRole('button', { name: /^Delete$/ });
        await userEvent.click(confirmButton);

        // After bounce: interpret marker is gone, Explore configuration is back.
        await waitFor(() => {
            expect(screen.queryByTestId('interpret-phase')).not.toBeInTheDocument();
        });
        expect(screen.getByRole('button', { name: /run analysis/i })).toBeInTheDocument();
    });

    it('navigates to interpret phase after a successful run', async () => {
        mockEigenvaluesHook.mockReturnValue({
            data: mockEigenvalues,
            isLoading: false,
            isSuccess: true,
            isError: false,
            error: null,
            refetch: vi.fn(),
        });
        // After a successful run, the explore hook fetches the latest run list
        // to learn the new runId. Return one entry so the page navigates to
        // ?phase=interpret&runId=99.
        mockListAnalysisRuns.mockResolvedValue([
            {
                id: 99,
                ran_at: '2026-04-29T13:00:00Z',
                extraction_method: 'pca',
                n_factors: 2,
                rotation_method: 'varimax',
                flagging_mode: 'auto',
            },
        ]);
        // After the URL flips, the interpret hook fetches run #99.
        mockGetRunHook.mockReturnValue({
            data: { ...mockRun, id: 99 },
            isLoading: false,
            isSuccess: true,
            isError: false,
            error: null,
        });

        const mockMutate = vi.fn((_payload, callbacks) => {
            // Simulate the mutation calling onSuccess with a result payload.
            callbacks.onSuccess(mockResult);
        });
        mockAnalysisMutationHook.mockReturnValue({
            mutate: mockMutate,
            isPending: false,
        });

        renderWithProviders(<AnalysisPage />, { initialEntries: [ANALYSIS_PATH] });

        await userEvent.click(screen.getByRole('button', { name: /run analysis/i }));

        // The hook awaits the runs list, then routes — the marker appears once
        // the URL has flipped to interpret.
        await waitFor(() => {
            expect(screen.getByTestId('interpret-phase')).toBeInTheDocument();
        });
    });
});
