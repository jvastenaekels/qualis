/*
 * Libre-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test-utils/test-utils';
import ResumePage from './ResumePage';

// Hoisted mocks
const mocks = vi.hoisted(() => ({
    customInstance: vi.fn(),
    navigate: vi.fn(),
    resetConfig: vi.fn(),
    resetSession: vi.fn(),
    resetResponses: vi.fn(),
    setToken: vi.fn(),
    setConsent: vi.fn(),
    setStep: vi.fn(),
    setLanguage: vi.fn(),
    setState: vi.fn(),
    toastSuccess: vi.fn(),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_key: string, fallback: string) => fallback,
    }),
}));

vi.mock('../api/mutator', () => ({
    customInstance: mocks.customInstance,
}));

vi.mock('sonner', () => ({
    toast: { success: mocks.toastSuccess, error: vi.fn() },
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mocks.navigate,
    };
});

vi.mock('../store/useConfigStore', () => ({
    useConfigStore: {
        getState: () => ({ resetConfig: mocks.resetConfig }),
    },
}));

vi.mock('../store/useSessionStore', () => ({
    useSessionStore: {
        getState: () => ({
            resetSession: mocks.resetSession,
            setToken: mocks.setToken,
            setConsent: mocks.setConsent,
            setStep: mocks.setStep,
            setLanguage: mocks.setLanguage,
        }),
    },
}));

vi.mock('../store/useResponseStore', () => ({
    initialResponses: {
        presort: {},
        rough: { agree: [], disagree: [], neutral: [], history: [] },
        qsort: [],
        postsort: {},
    },
    useResponseStore: {
        getState: () => ({ resetResponses: mocks.resetResponses }),
        setState: mocks.setState,
    },
}));

function renderResumePage(slug = 'test-study', token = '550e8400-e29b-41d4-a716-446655440000') {
    return render(
        <MemoryRouter initialEntries={[`/study/${slug}/resume/${token}`]}>
            <Routes>
                <Route path="/study/:slug/resume/:token" element={<ResumePage />} />
            </Routes>
        </MemoryRouter>
    );
}

describe('ResumePage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('shows loading state initially', () => {
        mocks.customInstance.mockReturnValue(new Promise(() => {})); // never resolves
        renderResumePage();
        expect(screen.getByText('Restoring your session...')).toBeInTheDocument();
    });

    it('shows not_found error on 404', async () => {
        mocks.customInstance.mockRejectedValue({ status: 404 });
        renderResumePage();

        await waitFor(() => {
            expect(screen.getByText(/This link is no longer valid/)).toBeInTheDocument();
        });
        expect(screen.getByText('Start a new session')).toBeInTheDocument();
    });

    it('shows already_completed error on 410', async () => {
        mocks.customInstance.mockRejectedValue({ status: 410 });
        renderResumePage();

        await waitFor(() => {
            expect(screen.getByText(/already submitted your responses/)).toBeInTheDocument();
        });
        // No "Start a new session" link for completed
        expect(screen.queryByText('Start a new session')).not.toBeInTheDocument();
    });

    it('shows study_closed error on 403', async () => {
        mocks.customInstance.mockRejectedValue({ status: 403 });
        renderResumePage();

        await waitFor(() => {
            expect(screen.getByText(/no longer accepting responses/)).toBeInTheDocument();
        });
    });

    it('shows rate_limited error on 429', async () => {
        mocks.customInstance.mockRejectedValue({ status: 429 });
        renderResumePage();

        await waitFor(() => {
            expect(screen.getByText(/Too many attempts/)).toBeInTheDocument();
        });
        expect(screen.getByText('Retry')).toBeInTheDocument();
    });

    it('shows generic error for unknown status', async () => {
        mocks.customInstance.mockRejectedValue({ status: 500 });
        renderResumePage();

        await waitFor(() => {
            expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
        });
        expect(screen.getByText('Retry')).toBeInTheDocument();
        expect(screen.getByText('Start a new session')).toBeInTheDocument();
    });

    it('hydrates stores and navigates on successful resume', async () => {
        mocks.customInstance.mockResolvedValue({
            session_token: 'abc-123',
            language: 'en',
            last_step_reached: 3,
            draft_responses: {
                presort: { q1: 'yes' },
                rough: { agree: [1], disagree: [2], neutral: [3], history: [] },
                qsort: [[1], [2]],
                postsort: { feedback: 'good' },
            },
        });

        renderResumePage();

        await waitFor(() => {
            expect(mocks.resetConfig).toHaveBeenCalled();
            expect(mocks.resetSession).toHaveBeenCalled();
            expect(mocks.resetResponses).toHaveBeenCalled();
            expect(mocks.setToken).toHaveBeenCalledWith('abc-123');
            expect(mocks.setConsent).toHaveBeenCalledWith(true);
            expect(mocks.setStep).toHaveBeenCalledWith(3);
            expect(mocks.setLanguage).toHaveBeenCalledWith('en');
            expect(mocks.setState).toHaveBeenCalledWith({
                presort: { q1: 'yes' },
                rough: { agree: [1], disagree: [2], neutral: [3], history: [] },
                qsort: [[1], [2]],
                postsort: { feedback: 'good' },
            });
            expect(mocks.navigate).toHaveBeenCalledWith('/study/test-study/rough-sort', {
                replace: true,
            });
        });
    });

    it('falls back to initialResponses for invalid draft shape', async () => {
        mocks.customInstance.mockResolvedValue({
            session_token: 'abc-123',
            language: 'en',
            last_step_reached: 2,
            draft_responses: {
                presort: 'not-an-object',
                rough: { agree: 'not-an-array' },
                qsort: 'not-an-array',
                postsort: [1, 2, 3],
            },
        });

        renderResumePage();

        await waitFor(() => {
            expect(mocks.setState).toHaveBeenCalledWith({
                presort: {},
                rough: { agree: [], disagree: [], neutral: [], history: [] },
                qsort: [],
                postsort: {},
            });
        });
    });

    it('skips draft hydration when draft_responses is empty', async () => {
        mocks.customInstance.mockResolvedValue({
            session_token: 'abc-123',
            language: 'en',
            last_step_reached: 1,
            draft_responses: {},
        });

        renderResumePage();

        await waitFor(() => {
            expect(mocks.navigate).toHaveBeenCalledWith('/study/test-study/welcome', {
                replace: true,
            });
        });
        expect(mocks.setState).not.toHaveBeenCalled();
    });

    it('shows welcome-back toast on successful resume', async () => {
        mocks.customInstance.mockResolvedValue({
            session_token: 'abc-123',
            language: 'en',
            last_step_reached: 4,
            draft_responses: {},
        });

        renderResumePage();

        await waitFor(() => {
            expect(mocks.toastSuccess).toHaveBeenCalledWith(
                'Welcome back! Your progress has been restored.'
            );
        });
    });
});
