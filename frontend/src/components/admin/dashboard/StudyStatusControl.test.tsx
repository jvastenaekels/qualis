/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Task 6.7d: StudyStatusControl's clickable status-step tile used to be a
 * hand-rolled `<div role="button" tabIndex={0}>` with NO onKeyDown at all —
 * focusable, but pressing Enter/Space did nothing (the div's role="button"
 * doesn't get native Enter/Space-to-click translation from the browser; that
 * only happens for real interactive elements or JS-implemented handlers,
 * neither of which existed here). Converted to a native <button> (Radix's
 * AlertDialogTrigger asChild clones it, same as every other trigger in this
 * codebase), which gets the translation for free — restoring, not just
 * preserving, keyboard operability. Verified the same way
 * AdminDashboard.test.tsx verifies its own div-to-button conversions: focus
 * the tile, press Enter, assert the dialog opens.
 */

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import StudyStatusControl from './StudyStatusControl';
import { renderWithProviders } from '@/test-utils/test-utils';

const { mockChangeStateMutation } = vi.hoisted(() => ({
    mockChangeStateMutation: vi.fn(),
}));

vi.mock('@/api/generated', () => ({
    useChangeStudyStateApiAdminStudiesSlugStatePost: mockChangeStateMutation,
    getListStudiesApiAdminStudiesGetQueryKey: () => ['studies'],
    getGetStudyApiAdminStudiesSlugGetQueryKey: (slug: string) => ['study', slug],
}));

vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}));

function setup() {
    mockChangeStateMutation.mockReturnValue({
        mutateAsync: vi.fn().mockResolvedValue(undefined),
        isPending: false,
    });
    return renderWithProviders(
        <StudyStatusControl slug="demo-study" currentState="draft" onStateChange={vi.fn()} />
    );
}

describe('StudyStatusControl — the reachable step tile is a real, keyboard-operable button', () => {
    it('exposes a clickable step as a native <button>, not an ARIA-only div', () => {
        setup();

        // From "draft", only "active" is a reachable transition
        // (isTransitionAllowed) — that tile is the one under test.
        const tile = screen.getByRole('button', { name: /active/i });
        expect(tile.tagName).toBe('BUTTON');
        expect(tile).not.toHaveAttribute('role');
        expect(tile).not.toHaveAttribute('tabindex');
    });

    it('opens the confirmation dialog on Enter while focused (was previously inert)', async () => {
        const user = userEvent.setup();
        setup();

        const tile = screen.getByRole('button', { name: /active/i });
        expect(screen.queryByText(/launch study\?/i)).not.toBeInTheDocument();

        tile.focus();
        expect(tile).toHaveFocus();
        await user.keyboard('{Enter}');

        expect(await screen.findByText(/launch study\?/i)).toBeInTheDocument();
    });

    it('leaves an unreachable step as plain, non-interactive content', () => {
        setup();

        // From "draft", "closed" is not a reachable transition — it must not
        // register as a button at all (no dead/duplicate tab stop).
        expect(screen.queryByRole('button', { name: /^closed$/i })).not.toBeInTheDocument();
    });
});
