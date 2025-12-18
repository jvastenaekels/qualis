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
