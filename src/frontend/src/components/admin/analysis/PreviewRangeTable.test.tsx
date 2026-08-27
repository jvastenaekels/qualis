/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen } from '@/test-utils/test-utils';
import { PreviewRangeTable } from './PreviewRangeTable';
import type { PreviewRangeRow } from '@/api/model/previewRangeRow';

const ROWS: PreviewRangeRow[] = [
    {
        n_factors: 2,
        cumulative_variance: 47.0,
        pct_flagged: 0.82,
        n_distinguishing: 8,
        n_cross_loaders: 0,
        n_consensus: 3,
        min_defining_sorts: 4,
        has_empty_factor: false,
    },
    {
        n_factors: 3,
        cumulative_variance: 58.0,
        pct_flagged: 0.73,
        n_distinguishing: 14,
        n_cross_loaders: 1,
        n_consensus: 2,
        min_defining_sorts: 4,
        has_empty_factor: false,
    },
    {
        n_factors: 6,
        cumulative_variance: 71.0,
        pct_flagged: 0.4,
        n_distinguishing: 18,
        n_cross_loaders: 11,
        n_consensus: 1,
        min_defining_sorts: 0,
        has_empty_factor: true,
    },
];

describe('PreviewRangeTable', () => {
    it('renders one column per row plus the metric labels', () => {
        renderWithProviders(<PreviewRangeTable rows={ROWS} onSelect={vi.fn()} disabled={false} />);
        // n_factors values appear as column headers (button labels).
        expect(screen.getByRole('button', { name: /2 factors/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /3 factors/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /6 factors/i })).toBeInTheDocument();
        // cumvar metric label exists.
        expect(screen.getByText(/cumvar/i)).toBeInTheDocument();
    });

    it('marks rows with has_empty_factor with a warning badge', () => {
        renderWithProviders(<PreviewRangeTable rows={ROWS} onSelect={vi.fn()} disabled={false} />);
        // Only the k=6 row should carry the empty-factor warning.
        const warnings = screen.getAllByLabelText(/empty factor/i);
        expect(warnings).toHaveLength(1);
    });

    it('calls onSelect with the chosen k when a column is clicked', () => {
        const onSelect = vi.fn();
        renderWithProviders(<PreviewRangeTable rows={ROWS} onSelect={onSelect} disabled={false} />);
        fireEvent.click(screen.getByRole('button', { name: /3 factors/i }));
        expect(onSelect).toHaveBeenCalledWith(3);
    });

    it('disables interaction and shows the gate message when disabled', () => {
        renderWithProviders(<PreviewRangeTable rows={[]} onSelect={vi.fn()} disabled={true} />);
        expect(screen.getByText(/PCA \+ varimax only/i)).toBeInTheDocument();
        // No clickable column buttons.
        expect(screen.queryByRole('button', { name: /factors/i })).toBeNull();
    });

    it('renders rounded percentages for cumvar and pct_flagged', () => {
        renderWithProviders(
            <PreviewRangeTable rows={ROWS.slice(0, 1)} onSelect={vi.fn()} disabled={false} />
        );
        // 47.0 → "47", 0.82 → "82" (no % sign in the cell — the row label carries it).
        expect(screen.getByText('47')).toBeInTheDocument();
        expect(screen.getByText('82')).toBeInTheDocument();
    });
});
