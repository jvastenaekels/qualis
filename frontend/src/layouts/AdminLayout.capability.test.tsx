import { describe, expect, it, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithStore } from '@/test-utils/renderWithStore';
import { Routes, Route } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { usePlatformConfigStore } from '@/store/usePlatformConfigStore';

// renderWithStore already wraps children in a MemoryRouter; drive the route
// via its initialEntries rather than nesting a second Router.
function renderLayout() {
    return renderWithStore(
        <Routes>
            <Route path="/app" element={<AdminLayout />} />
        </Routes>,
        { initialEntries: ['/app'] },
    );
}

describe('AdminLayout capability banners', () => {
    beforeEach(() => {
        localStorage.clear();
        usePlatformConfigStore.setState({ emailDelivery: 'smtp', audioStorage: 'available' });
    });

    it('renders no capability banner when nothing is degraded', () => {
        renderLayout();
        expect(screen.queryByText(/Email delivery is not configured/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Object storage is not configured/)).not.toBeInTheDocument();
    });

    it('renders both rows when SMTP manual and S3 unavailable', () => {
        usePlatformConfigStore.setState({ emailDelivery: 'manual', audioStorage: 'unavailable' });
        renderLayout();
        expect(screen.getByText(/Email delivery is not configured/)).toBeInTheDocument();
        expect(screen.getByText(/Object storage is not configured/)).toBeInTheDocument();
    });
});
