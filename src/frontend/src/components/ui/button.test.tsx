/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './button';

// Vitest's root is `frontend/`; jsdom rewrites import.meta.url to an http URL,
// so cwd is the only reliable anchor here.
const SRC = join(process.cwd(), 'src');

describe('Button variants', () => {
    it('renders the default variant with the single primary fill', () => {
        render(<Button>Go</Button>);
        expect(screen.getByRole('button')).toHaveClass('bg-indigo-600');
    });

    it('darkens rather than lightens on hover', () => {
        render(<Button>Go</Button>);
        expect(screen.getByRole('button')).toHaveClass('hover:bg-indigo-700');
    });

    it('gives the warning variant an AA-passing amber (amber-500 + white is 2.15:1)', () => {
        render(<Button variant="warning">Unlock</Button>);
        const btn = screen.getByRole('button');
        expect(btn).toHaveClass('bg-amber-600');
        expect(btn).toHaveClass('text-slate-900');
        // Resting white-on-amber is the failure mode; hover:text-white is fine
        // because the hover fill darkens to amber-700 (5.02:1).
        expect(btn.className).not.toMatch(/(?:^|\s)text-white(?:\s|$)/);
    });
});

/**
 * Task 4.1 guard. The defect this task fixed lived at the CALL SITES, not in
 * the variant: four primary fills coexisted across the admin because pages
 * hand-wrote `bg-indigo-600` / `bg-slate-900` / `bg-emerald-600` on `<Button>`
 * instead of letting the default variant supply the fill.
 *
 * This budget test fails when a new RESTING primary-looking fill appears in
 * `pages/admin` or `components/admin`. The allowlist below is the exhaustive
 * set of remaining occurrences, every one of which is deliberately NOT a
 * button. Adding a fill to a button raises a count and trips the test; the
 * fix is to delete the class, not to bump the number.
 *
 * Anchoring note: the token regex rejects any match preceded by a word char,
 * `:`, `/` or `-`, so state prefixes (`hover:bg-*`, `active:bg-*`,
 * `group-hover/bar:bg-*`, `data-[state=active]:bg-*`) are not counted, and
 * `disabled:opacity-50` cannot false-positive.
 */
const RESTING_FILL = /(?<![\w:/-])bg-(?:indigo-600|slate-900|emerald-600|amber-500)(?![\w-])/g;

/** file (relative to src/) -> number of allowed resting fills, with the reason. */
const ALLOWED: Record<string, { count: number; reason: string }> = {
    'components/admin/ProjectSwitcher.tsx': {
        count: 1,
        reason: 'selected-project icon tile, not a button fill',
    },
    'components/admin/UserAvatar.tsx': {
        count: 1,
        reason: 'avatar background',
    },
    'components/admin/designer/QSortEditor.tsx': {
        count: 3,
        reason: 'hover tooltip surface + invalid-grid status dot + status medallion',
    },
    'pages/admin/ConcourseDetailPage.tsx': {
        count: 2,
        reason: 'two count badges pinned to a tab',
    },
    'pages/admin/RecruitmentPage.tsx': {
        count: 1,
        reason: 'at-capacity segment of the usage progress bar',
    },
};

function walk(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) walk(p, acc);
        else if (p.endsWith('.tsx') && !p.endsWith('.test.tsx')) acc.push(p);
    }
    return acc;
}

describe('admin primary fill budget', () => {
    it('has no ad-hoc resting primary fill beyond the documented non-button sites', () => {
        const files = [join(SRC, 'pages', 'admin'), join(SRC, 'components', 'admin')].flatMap((d) =>
            walk(d)
        );
        const offenders: string[] = [];
        for (const file of files) {
            const rel = file.slice(SRC.length + 1);
            const found = readFileSync(file, 'utf8').match(RESTING_FILL) ?? [];
            const budget = ALLOWED[rel]?.count ?? 0;
            if (found.length > budget) {
                offenders.push(`${rel}: ${found.length} resting fill(s), budget ${budget}`);
            }
        }
        expect(offenders).toEqual([]);
    });

    it('keeps the allowlist honest — no stale entry', () => {
        const stale = Object.keys(ALLOWED).filter((rel) => {
            const found = readFileSync(join(SRC, rel), 'utf8').match(RESTING_FILL) ?? [];
            return found.length !== ALLOWED[rel].count;
        });
        expect(stale).toEqual([]);
    });
});
