import { act, screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConfigStore } from '../store/useConfigStore';
import { useResponseStore } from '../store/useResponseStore';
import { useSessionStore } from '../store/useSessionStore';
import { renderWithProviders } from '../test-utils/test-utils';
import ResetPage from './ResetPage';

// Mock Stores
vi.mock('../store/useSessionStore');
vi.mock('../store/useConfigStore');
vi.mock('../store/useResponseStore');

const mockResetSession = vi.fn();
const mockResetConfig = vi.fn();
const mockResetResponses = vi.fn();

vi.mocked(useSessionStore).getState = vi.fn(() => ({
    resetSession: mockResetSession,
})) as any;
vi.mocked(useConfigStore).getState = vi.fn(() => ({
    resetConfig: mockResetConfig,
})) as any;
vi.mocked(useResponseStore).getState = vi.fn(() => ({
    resetResponses: mockResetResponses,
})) as any;

describe('ResetPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('Resets all stores and redirects after delay', async () => {
        renderWithProviders(
            <Routes>
                <Route path="/study/:slug/reset" element={<ResetPage />} />
                <Route path="/study/:slug/welcome" element={<div>Welcome Page</div>} />
            </Routes>,
            { initialEntries: ['/study/test-study/reset'] }
        );

        // Expect loading spinner
        expect(screen.getByText('Resetting study session...')).toBeInTheDocument();

        // Verify Resets called immediately
        expect(mockResetSession).toHaveBeenCalled();
        expect(mockResetConfig).toHaveBeenCalled();
        expect(mockResetResponses).toHaveBeenCalled();

        // Fast-forward timer (500ms)
        act(() => {
            vi.advanceTimersByTime(500);
        });

        // Verify Redirect
        expect(screen.getByText('Welcome Page')).toBeInTheDocument();
    });
});
