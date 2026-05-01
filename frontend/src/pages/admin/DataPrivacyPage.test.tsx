/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { renderWithProviders, screen, waitFor } from '@/test-utils/test-utils';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DataPrivacyPage from './DataPrivacyPage';
import type { DataInventory } from '@/api/model';

// Mock sonner
vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}));

// Hoisted mocks
const { mockInventoryHook, mockAnonymiseMutation, mockPreviewHook } = vi.hoisted(() => ({
    mockInventoryHook: vi.fn(),
    mockAnonymiseMutation: vi.fn(),
    mockPreviewHook: vi.fn(),
}));

vi.mock('@/api/generated', () => ({
    useGetDataInventoryApiAdminStudiesSlugDataInventoryGet: mockInventoryHook,
    useBulkAnonymiseOldParticipantsApiAdminStudiesSlugAnonymiseBulkPost: mockAnonymiseMutation,
    usePreviewAnonymiseCandidatesApiAdminStudiesSlugAnonymisePreviewGet: mockPreviewHook,
    getGetDataInventoryApiAdminStudiesSlugDataInventoryGetQueryKey: vi.fn(() => [
        '/api/admin/studies/test-study/data-inventory',
    ]),
}));

// Mock react-router-dom to provide params
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useParams: () => ({ studySlug: 'test-study', projectSlug: 'test-project' }),
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

// Mock useAdminContext: provides the study (with translations) consumed by
// ConsentSummaryCard. Default returns a study with no consent text — tests
// that need consent content can override via the imported mock.
vi.mock('@/hooks/useAdminContext', () => ({
    useAdminContext: () => ({
        project: undefined,
        study: { translations: [] },
    }),
}));

const mockInventory: DataInventory = {
    study_slug: 'test-study',
    generated_at: new Date().toISOString(),
    participants: {
        total: 50,
        started: 10,
        completed: 30,
        discarded: 8,
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

describe('DataPrivacyPage', () => {
    beforeEach(() => {
        mockInventoryHook.mockReset();
        mockAnonymiseMutation.mockReset();
        mockPreviewHook.mockReset();
        // Default: preview returns 0 candidates and is not fetching.
        // Individual tests override when they need a specific count.
        mockPreviewHook.mockReturnValue({
            data: { candidates: 0, cutoff: new Date().toISOString() },
            isFetching: false,
        });
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

        renderWithProviders(<DataPrivacyPage />);

        // Page header
        expect(screen.getByText('Data privacy')).toBeInTheDocument();

        // Consent summary card is always present at the top
        expect(screen.getByText('Consent form')).toBeInTheDocument();

        // Participant stats (Total stat removed in text-trim wave; Started/Completed/Discarded/Anonymised remain)
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

        renderWithProviders(<DataPrivacyPage />);

        // Header is still shown
        expect(screen.getByText('Data privacy')).toBeInTheDocument();
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

        renderWithProviders(<DataPrivacyPage />);

        expect(screen.getByText(/failed to load data inventory/i)).toBeInTheDocument();
    });

    it('bulk anonymise opens confirmation dialog and calls API on confirm', async () => {
        const mutateMock = vi.fn();

        mockInventoryHook.mockReturnValue({
            data: mockInventory,
            isLoading: false,
            error: null,
        });
        // Server-side preview returns 18 — exact count, not the year-bucketed
        // estimate the old UI computed locally from inventory.timeline.
        mockPreviewHook.mockReturnValue({
            data: { candidates: 18, cutoff: new Date().toISOString() },
            isFetching: false,
        });
        mockAnonymiseMutation.mockReturnValue({
            mutate: mutateMock,
            isPending: false,
        });

        const user = userEvent.setup();
        renderWithProviders(<DataPrivacyPage />);

        // The anonymise button should be enabled (18 candidates for 1-year cutoff default)
        const anonymiseBtn = screen.getByRole('button', {
            name: /^anonymise$/i,
        });
        expect(anonymiseBtn).not.toBeDisabled();

        // Click it → confirmation dialog opens
        await user.click(anonymiseBtn);

        const dialog = await screen.findByRole('alertdialog');
        expect(dialog).toBeInTheDocument();
        expect(screen.getByText(/anonymise participant data/i)).toBeInTheDocument();
        expect(screen.getByText(/18 completed participant/i)).toBeInTheDocument();
        expect(screen.getByText(/q-sort rankings are kept/i)).toBeInTheDocument();
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

    it('renders empty-state contract instead of inventory cards when no participants', () => {
        const emptyInventory: DataInventory = {
            ...mockInventory,
            participants: {
                total: 0,
                started: 0,
                completed: 0,
                discarded: 0,
                anonymised: 0,
            },
            audio: { count: 0, total_bytes: 0, total_mb: 0 },
            timeline: {
                first_submission_at: null,
                last_submission_at: null,
                last_anonymisation_at: null,
                completed_older_than_1y: 0,
                completed_older_than_2y: 0,
            },
            locales: {},
        };
        mockInventoryHook.mockReturnValue({
            data: emptyInventory,
            isLoading: false,
            error: null,
        });
        mockAnonymiseMutation.mockReturnValue({
            mutate: vi.fn(),
            isPending: false,
        });

        renderWithProviders(<DataPrivacyPage />);

        // Empty-state contract is shown
        expect(screen.getByText(/No participant data yet/i)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /open study overview/i })).toBeInTheDocument();

        // Consent summary card is still shown — it's design-time content,
        // visible even before the first participant submits.
        expect(screen.getByText('Consent form')).toBeInTheDocument();

        // Inventory chrome is NOT shown
        expect(screen.queryByText('Participants snapshot')).not.toBeInTheDocument();
        expect(screen.queryByText('Bulk anonymisation')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^anonymise$/i })).not.toBeInTheDocument();
    });
});
