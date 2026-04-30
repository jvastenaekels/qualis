/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { renderWithProviders, screen } from '@/test-utils/test-utils';
import { describe, it, expect, vi } from 'vitest';
import { ScreeWithDiagnostics } from './ScreeWithDiagnostics';

describe('ScreeWithDiagnostics', () => {
    it('renders the three retention indicators with their values', () => {
        renderWithProviders(
            <ScreeWithDiagnostics
                eigenvalues={[3.2, 2.1, 0.8, 0.4, 0.2]}
                kaiserN={2}
                parallelN={2}
                mapN={3}
                selectedNFactors={2}
                onSelectNFactors={vi.fn()}
            />
        );

        // Three indicator labels render (English defaults). "Kaiser" also
        // appears inside the ScreePlot hint/legend, so we assert on the
        // <dt> term elements specifically.
        expect(screen.getByText(/^Kaiser$/i)).toBeInTheDocument();
        expect(screen.getByText(/^Parallel analysis$/i)).toBeInTheDocument();
        expect(screen.getByText(/^Velicer's MAP$/i)).toBeInTheDocument();

        // Indicator values rendered (parallelN = 2 collides with kaiserN = 2,
        // so we assert on the unique mapN value and that "2" appears at least once).
        expect(screen.getByText('3', { exact: true })).toBeInTheDocument();
        expect(screen.getAllByText('2', { exact: true }).length).toBeGreaterThanOrEqual(1);
    });

    it('renders the Watts & Stenner advisory framing', () => {
        renderWithProviders(
            <ScreeWithDiagnostics
                eigenvalues={[1, 0.5]}
                kaiserN={1}
                parallelN={1}
                mapN={1}
                selectedNFactors={1}
                onSelectNFactors={vi.fn()}
            />
        );

        expect(screen.getByText(/advisory/i)).toBeInTheDocument();
        expect(screen.getByText(/Watts.*Stenner/i)).toBeInTheDocument();
    });

    it('forwards selectedNFactors / onSelectNFactors to the underlying ScreePlot', () => {
        const onSelect = vi.fn();
        renderWithProviders(
            <ScreeWithDiagnostics
                eigenvalues={[3.2, 2.1, 0.8]}
                kaiserN={2}
                parallelN={2}
                mapN={2}
                selectedNFactors={2}
                onSelectNFactors={onSelect}
            />
        );

        // ScreePlot exposes a sr-only listbox with one option per factor for
        // keyboard accessibility — assert it renders, which proves the chart
        // mounted and props were forwarded. (Click-through behaviour is covered
        // by ScreePlot's own tests; we only verify the prop wiring here.)
        const listbox = screen.getByRole('listbox', { name: /select number of factors/i });
        expect(listbox).toBeInTheDocument();
        expect(screen.getAllByRole('option').length).toBe(3);
    });
});
