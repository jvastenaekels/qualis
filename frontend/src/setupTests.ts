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
import { useStudyDesigner } from './store/useStudyDesigner';
import { server } from './test-utils/server';
// Initialize i18n for tests (side effect - this sets up the singleton)
import './test-utils/i18n-test';

// Mock the app's i18n module to prevent the real i18n.ts from running
// This is crucial because i18n.ts uses HttpBackend which fails in tests
vi.mock('./i18n', async () => {
    // This runs lazily when ./i18n is first imported
    const testI18n = await import('./test-utils/i18n-test');
    return { default: testI18n.default };
});

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
    // Reset StudyDesigner store
    useStudyDesigner.setState({
        draft: null,
        original: null,
        activeStep: 'intro',
        activeSubStep: 'statements',
        activeLocale: 'en',
        syncStatus: 'synced',
        lastSavedAt: null,
    });
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
