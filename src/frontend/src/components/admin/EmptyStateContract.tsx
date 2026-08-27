/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import type { LucideIcon } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

interface EmptyStateContractProps {
    icon: LucideIcon;
    title: string;
    body: string;
    ctaLabel: string;
    ctaTo: string;
}

/**
 * Wave A — page-level empty-state contract used on Lifecycle / Data /
 * Analysis when those pages have no participant data yet.
 *
 * Wave E (E2) — now a thin wrapper over the `<EmptyState>` primitive
 * (`components/ui/empty-state.tsx`). API kept stable so existing
 * call sites don't change.
 */
export function EmptyStateContract({
    icon,
    title,
    body,
    ctaLabel,
    ctaTo,
}: EmptyStateContractProps) {
    return (
        <EmptyState
            icon={icon}
            title={title}
            body={body}
            cta={{ label: ctaLabel, to: ctaTo }}
            variant="card"
        />
    );
}
