import { beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test-utils/test-utils';
import AdminLayout from './AdminLayout';
import { usePlatformConfigStore } from '@/store/usePlatformConfigStore';

describe('AdminLayout SMTP banner', () => {
    beforeEach(() => {
        usePlatformConfigStore.setState({ emailDelivery: 'smtp' });
    });

    it('does not render the banner in smtp mode', () => {
        usePlatformConfigStore.setState({ emailDelivery: 'smtp' });
        renderWithProviders(
            <Routes>
                <Route path="/app" element={<AdminLayout />}>
                    <Route index element={<div>child</div>} />
                </Route>
            </Routes>,
            { initialEntries: ['/app'] }
        );
        expect(screen.queryByText(/Email delivery not configured/i)).not.toBeInTheDocument();
    });

    it('renders the banner in manual mode', () => {
        usePlatformConfigStore.setState({ emailDelivery: 'manual' });
        renderWithProviders(
            <Routes>
                <Route path="/app" element={<AdminLayout />}>
                    <Route index element={<div>child</div>} />
                </Route>
            </Routes>,
            { initialEntries: ['/app'] }
        );
        expect(screen.getByText(/Email delivery not configured/i)).toBeInTheDocument();
    });
});
