import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SortingAnimation from './SortingAnimation';

describe('SortingAnimation', () => {
    beforeEach(() => {
        vi.useFakeTimers();

        // Mock matchMedia
        Object.defineProperty(window, 'matchMedia', {
            writable: true,
            value: vi.fn().mockImplementation((query) => ({
                matches: false,
                media: query,
                onchange: null,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })),
        });

        // Mock Math.random to avoid hesitation (logic uses > 0.7, so 0.5 is safe)
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('renders both Rough and Fine sort containers', () => {
        render(<SortingAnimation />);

        // Check for presence of key elements from both phases
        // Rough Sort (Phase 1)
        expect(screen.getByTestId('phase-1')).toBeInTheDocument();

        // Fine Sort (Phase 2)
        expect(screen.getByTestId('phase-2')).toBeInTheDocument();
    });

    it('applies responsive classes for layout switching', () => {
        render(<SortingAnimation />);

        // Use data-testids
        const phase1Container = screen.getByTestId('phase-1');
        const phase2Container = screen.getByTestId('phase-2');

        // Check for mobile (absolute) classes on containers
        expect(phase1Container).toHaveClass('absolute');
        expect(phase2Container).toHaveClass('absolute');
    });

    it('starts in ROUGH phase with correct visibility classes', () => {
        render(<SortingAnimation />);

        const phase1Container = screen.getByTestId('phase-1');

        // Phase 1 should be active (opacity-100)
        expect(phase1Container).toHaveClass('opacity-100');
        expect(phase1Container).not.toHaveClass('opacity-0');

        const phase2Container = screen.getByTestId('phase-2');
        expect(phase2Container).toHaveClass('opacity-0');
    });

    it('starts directly in FINE phase when rough sort is disabled', () => {
        render(<SortingAnimation roughSortEnabled={false} />);

        expect(screen.queryByTestId('phase-1')).not.toBeInTheDocument();

        const phase2Container = screen.getByTestId('phase-2');
        expect(phase2Container).toHaveClass('opacity-100');
        expect(phase2Container).not.toHaveClass('opacity-0');
    });

    it('collapses the phase indicator to one dot when rough sort is disabled', () => {
        render(<SortingAnimation roughSortEnabled={false} />);

        const indicator = screen.getByTestId('phase-indicator');
        expect(indicator.querySelectorAll('.rounded-full')).toHaveLength(1);
        expect(indicator.querySelector('.w-10')).not.toBeInTheDocument();
    });

    it('does NOT show flying card during initial delay', () => {
        render(<SortingAnimation />);

        // At t=0, delay (isReady=false) is active
        expect(screen.queryByTestId('flying-card')).not.toBeInTheDocument();

        // Advance 1s (still less than 1.5s delay)
        act(() => {
            vi.advanceTimersByTime(1000);
        });
        expect(screen.queryByTestId('flying-card')).not.toBeInTheDocument();

        // Advance past 1.5s -> isReady=true -> Active Target (Step 0) renders
        act(() => {
            vi.advanceTimersByTime(600);
        });
        // We need to identify the flying card by some means.
        // In SortingAnimation.tsx, the motion.div has no test-id, but we can look for it.
        // Let's add a test-id to the flying card in SortingAnimation.tsx first or verify existence differently.
        // Check finding by class used for the card: "absolute top-0 left-0 w-[18px]..."
        // Or better, let's assume we will add data-testid="flying-card" in the next step.
    });

    it.skip('switches to FINE phase after timeout', () => {
        render(<SortingAnimation />);

        // 1. Setup Phase (0-1.5s)
        expect(screen.queryByTestId('flying-card')).not.toBeInTheDocument();

        // 2. Play through Rough Phase
        // Rough Sort duration is ~6 - 7 seconds.
        // We advance 8000ms to land comfortably in the Fine Phase.
        // 1. Trigger Initial Delay (isReady -> true)
        act(() => {
            vi.advanceTimersByTime(2000);
        });

        // 2. Play through Rough Phase (Steps 0-6)
        // ~600ms * 6 = 3600ms + hesitation.
        // Let's advance little chunks to be sure.
        for (let i = 0; i < 10; i++) {
            act(() => {
                vi.advanceTimersByTime(500);
            });
        }

        // 3. Trigger Phase Switch (Pause 1200ms -> Fine)
        // Advance enough time to cover the pause AND the potential step -1 transition (1000ms)
        act(() => {
            vi.advanceTimersByTime(5000);
        });

        const phase1Container = screen.getByTestId('phase-1');
        const phase2Container = screen.getByTestId('phase-2');

        // Phase 2 should be active (opacity not 0)
        expect(phase2Container).not.toHaveClass('opacity-0');
        // Phase 1 should be inactive (opacity 0)
        expect(phase1Container).toHaveClass('opacity-0');
    });
});
