import { act, screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test-utils/test-utils';
import ResetPage from './ResetPage';

const mockResetAllStores = vi.fn();

vi.mock('../utils/sessionReset', () => ({
    resetAllStores: (...args: unknown[]) => mockResetAllStores(...args),
}));

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

        // Expect loading spinner — i18n key is `landing.resetting_session`,
        // its English fallback uses an ellipsis character.
        expect(screen.getByText(/Resetting study session/i)).toBeInTheDocument();

        // Verify resetAllStores called immediately
        expect(mockResetAllStores).toHaveBeenCalled();

        // Fast-forward timer (500ms)
        act(() => {
            vi.advanceTimersByTime(500);
        });

        // Verify Redirect
        expect(screen.getByText('Welcome Page')).toBeInTheDocument();
    });
});
