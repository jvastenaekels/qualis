/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { useTranslation } from 'react-i18next';
import { Pin, X, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { AnalysisRunSummary } from '@/api/model';

interface CompareBarProps {
    /** Available runs (the run history). Excludes the current run when picking. */
    runs: AnalysisRunSummary[];
    /** The run currently displayed in interpret phase. */
    currentRunId: number;
    /** The pinned compare-to run id, or null when nothing is pinned. */
    compareTo: number | null;
    onPin: (runId: number) => void;
    onUnpin: () => void;
    /** Tucker's φ between the active factor of `currentRunId` and its matched
     *  factor in `compareTo`. Null when nothing is pinned (or no match yet). */
    phi: number | null;
}

const AMBIGUOUS_THRESHOLD = 0.85;

/**
 * Compare-pin UI for the Interpret phase. When `compareTo` is null, shows
 * a "Pin compare" dropdown listing the run history (excluding the current
 * run). When pinned, shows the pinned run id, the Tucker's φ matching the
 * active factor, and an Unpin button. Warns when |φ| < 0.85 (the spec's
 * ambiguous-match threshold).
 */
export function CompareBar({
    runs,
    currentRunId,
    compareTo,
    onPin,
    onUnpin,
    phi,
}: CompareBarProps) {
    const { t } = useTranslation();

    if (compareTo === null) {
        const pickable = runs.filter((r) => r.id !== currentRunId);
        return (
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                        <Pin className="mr-1 h-3 w-3" aria-hidden="true" />
                        {t('admin.analysis.compare.pin_cta', 'Pin compare')}
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                    {pickable.length === 0 ? (
                        <DropdownMenuItem disabled>
                            {t('admin.analysis.compare.no_other_runs', 'No other runs available')}
                        </DropdownMenuItem>
                    ) : (
                        pickable.map((r) => (
                            <DropdownMenuItem key={r.id} onClick={() => onPin(r.id)}>
                                {t(
                                    'admin.analysis.compare.run_label',
                                    'Run #{{id}} ({{n}} factors)',
                                    { id: r.id, n: r.n_factors }
                                )}
                            </DropdownMenuItem>
                        ))
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        );
    }

    const ambiguous = phi !== null && Math.abs(phi) < AMBIGUOUS_THRESHOLD;

    return (
        <div className="flex items-center gap-2 text-sm">
            <Pin className="h-3 w-3 text-slate-500" aria-hidden="true" />
            <span className="font-medium text-slate-700">
                {t('admin.analysis.compare.pinned', 'Comparing with run #{{id}}', {
                    id: compareTo,
                })}
            </span>
            {phi !== null && (
                <span
                    className={
                        ambiguous ? 'text-amber-700 flex items-center gap-1' : 'text-slate-600'
                    }
                >
                    {t('admin.analysis.compare.phi', 'φ = {{phi}}', {
                        phi: phi.toFixed(2),
                    })}
                    {ambiguous && (
                        <>
                            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                            <span>
                                {t(
                                    'admin.analysis.compare.ambiguous',
                                    'ambiguous match — interpret deltas with care'
                                )}
                            </span>
                        </>
                    )}
                </span>
            )}
            <Button
                variant="ghost"
                size="sm"
                onClick={onUnpin}
                aria-label={t('admin.analysis.compare.unpin', 'Unpin')}
            >
                <X className="h-3 w-3" aria-hidden="true" />
            </Button>
        </div>
    );
}
