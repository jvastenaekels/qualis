/* eslint-disable react-refresh/only-export-components */
/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import React from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LayoutProvider } from '../contexts/LayoutContext';
import { useConfigStore } from '../store/useConfigStore';
import { useSessionStore } from '../store/useSessionStore';
import { useResponseStore } from '../store/useResponseStore';
import { useUIStore } from '../store/useUIStore';

/**
 * Custom render helper that wraps components with common providers.
 */
interface AllTheProvidersProps {
    children: React.ReactNode;
    initialEntries?: string[];
}

const AllTheProviders: React.FC<AllTheProvidersProps> = ({ children, initialEntries = ['/'] }) => {
    return (
        <MemoryRouter initialEntries={initialEntries}>
            <LayoutProvider>
                {children}
            </LayoutProvider>
        </MemoryRouter>
    );
};

const renderWithProviders = (
    ui: React.ReactElement,
    options?: Omit<RenderOptions, 'wrapper'> & { initialEntries?: string[] }
) => {
    const { initialEntries, ...renderOptions } = options || {};
    return render(ui, {
        wrapper: ({ children }) => <AllTheProviders initialEntries={initialEntries}>{children}</AllTheProviders>,
        ...renderOptions,
    });
};

/**
 * Type-safe store mocking helper.
 */
type MockableStore = {
    mockImplementation: (fn: (selector: (state: any) => any) => any) => void;
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
