/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Wave E (E2) — design-system primitive for empty states.
 *
 * Replaces the family of ad-hoc empty messages the audit identified
 * as following ≥4 different copy/layout patterns (REPORT.md C2).
 * Three slots: icon (optional), title (required), body (optional),
 * cta (optional). Three variants for the three contexts where empty
 * states appear in the admin UI:
 *
 * - `card`: bordered card with prominent icon + title + body + CTA.
 *   Use for whole-page or whole-section empty states (e.g.
 *   `<EmptyStateContract>` from Wave A wraps this).
 * - `inline`: centered, no border. Used inside an existing panel
 *   (e.g. inside an empty list card on Recruitment).
 * - `compact`: terse italic gray text. Used for inline contexts
 *   like "no matches" inside a populated table.
 */

/**
 * Discriminated union — a CTA is EITHER a route link (`to`) OR an
 * in-page action (`onClick`), never both. Prevents the `Button asChild`
 * gotcha where an `onClick` would silently be cloned onto the inner
 * `<Link>` and fire on navigation.
 */
type EmptyStateCta = { label: string; to: string } | { label: string; onClick: () => void };

interface EmptyStateProps {
    /**
     * Icon shown above the title. Optional. Skipped automatically in
     * `compact` variant.
     */
    icon?: LucideIcon;
    /** Required short headline. */
    title: string;
    /**
     * Optional one-paragraph explanation. The audit (C2) recommended
     * making `body` required; we keep it optional so the `compact`
     * variant — which is a single inline sentence — doesn't need a
     * dummy paragraph. For `card` and `inline`, supplying `body` is
     * strongly encouraged.
     */
    body?: string;
    /** Optional call-to-action. See {@link EmptyStateCta}. */
    cta?: EmptyStateCta;
    /** Visual variant — see component docstring. */
    variant?: 'card' | 'inline' | 'compact';
    /**
     * Heading level for the title. Defaults: card → 2, inline → 3.
     * Supply explicitly when nesting under an existing section heading
     * to keep the document outline correct for assistive tech.
     * Ignored on `compact` (which renders no heading at all).
     */
    headingLevel?: 2 | 3 | 4;
    className?: string;
}

export function EmptyState({
    icon: Icon,
    title,
    body,
    cta,
    variant = 'card',
    headingLevel,
    className,
}: EmptyStateProps) {
    if (variant === 'compact') {
        return (
            <p className={cn('text-sm text-slate-400 italic', className)}>
                {title}
                {body && <span className="ml-1">{body}</span>}
            </p>
        );
    }

    // Tag chosen at render so assistive tech sees the right outline level.
    const Heading = `h${headingLevel ?? (variant === 'card' ? 2 : 3)}` as 'h2' | 'h3' | 'h4';

    const containerClass =
        variant === 'card'
            ? cn(
                  'max-w-2xl rounded-2xl border border-slate-100 bg-white px-8 py-10 shadow-sm flex flex-col items-start gap-5',
                  className
              )
            : cn(
                  'flex flex-col items-center justify-center gap-4 py-10 px-4 text-center',
                  className
              );

    const iconWrapperClass =
        variant === 'card' ? 'rounded-xl bg-indigo-50 p-3' : 'rounded-full bg-slate-50 p-4';

    const iconClass = variant === 'card' ? 'size-6 text-indigo-500' : 'size-8 text-slate-300';

    const titleClass =
        variant === 'card'
            ? 'text-lg font-black text-slate-900 tracking-tight'
            : 'text-base font-bold text-slate-600';

    const bodyClass =
        variant === 'card'
            ? 'text-sm text-slate-600 leading-relaxed'
            : 'text-sm text-slate-400 max-w-xs';

    const wrapperAlign = variant === 'card' ? '' : 'items-center';

    return (
        <div className={containerClass}>
            {Icon && (
                <div className={iconWrapperClass}>
                    <Icon className={iconClass} aria-hidden="true" />
                </div>
            )}
            <div className={cn('space-y-2', wrapperAlign)}>
                <Heading className={titleClass}>{title}</Heading>
                {body && <p className={bodyClass}>{body}</p>}
            </div>
            {cta &&
                ('to' in cta ? (
                    <Button asChild className="rounded-xl">
                        <Link to={cta.to}>{cta.label}</Link>
                    </Button>
                ) : (
                    <Button onClick={cta.onClick} className="rounded-xl">
                        {cta.label}
                    </Button>
                ))}
        </div>
    );
}
