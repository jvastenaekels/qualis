/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Task 6.9 — the Recent Activity row's vertical rhythm at 320px.
 *
 * Two independent instances of the same shrinking-flex mechanism, both
 * measured in a headless browser at 320/360/375/414/768/1440 × en/es/nl/pt
 * before and after the fix:
 *
 *   1. The completed row's duration ("5m 0s") was a shrinking flex item. At
 *      320px the pill took 109.05px of the 148px line, leaving 33px, and the
 *      duration broke mid-value into "5m" / "0s" — 33.22px tall. That second
 *      line, not the pill (26.16px), is what made the completed row 93.88px
 *      against the in-progress row's 77.27px. `shrink-0 whitespace-nowrap`
 *      brings it back to one line (16.61px) and the row to 86.81px.
 *   2. The in-progress row's step label carried `shrink-0` and the progress
 *      bar carried nothing, so the bar absorbed every pixel of overflow: at
 *      320px in Spanish the 48px bar rendered 7px wide. Inverting the
 *      priority — `shrink-0` on the bar, `min-w-0 truncate` on the label —
 *      holds the bar at 48px in every locale and viewport measured.
 *
 * These are class-level assertions on purpose: jsdom does no layout, so the
 * geometry above cannot be re-derived here. What the test can guard is the
 * flex contract that produced it, which is exactly what a future edit would
 * undo.
 */

import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ParticipantRead } from '@/api/model';
import RecentActivityCard from './RecentActivityCard';
import { renderWithProviders } from '@/test-utils/test-utils';

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return { ...actual, useNavigate: () => vi.fn() };
});

const now = Date.now();

const completed = {
    id: 'p-completed',
    code: 'AB12CD34',
    status: 'completed',
    created_at: new Date(now - 1000 * 60 * 35).toISOString(),
    submitted_at: new Date(now - 1000 * 60 * 30).toISOString(),
    last_step_reached_at: new Date(now - 1000 * 60 * 30).toISOString(),
    last_step_reached: 6,
    language_used: 'es',
    is_discarded: false,
} as unknown as ParticipantRead;

const started = {
    id: 'p-started',
    code: 'EF56GH78',
    status: 'started',
    created_at: new Date(now - 1000 * 60 * 12).toISOString(),
    submitted_at: null,
    last_step_reached_at: new Date(now - 1000 * 60 * 4).toISOString(),
    last_step_reached: 3,
    language_used: 'es',
    is_discarded: false,
} as unknown as ParticipantRead;

function setup() {
    return renderWithProviders(
        <RecentActivityCard
            participants={[completed, started]}
            totalParticipantCount={2}
            isMultiLang={true}
            projectSlug="proj"
            studySlug="study"
            roughSortEnabled={true}
        />
    );
}

describe('RecentActivityCard — the completed row', () => {
    it('never lets the duration break between its parts', () => {
        setup();

        const card = screen.getByTestId('recent-activity-card');
        const duration = within(card).getByText(/^\d+m \d+s$/);

        // Both halves of the contract: it must not shrink (so the pill
        // absorbs the overflow instead) and it must not wrap (so "5m 0s"
        // stays one token even if it does end up narrow).
        expect(duration).toHaveClass('shrink-0');
        expect(duration).toHaveClass('whitespace-nowrap');
    });

    it('top-aligns the duration against the pill rather than centring it', () => {
        setup();

        const card = screen.getByTestId('recent-activity-card');
        const duration = within(card).getByText(/^\d+m \d+s$/);
        const line = duration.parentElement;

        // Once the pill is two lines tall (320px, every locale; up to 375px in
        // es/pt) `items-center` floats the duration in the middle of it.
        expect(line).toHaveClass('items-start');
        expect(line).not.toHaveClass('items-center');
    });
});

describe('RecentActivityCard — the in-progress row', () => {
    it('holds the progress bar at its declared width and truncates the label instead', () => {
        setup();

        const card = screen.getByTestId('recent-activity-card');
        const bar = within(card).getByRole('progressbar');

        expect(bar).toHaveClass('w-12');
        // The bar is the one element on this line that cannot degrade
        // gracefully: at 320px in Spanish it used to render 7px wide.
        expect(bar).toHaveClass('shrink-0');
    });

    it('lets the step label shrink, which is what keeps the bar whole', () => {
        setup();

        const card = screen.getByTestId('recent-activity-card');
        const bar = within(card).getByRole('progressbar');
        const label = bar.previousElementSibling;

        expect(label).toHaveClass('min-w-0');
        expect(label).toHaveClass('truncate');
        // `shrink-0` here is the defect: it forced the whole overflow onto the
        // bar.
        expect(label).not.toHaveClass('shrink-0');
    });
});
