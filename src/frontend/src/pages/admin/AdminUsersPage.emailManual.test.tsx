import { describe, expect, it, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithStore } from '@/test-utils/renderWithStore';
import AdminUsersPage from './AdminUsersPage';
import { usePlatformConfigStore } from '@/store/usePlatformConfigStore';

function renderPage() {
    return renderWithStore(<AdminUsersPage />);
}

describe('AdminUsersPage — email-manual contextual note', () => {
    beforeEach(() => {
        usePlatformConfigStore.setState({ emailDelivery: 'smtp', audioStorage: 'available' });
    });

    it('is absent when email delivery is configured (smtp)', () => {
        renderPage();
        expect(screen.queryByText(/Email delivery is not configured/i)).not.toBeInTheDocument();
    });

    it('is shown when email delivery is manual', () => {
        usePlatformConfigStore.setState({ emailDelivery: 'manual', audioStorage: 'available' });
        renderPage();
        expect(screen.getByText(/Email delivery is not configured/i)).toBeInTheDocument();
    });
});
