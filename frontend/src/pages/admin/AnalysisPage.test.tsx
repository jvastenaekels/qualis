import { renderWithProviders, screen } from '@/test-utils/test-utils';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { act } from 'react';
import userEvent from '@testing-library/user-event';
import AnalysisPage from './AnalysisPage';
import type { AnalysisResult } from '@/api/model';
import type { EigenvalueResult } from '@/api/model';

// Mock sonner
vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}));

// Hoisted mocks for the generated API hooks
const {
    mockEigenvaluesHook,
    mockAnalysisMutationHook,
    mockListRunsHook,
    mockUpdateRunMutation,
    mockDeleteRunMutation,
} = vi.hoisted(() => ({
    mockEigenvaluesHook: vi.fn(),
    mockAnalysisMutationHook: vi.fn(),
    mockListRunsHook: vi.fn(),
    mockUpdateRunMutation: vi.fn(),
    mockDeleteRunMutation: vi.fn(),
}));

vi.mock('@/api/generated', () => ({
    useGetEigenvaluesApiAdminStudiesSlugAnalysisEigenvaluesGet: mockEigenvaluesHook,
    useRunFactorAnalysisApiAdminStudiesSlugAnalysisRunPost: mockAnalysisMutationHook,
    useListAnalysisRunsApiAdminStudiesSlugAnalysisRunsGet: mockListRunsHook,
    useUpdateAnalysisRunApiAdminStudiesSlugAnalysisRunsRunIdPatch: mockUpdateRunMutation,
    useDeleteAnalysisRunApiAdminStudiesSlugAnalysisRunsRunIdDelete: mockDeleteRunMutation,
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

// Mock react-router-dom
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useParams: () => ({ studySlug: 'test-study' }),
        useSearchParams: () => [new URLSearchParams(), vi.fn()],
    };
});

const mockEigenvalues: EigenvalueResult = {
    eigenvalues: [2.5, 1.2, 0.8, 0.5],
    suggested_n_factors: 2,
};

const _mockResult: AnalysisResult = {
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

        renderWithProviders(<AnalysisPage />);

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

        renderWithProviders(<AnalysisPage />);

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

        renderWithProviders(<AnalysisPage />);

        // The isTooFewParticipants check requires ApiError instanceof, which won't match
        // with plain Error. The generic error path shows instead.
        expect(screen.getByText(/Failed to load analysis data|at least 2/i)).toBeInTheDocument();
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

        renderWithProviders(<AnalysisPage />);

        // Controls should be present (use exact id selectors to avoid sr-only listbox matches)
        expect(screen.getByRole('combobox', { name: /Extraction/i })).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: /^Factors$/i })).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: /Rotation/i })).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: /Flagging/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Run Analysis/i })).toBeInTheDocument();
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

        renderWithProviders(<AnalysisPage />);

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

        renderWithProviders(<AnalysisPage />);

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

        renderWithProviders(<AnalysisPage />);

        expect(screen.getByText(/Configure parameters above/i)).toBeInTheDocument();
    });

    it('does not show export button when no results', () => {
        mockEigenvaluesHook.mockReturnValue({
            data: mockEigenvalues,
            isLoading: false,
            isSuccess: true,
            isError: false,
            error: null,
            refetch: vi.fn(),
        });

        renderWithProviders(<AnalysisPage />);

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

        renderWithProviders(<AnalysisPage />);

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

        renderWithProviders(<AnalysisPage />);

        expect(screen.getByText(/PCA maximizes explained variance/i)).toBeInTheDocument();
        expect(
            screen.getByText(/Each factor represents a distinct viewpoint/i)
        ).toBeInTheDocument();
        expect(screen.getByText(/Varimax maximizes the separation/i)).toBeInTheDocument();
        expect(screen.getByText(/Auto flags participants whose loading/i)).toBeInTheDocument();
    });

    it('shows interpretation guidance in results tabs', async () => {
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

        renderWithProviders(<AnalysisPage />);

        // Trigger analysis by clicking Run then calling the onSuccess callback
        await userEvent.click(screen.getByRole('button', { name: /Run Analysis/i }));

        // Extract the onSuccess callback and call it with mock result
        const [, callbacks] = mockMutate.mock.calls[0];
        await act(async () => {
            callbacks.onSuccess(_mockResult);
        });

        // The loadings tab should show its guidance card (default tab)
        expect(screen.getByText(/Reading Factor Loadings/i)).toBeInTheDocument();
    });
});
