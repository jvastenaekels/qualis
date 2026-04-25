/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '../test-utils/test-utils';
import MethodologyTips from './MethodologyTips';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock('framer-motion', () => ({
    motion: {
        div: ({ children, ...props }: { children: React.ReactNode }) => (
            <div {...props}>{children}</div>
        ),
        button: ({ children, ...props }: { children: React.ReactNode }) => (
            <button {...props}>{children}</button>
        ),
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

        // Step 1 -> ... -> 6 -> 1
        act(() => {
            vi.advanceTimersByTime(6100 * 6);
        });

        expect(screen.getByText(/fine.workbench.methodology.extremes/i)).toBeInTheDocument();
    });

    it('navigates to next tip on click', () => {
        render(<MethodologyTips variant="desktop" />);
        const nextButton = screen.getByLabelText(/next tip/i);

        act(() => {
            nextButton.click();
        });

        expect(screen.getByText('fine.workbench.methodology.vertical')).toBeInTheDocument();
    });

    it('pauses rotation on interaction', () => {
        render(<MethodologyTips variant="desktop" />);
        const nextButton = screen.getByLabelText(/next tip/i);

        act(() => {
            nextButton.click();
        });

        // Should be at tip 2 now.
        expect(screen.getByText('fine.workbench.methodology.vertical')).toBeInTheDocument();

        // Advance time by normal interval (should NOT move because paused)
        act(() => {
            vi.advanceTimersByTime(6100);
        });

        // Should still be at tip 2 (rotation paused)
        expect(screen.getByText('fine.workbench.methodology.vertical')).toBeInTheDocument();
    });
});
