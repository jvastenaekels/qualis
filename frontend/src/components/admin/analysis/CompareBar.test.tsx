/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '@/test-utils/test-utils';
import { CompareBar } from './CompareBar';
import type { AnalysisRunSummary } from '@/api/model';

const RUNS: AnalysisRunSummary[] = [
    {
        id: 38,
        ran_at: '2026-04-29T10:00:00Z',
        n_factors: 3,
        extraction_method: 'pca',
        rotation_method: 'varimax',
        flagging_mode: 'auto',
    } as unknown as AnalysisRunSummary,
    {
        id: 42,
        ran_at: '2026-04-30T10:00:00Z',
        n_factors: 3,
        extraction_method: 'pca',
        rotation_method: 'varimax',
        flagging_mode: 'auto',
    } as unknown as AnalysisRunSummary,
];

describe('CompareBar', () => {
    it('renders the Pin button when nothing is pinned', () => {
        renderWithProviders(
            <CompareBar
                runs={RUNS}
                currentRunId={42}
                compareTo={null}
                onPin={vi.fn()}
                onUnpin={vi.fn()}
                phi={null}
            />
        );
        expect(screen.getByRole('button', { name: /pin compare/i })).toBeInTheDocument();
    });

    it('opening the picker lists runs except the current one', async () => {
        renderWithProviders(
            <CompareBar
                runs={RUNS}
                currentRunId={42}
                compareTo={null}
                onPin={vi.fn()}
                onUnpin={vi.fn()}
                phi={null}
            />
        );
        await userEvent.click(screen.getByRole('button', { name: /pin compare/i }));
        // Run #38 is offered, run #42 (current) is not.
        const items = await screen.findAllByRole('menuitem');
        expect(items.length).toBe(1);
        expect(items[0]).toHaveTextContent(/Run #38/);
    });

    it('clicking a picker item calls onPin with the chosen run id', async () => {
        const onPin = vi.fn();
        renderWithProviders(
            <CompareBar
                runs={RUNS}
                currentRunId={42}
                compareTo={null}
                onPin={onPin}
                onUnpin={vi.fn()}
                phi={null}
            />
        );
        await userEvent.click(screen.getByRole('button', { name: /pin compare/i }));
        const item = await screen.findByRole('menuitem');
        await userEvent.click(item);
        expect(onPin).toHaveBeenCalledWith(38);
    });

    it('shows pinned run id, φ, and Unpin button when compareTo is set', () => {
        renderWithProviders(
            <CompareBar
                runs={RUNS}
                currentRunId={42}
                compareTo={38}
                onPin={vi.fn()}
                onUnpin={vi.fn()}
                phi={0.92}
            />
        );
        expect(screen.getByText(/run #38/i)).toBeInTheDocument();
        expect(screen.getByText(/0\.92/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /unpin/i })).toBeInTheDocument();
    });

    it('clicking Unpin calls onUnpin', () => {
        const onUnpin = vi.fn();
        renderWithProviders(
            <CompareBar
                runs={RUNS}
                currentRunId={42}
                compareTo={38}
                onPin={vi.fn()}
                onUnpin={onUnpin}
                phi={0.92}
            />
        );
        fireEvent.click(screen.getByRole('button', { name: /unpin/i }));
        expect(onUnpin).toHaveBeenCalledTimes(1);
    });

    it('warns on |φ| < 0.85', () => {
        renderWithProviders(
            <CompareBar
                runs={RUNS}
                currentRunId={42}
                compareTo={38}
                onPin={vi.fn()}
                onUnpin={vi.fn()}
                phi={0.78}
            />
        );
        expect(screen.getByText(/ambiguous match/i)).toBeInTheDocument();
    });

    it('does not warn on |φ| >= 0.85', () => {
        renderWithProviders(
            <CompareBar
                runs={RUNS}
                currentRunId={42}
                compareTo={38}
                onPin={vi.fn()}
                onUnpin={vi.fn()}
                phi={0.85}
            />
        );
        expect(screen.queryByText(/ambiguous match/i)).toBeNull();
    });

    it('warns on negative φ below threshold (sign-flipped weak match)', () => {
        renderWithProviders(
            <CompareBar
                runs={RUNS}
                currentRunId={42}
                compareTo={38}
                onPin={vi.fn()}
                onUnpin={vi.fn()}
                phi={-0.5}
            />
        );
        expect(screen.getByText(/ambiguous match/i)).toBeInTheDocument();
    });

    it('handles phi=null when pinned (still loading) without crashing', () => {
        renderWithProviders(
            <CompareBar
                runs={RUNS}
                currentRunId={42}
                compareTo={38}
                onPin={vi.fn()}
                onUnpin={vi.fn()}
                phi={null}
            />
        );
        // Pinned label visible but φ display absent.
        expect(screen.getByText(/run #38/i)).toBeInTheDocument();
        expect(screen.queryByText(/φ/)).toBeNull();
    });
});
