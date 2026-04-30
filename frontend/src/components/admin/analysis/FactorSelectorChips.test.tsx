/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { fireEvent, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '@/test-utils/test-utils';
import { FactorSelectorChips } from './FactorSelectorChips';

describe('FactorSelectorChips', () => {
    it('renders one chip per factor with F-prefixed labels', () => {
        renderWithProviders(
            <FactorSelectorChips nFactors={3} activeFactor={1} onSelect={vi.fn()} />
        );
        const chips = screen.getAllByRole('tab');
        expect(chips).toHaveLength(3);
        expect(chips[0]).toHaveTextContent('F1');
        expect(chips[1]).toHaveTextContent('F2');
        expect(chips[2]).toHaveTextContent('F3');
    });

    it('marks the active chip with aria-selected=true and others false', () => {
        renderWithProviders(
            <FactorSelectorChips nFactors={3} activeFactor={2} onSelect={vi.fn()} />
        );
        const chips = screen.getAllByRole('tab');
        expect(chips[0]).toHaveAttribute('aria-selected', 'false');
        expect(chips[1]).toHaveAttribute('aria-selected', 'true');
        expect(chips[2]).toHaveAttribute('aria-selected', 'false');
    });

    it('calls onSelect with the 1-based factor number when a chip is clicked', () => {
        const onSelect = vi.fn();
        renderWithProviders(
            <FactorSelectorChips nFactors={3} activeFactor={1} onSelect={onSelect} />
        );
        fireEvent.click(screen.getAllByRole('tab')[1]!);
        expect(onSelect).toHaveBeenCalledWith(2);
    });

    it('renders a tablist wrapper for assistive technology', () => {
        renderWithProviders(
            <FactorSelectorChips nFactors={2} activeFactor={1} onSelect={vi.fn()} />
        );
        expect(screen.getByRole('tablist')).toBeInTheDocument();
    });

    it('handles nFactors=1 gracefully (single chip)', () => {
        renderWithProviders(
            <FactorSelectorChips nFactors={1} activeFactor={1} onSelect={vi.fn()} />
        );
        expect(screen.getAllByRole('tab')).toHaveLength(1);
    });

    it('renders zero chips when nFactors=0 (defensive)', () => {
        renderWithProviders(
            <FactorSelectorChips nFactors={0} activeFactor={1} onSelect={vi.fn()} />
        );
        expect(screen.queryAllByRole('tab')).toHaveLength(0);
    });
});
