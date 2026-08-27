/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { Button } from '@/components/ui/button';

interface Props {
    /** Total factors in the run (1..N). */
    nFactors: number;
    /** 1-based active factor index. */
    activeFactor: number;
    /** Called with the 1-based factor number when a chip is clicked. */
    onSelect: (factor: number) => void;
}

/**
 * Tab-like chips for selecting one factor among N. Used inside FactorCanvas
 * to switch the focused factor without leaving the page. Clicking a chip
 * fires `onSelect(k)` (1-based), which the parent typically wires to a
 * URL search-param mutation (`?focus=fk`).
 */
export function FactorSelectorChips({ nFactors, activeFactor, onSelect }: Props) {
    return (
        <div className="flex gap-2" role="tablist">
            {Array.from({ length: nFactors }, (_, i) => i + 1).map((f) => (
                <Button
                    key={f}
                    variant={f === activeFactor ? 'default' : 'outline'}
                    size="sm"
                    role="tab"
                    aria-selected={f === activeFactor}
                    onClick={() => onSelect(f)}
                >
                    F{f}
                </Button>
            ))}
        </div>
    );
}
