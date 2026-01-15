/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@/test-utils/test-utils';
import { ApiError } from '../api/client';
import ErrorPage from './ErrorPage';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
    I18nextProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mocks = vi.hoisted(() => ({
    resetSession: vi.fn(),
    resetConfig: vi.fn(),
    resetResponses: vi.fn(),
    navigate: vi.fn(),
}));

// Mocks
vi.mock('../store/useSessionStore', () => ({
    useSessionStore: {
        getState: () => ({ resetSession: mocks.resetSession }),
    },
}));
vi.mock('../store/useConfigStore', () => ({
    useConfigStore: {
        getState: () => ({ resetConfig: mocks.resetConfig }),
    },
}));
vi.mock('../store/useResponseStore', () => ({
    useResponseStore: {
        getState: () => ({ resetResponses: mocks.resetResponses }),
    },
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mocks.navigate,
    };
});

describe('ErrorPage', () => {
    // Mock window.location
    const originalLocation = window.location;

    beforeEach(() => {
        // @ts-expect-error - window.location is read-only in JSDOM
        delete window.location;
        // @ts-expect-error - window.location is read-only in JSDOM
        window.location = { href: '' };
        vi.clearAllMocks();
    });

    afterEach(() => {
        // @ts-expect-error - window.location is read-only in JSDOM
        window.location = originalLocation;
    });

    it('renders generic error message by default', () => {
        render(
            <MemoryRouter>
                <ErrorPage />
            </MemoryRouter>
        );
        // "common.errors.default_title" matches mock translation key
        expect(screen.getByText('common.errors.default_title')).toBeInTheDocument();
        expect(screen.getByText('common.errors.unknown')).toBeInTheDocument();
        expect(screen.getByText('common.errors.reset')).toBeInTheDocument();
        expect(screen.getByText('common.errors.home')).toBeInTheDocument();
    });

    it('renders specific 404 UI', () => {
        render(
            <MemoryRouter>
                <ErrorPage error={new ApiError(404, 'Not found')} />
            </MemoryRouter>
        );
        expect(screen.getByText('common.errors.404.title')).toBeInTheDocument();
        expect(screen.queryByText('common.errors.retry')).not.toBeInTheDocument();
        expect(screen.queryByText('Oops! Something went wrong.')).not.toBeInTheDocument();
    });

    it('resets session on button click for generic error', () => {
        render(
            <MemoryRouter>
                <ErrorPage />
            </MemoryRouter>
        );

        // Button text is now from translation keys
        const resetButton = screen.getByRole('button', {
            name: 'common.errors.reset',
        });
        fireEvent.click(resetButton);

        expect(mocks.resetSession).toHaveBeenCalled();
        expect(mocks.resetConfig).toHaveBeenCalled();
        expect(mocks.resetResponses).toHaveBeenCalled();
        expect(window.location.href).toBe('/');
    });

    it('shows retry button for 429', () => {
        const onRetry = vi.fn();
        render(
            <MemoryRouter>
                <ErrorPage error={new ApiError(429, 'Rate limited')} onRetry={onRetry} />
            </MemoryRouter>
        );

        const retryButton = screen.getByRole('button', {
            name: 'common.errors.retry',
        });
        fireEvent.click(retryButton);
        expect(onRetry).toHaveBeenCalled();
    });
});
