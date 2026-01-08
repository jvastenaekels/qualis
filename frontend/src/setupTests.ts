/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

import { vi } from 'vitest';
import { useConfigStore } from './store/useConfigStore';
import { useResponseStore } from './store/useResponseStore';
import { useSessionStore } from './store/useSessionStore';
import { useUIStore } from './store/useUIStore';
import { server } from './test-utils/server';
// Mock react-i18next globally
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: {
            changeLanguage: () => new Promise(() => {}),
            language: 'en',
            addResourceBundle: vi.fn(),
        },
    }),
    initReactI18next: {
        type: '3rdParty',
        init: () => {},
    },
    Trans: ({ children }: React.PropsWithChildren) => {
        return children || null;
    },
}));

// Mock local i18n module
vi.mock('./i18n', () => ({
    default: {
        changeLanguage: vi.fn(),
        language: 'en',
        addResourceBundle: vi.fn(),
        init: vi.fn().mockReturnValue(Promise.resolve()),
        use: vi.fn().mockReturnThis(),
    },
    t: (key: string) => key,
}));

// Polyfill ResizeObserver
vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    }
);

// Polyfill matchMedia
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    }),
});

// Polyfill scrollTo
window.scrollTo = vi.fn();
window.confirm = vi.fn();

// MSW Server Setup
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => {
    server.resetHandlers();
    // Reset Zustand stores
    useConfigStore.getState().resetConfig();
    useResponseStore.getState().resetResponses();
    useSessionStore.getState().resetSession();
    useUIStore.getState().setHoveredCard(null);
});
afterAll(() => server.close());

// Mock react-router-dom's useLoaderData globally
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useLoaderData: vi.fn().mockReturnValue({}),
    };
});
