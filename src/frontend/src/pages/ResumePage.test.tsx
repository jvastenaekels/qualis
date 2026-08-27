/*
 * Qualis - Open-source platform for conducting Q-methodology research
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
    resetAllStores: vi.fn(),
    setToken: vi.fn(),
    setStudySlug: vi.fn(),
    setConsent: vi.fn(),
    setStep: vi.fn(),
    setLanguage: vi.fn(),
    setResumeCode: vi.fn(),
    completeSession: vi.fn(),
    setState: vi.fn(),
    toastSuccess: vi.fn(),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_key: string, fallback: string) => fallback,
        i18n: {
            changeLanguage: vi.fn().mockResolvedValue(undefined),
            t: (_key: string, fallback: string) => fallback,
        },
    }),
}));

vi.mock('../api/mutator', () => ({
    customInstance: mocks.customInstance,
}));

vi.mock('../utils/sessionReset', () => ({
    resetAllStores: mocks.resetAllStores,
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

vi.mock('../store/useSessionStore', () => ({
    useSessionStore: {
        getState: () => ({
            setToken: mocks.setToken,
            setStudySlug: mocks.setStudySlug,
            setConsent: mocks.setConsent,
            setStep: mocks.setStep,
            setLanguage: mocks.setLanguage,
            setResumeCode: mocks.setResumeCode,
            completeSession: mocks.completeSession,
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
        getState: () => ({}),
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

    it('redirects to confirmation page on 410 (already completed)', async () => {
        mocks.customInstance.mockRejectedValue({ status: 410 });
        renderResumePage();

        await waitFor(() => {
            expect(mocks.completeSession).toHaveBeenCalledWith('');
            expect(mocks.navigate).toHaveBeenCalledWith('/study/test-study/post-sort', {
                replace: true,
            });
        });
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
                qsort: [
                    { statementId: 1, col: 0, row: 0 },
                    { statementId: 2, col: 1, row: 0 },
                ],
                postsort: { feedback: 'good' },
            },
            resume_code: 'brave-tiger-42',
        });

        renderResumePage();

        await waitFor(() => {
            expect(mocks.resetAllStores).toHaveBeenCalled();
            expect(mocks.setToken).toHaveBeenCalledWith('abc-123');
            expect(mocks.setConsent).toHaveBeenCalledWith(true);
            expect(mocks.setStep).toHaveBeenCalledWith(3);
            expect(mocks.setLanguage).toHaveBeenCalledWith('en');
            expect(mocks.setResumeCode).toHaveBeenCalledWith('brave-tiger-42');
            expect(mocks.setState).toHaveBeenCalledWith({
                presort: { q1: 'yes' },
                rough: { agree: [1], disagree: [2], neutral: [3], history: [] },
                qsort: [
                    { statementId: 1, col: 0, row: 0 },
                    { statementId: 2, col: 1, row: 0 },
                ],
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
            resume_code: 'calm-fox-11',
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
            resume_code: 'keen-owl-55',
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
            resume_code: 'swift-deer-73',
        });

        renderResumePage();

        await waitFor(() => {
            expect(mocks.toastSuccess).toHaveBeenCalledWith(
                'Welcome back! Your progress has been restored.'
            );
        });
    });
});
