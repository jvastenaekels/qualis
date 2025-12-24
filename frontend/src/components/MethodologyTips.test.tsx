/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MethodologyTips from './MethodologyTips';
import { render, screen, act } from '../test/test-utils';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key
    })
}));

vi.mock('framer-motion', () => ({
    motion: {
        div: ({ children, ...props }: { children: React.ReactNode }) => <div {...props}>{children}</div>,
        button: ({ children, ...props }: { children: React.ReactNode }) => <button {...props}>{children}</button>,
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('MethodologyTips', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders initial tip', () => {
        render(<MethodologyTips variant="desktop" />);
        expect(screen.getByText(/fine.workbench.methodology.extremes/i)).toBeInTheDocument();
    });

    it('rotates tips after interval', () => {
        render(<MethodologyTips variant="desktop" />);
        
        // Initial tip
        expect(screen.getByText(/fine.workbench.methodology.extremes/i)).toBeInTheDocument();

        // Fast-forward 6 seconds + buffer
        act(() => {
            vi.advanceTimersByTime(6100);
        });

        // Second tip
        expect(screen.getByText(/fine.workbench.methodology.vertical/i)).toBeInTheDocument();
    });

    it('loops back to first tip after reaching the end', () => {
        render(<MethodologyTips variant="desktop" />);
        
        // Step 1 -> 2 -> 3 -> 1
        act(() => {
            vi.advanceTimersByTime(6100 * 3);
        });

        expect(screen.getByText(/fine.workbench.methodology.extremes/i)).toBeInTheDocument();
    });
});
