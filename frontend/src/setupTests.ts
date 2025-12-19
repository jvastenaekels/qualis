/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { vi } from 'vitest';
import '@testing-library/jest-dom'; 

// Mock react-i18next globally
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ 
        t: (key: string) => key,
        i18n: {
             changeLanguage: () => new Promise(() => {}),
             language: 'en'
        }
    }),
    initReactI18next: {
        type: '3rdParty',
        init: () => {},
    },
    Trans: ({ children }: React.PropsWithChildren) => {
        return children || null;
    }
}));
// Polyfill ResizeObserver
global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
};
