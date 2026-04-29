import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach } from 'vitest';
import { GuidanceCard } from './GuidanceCard';

describe('GuidanceCard — Wave E persistKey', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it('persists collapsed state to localStorage when persistKey is set', async () => {
        const user = userEvent.setup();

        // First render: open by default; user collapses it
        const { unmount } = render(
            <GuidanceCard collapsible defaultOpen persistKey="test.key" title="Test guidance">
                <p>Body content</p>
            </GuidanceCard>
        );

        // Storage seeded with "open" state on mount
        expect(window.localStorage.getItem('qualis.guidance.test.key')).toBe('1');

        // Click the trigger to collapse
        await user.click(screen.getByRole('button', { name: /Test guidance/i }));
        expect(window.localStorage.getItem('qualis.guidance.test.key')).toBe('0');
        unmount();

        // Second mount: persisted "0" overrides defaultOpen=true
        render(
            <GuidanceCard collapsible defaultOpen persistKey="test.key" title="Test guidance">
                <p>Body content</p>
            </GuidanceCard>
        );
        // Trigger reflects closed state via aria-expanded
        const trigger = screen.getByRole('button', { name: /Test guidance/i });
        expect(trigger.getAttribute('data-state')).toBe('closed');
    });

    it('uses defaultOpen=false when no persisted state exists', () => {
        render(
            <GuidanceCard collapsible defaultOpen={false} persistKey="test.fresh" title="Fresh">
                <p>Hidden initially</p>
            </GuidanceCard>
        );
        const trigger = screen.getByRole('button', { name: /Fresh/i });
        expect(trigger.getAttribute('data-state')).toBe('closed');
    });
});
