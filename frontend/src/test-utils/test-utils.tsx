/* eslint-disable react-refresh/only-export-components */
/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { type RenderOptions, render } from '@testing-library/react';
import type React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { LayoutProvider } from '../contexts/LayoutContext';
import { useConfigStore } from '../store/useConfigStore';
import { useResponseStore } from '../store/useResponseStore';
import { useSessionStore } from '../store/useSessionStore';
import { useUIStore } from '../store/useUIStore';
import { I18nextProvider } from 'react-i18next';
import i18n from './i18n-test';
import { ViewportProvider } from '@/contexts/ViewportContext';

/**
 * Custom render helper that wraps components with common providers.
 */
interface AllTheProvidersProps {
    children: React.ReactNode;
    initialEntries?: string[];
}

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const createTestQueryClient = () =>
    new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
            },
        },
    });

import testResources from './i18n-test-resources';

export const AllTheProviders: React.FC<AllTheProvidersProps> = ({
    children,
    initialEntries = ['/'],
}) => {
    const queryClient = createTestQueryClient();

    // Defensive: Ensure i18n resources are loaded (they can get cleared between tests)
    if (
        !i18n.hasResourceBundle('en', 'translation') ||
        Object.keys(i18n.store.data.en?.translation || {}).length === 0
    ) {
        // Resources got cleared, re-add them
        i18n.addResourceBundle('en', 'translation', testResources, true, true);
    }

    return (
        <QueryClientProvider client={queryClient}>
            <I18nextProvider i18n={i18n}>
                <ViewportProvider>
                    <MemoryRouter initialEntries={initialEntries}>
                        <LayoutProvider>{children}</LayoutProvider>
                    </MemoryRouter>
                </ViewportProvider>
            </I18nextProvider>
        </QueryClientProvider>
    );
};

const renderWithProviders = (
    ui: React.ReactElement,
    options?: Omit<RenderOptions, 'wrapper'> & { initialEntries?: string[] }
) => {
    const { initialEntries, ...renderOptions } = options || {};
    return render(ui, {
        wrapper: ({ children }) => (
            <AllTheProviders initialEntries={initialEntries}>{children}</AllTheProviders>
        ),
        ...renderOptions,
    });
};

/**
 * Type-safe store mocking helper.
 */
type MockableStore = {
    mockImplementation: (fn: (selector: (state: unknown) => unknown) => unknown) => void;
};

export const setupStoreMocks = (mocks: {
    useConfigStore?: unknown;
    useSessionStore?: unknown;
    useResponseStore?: unknown;
    useUIStore?: unknown;
}) => {
    if (mocks.useConfigStore) {
        (useConfigStore as unknown as MockableStore).mockImplementation((selector) =>
            selector ? selector(mocks.useConfigStore) : mocks.useConfigStore
        );
    }
    if (mocks.useSessionStore) {
        (useSessionStore as unknown as MockableStore).mockImplementation((selector) =>
            selector ? selector(mocks.useSessionStore) : mocks.useSessionStore
        );
    }
    if (mocks.useResponseStore) {
        (useResponseStore as unknown as MockableStore).mockImplementation((selector) =>
            selector ? selector(mocks.useResponseStore) : mocks.useResponseStore
        );
    }
    if (mocks.useUIStore) {
        (useUIStore as unknown as MockableStore).mockImplementation((selector) =>
            selector ? selector(mocks.useUIStore) : mocks.useUIStore
        );
    }
};

export * from '@testing-library/react';
export { renderWithProviders };
