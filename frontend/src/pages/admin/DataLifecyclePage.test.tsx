/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { renderWithProviders, screen, waitFor } from '@/test-utils/test-utils';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DataLifecyclePage from './DataLifecyclePage';
import type { DataInventory } from '@/api/model';

// Mock sonner
vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}));

// Hoisted mocks
const { mockInventoryHook, mockAnonymiseMutation } = vi.hoisted(() => ({
    mockInventoryHook: vi.fn(),
    mockAnonymiseMutation: vi.fn(),
}));

vi.mock('@/api/generated', () => ({
    useGetDataInventoryApiAdminStudiesSlugDataInventoryGet: mockInventoryHook,
    useBulkAnonymiseOldParticipantsApiAdminStudiesSlugAnonymiseBulkPost: mockAnonymiseMutation,
    getGetDataInventoryApiAdminStudiesSlugDataInventoryGetQueryKey: vi.fn(() => [
        '/api/admin/studies/test-study/data-inventory',
    ]),
}));

// Mock react-router-dom to provide params
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useParams: () => ({ studySlug: 'test-study' }),
    };
});

// Mock react-query invalidateQueries
vi.mock('@tanstack/react-query', async () => {
    const actual =
        await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');
    return {
        ...actual,
        useQueryClient: () => ({
            invalidateQueries: vi.fn(),
        }),
    };
});

const mockInventory: DataInventory = {
    study_slug: 'test-study',
    generated_at: new Date().toISOString(),
    participants: {
        total: 50,
        started: 10,
        completed: 30,
        discarded: 8,
        test_runs: 2,
        anonymised: 5,
    },
    audio: {
        count: 12,
        total_bytes: 25_165_824,
        total_mb: 24.0,
    },
    timeline: {
        first_submission_at: '2023-01-15T10:00:00Z',
        last_submission_at: '2024-06-20T14:30:00Z',
        last_anonymisation_at: '2024-03-01T08:00:00Z',
        completed_older_than_1y: 18,
        completed_older_than_2y: 7,
    },
    locales: { en: 25, fr: 15, fi: 10 },
};

describe('DataLifecyclePage', () => {
    beforeEach(() => {
        mockInventoryHook.mockReset();
        mockAnonymiseMutation.mockReset();
    });

    it('renders inventory data when API resolves', () => {
        mockInventoryHook.mockReturnValue({
            data: mockInventory,
            isLoading: false,
            error: null,
        });
        mockAnonymiseMutation.mockReturnValue({
            mutate: vi.fn(),
            isPending: false,
        });

        renderWithProviders(<DataLifecyclePage />);

        // Page header
        expect(screen.getByText('Data inventory & lifecycle')).toBeInTheDocument();

        // Participant stats
        expect(screen.getByText('50')).toBeInTheDocument(); // total
        expect(screen.getByText('30')).toBeInTheDocument(); // completed
        expect(screen.getByText('5')).toBeInTheDocument(); // anonymised

        // Older-than hints (18 also appears in the preview section, use getAllByText)
        expect(screen.getAllByText('18').length).toBeGreaterThanOrEqual(1); // completed_older_than_1y
        expect(screen.getByText('7')).toBeInTheDocument(); // completed_older_than_2y

        // Audio storage
        expect(screen.getByText('12')).toBeInTheDocument(); // recording count
        expect(screen.getByText('24.00 MB')).toBeInTheDocument();

        // Locale breakdown (DOM text is lowercase; CSS uppercase is visual only)
        expect(screen.getByText('en')).toBeInTheDocument();
        expect(screen.getByText('fr')).toBeInTheDocument();
        expect(screen.getByText('fi')).toBeInTheDocument();

        // Timeline dates — format varies by locale but must include the year
        expect(screen.getByText(/2023/)).toBeInTheDocument();
    });

    it('shows loading skeleton while data is loading', () => {
        mockInventoryHook.mockReturnValue({
            data: undefined,
            isLoading: true,
            error: null,
        });
        mockAnonymiseMutation.mockReturnValue({
            mutate: vi.fn(),
            isPending: false,
        });

        renderWithProviders(<DataLifecyclePage />);

        // Header is still shown
        expect(screen.getByText('Data inventory & lifecycle')).toBeInTheDocument();
        // Stats table should not be there
        expect(screen.queryByText('Participants snapshot')).not.toBeInTheDocument();
    });

    it('shows error state when API fails', () => {
        mockInventoryHook.mockReturnValue({
            data: undefined,
            isLoading: false,
            error: new Error('Network error'),
        });
        mockAnonymiseMutation.mockReturnValue({
            mutate: vi.fn(),
            isPending: false,
        });

        renderWithProviders(<DataLifecyclePage />);

        expect(screen.getByText(/failed to load data inventory/i)).toBeInTheDocument();
    });

    it('bulk anonymise opens confirmation dialog and calls API on confirm', async () => {
        const mutateMock = vi.fn();

        mockInventoryHook.mockReturnValue({
            data: mockInventory,
            isLoading: false,
            error: null,
        });
        mockAnonymiseMutation.mockReturnValue({
            mutate: mutateMock,
            isPending: false,
        });

        const user = userEvent.setup();
        renderWithProviders(<DataLifecyclePage />);

        // The anonymise button should be enabled (18 candidates for 1-year cutoff default)
        const anonymiseBtn = screen.getByRole('button', {
            name: /anonymise older than/i,
        });
        expect(anonymiseBtn).not.toBeDisabled();

        // Click it → confirmation dialog opens
        await user.click(anonymiseBtn);

        const dialog = await screen.findByRole('alertdialog');
        expect(dialog).toBeInTheDocument();
        expect(screen.getByText(/anonymise participant data/i)).toBeInTheDocument();
        expect(screen.getByText(/18 completed participant/i)).toBeInTheDocument();
        expect(
            screen.getByText(/q-sort statement rankings will be preserved/i)
        ).toBeInTheDocument();
        expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();

        // Confirm
        const confirmBtn = screen.getByRole('button', { name: /yes, anonymise/i });
        await user.click(confirmBtn);

        await waitFor(() => {
            expect(mutateMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    slug: 'test-study',
                    data: expect.objectContaining({
                        submitted_before: expect.any(String),
                    }),
                })
            );
        });
    });
});
