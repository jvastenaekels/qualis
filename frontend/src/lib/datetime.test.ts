/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Every exact string in this file was produced by running the implementation
 * on this repo's Node/ICU, not copied from a spec. Where output is not stable
 * enough to pin (nine locales × separator × month abbreviation × ordering),
 * the assertion is on the property that matters instead.
 *
 * Every call passes `timeZone: 'UTC'`, so the suite is `TZ`-independent.
 */

import { describe, it, expect } from 'vitest';

import { SUPPORTED_LANGUAGES } from '@/constants/languages';
import {
    INVALID_DATE_PLACEHOLDER,
    RELATIVE_CUTOVER_DAYS,
    formatDate,
    formatDateTime,
    formatRelative,
    resolveLocale,
} from './datetime';

const UTC = { timeZone: 'UTC' } as const;
const REF = '2026-07-26T17:25:00Z';
const CODES = SUPPORTED_LANGUAGES.map((l) => l.code);

describe('resolveLocale', () => {
    it('maps bare `en` to en-GB so English is day-first like the other eight', () => {
        expect(resolveLocale('en')).toBe('en-GB');
    });

    it('strips a region i18next may have left on the tag', () => {
        expect(resolveLocale('en-US')).toBe('en-GB');
        expect(resolveLocale('pt-BR')).toBe('pt');
        expect(resolveLocale('FR')).toBe('fr');
    });

    it('falls back to English for unknown, empty and nullish input', () => {
        expect(resolveLocale('kl')).toBe('en-GB');
        expect(resolveLocale('')).toBe('en-GB');
        expect(resolveLocale(null)).toBe('en-GB');
        expect(resolveLocale(undefined)).toBe('en-GB');
    });

    it('passes every supported language through to a usable Intl tag', () => {
        for (const code of CODES) {
            expect(() => new Intl.DateTimeFormat(resolveLocale(code))).not.toThrow();
        }
    });
});

describe('formatDate', () => {
    // Run, not assumed: bare `'en'` yields `Jul 26, 2026` (US, month-first).
    // `26 Jul 2026` is the en-GB ordering, which is why resolveLocale maps to it.
    it('renders English day-first with an abbreviated month', () => {
        expect(formatDate(REF, 'en', UTC)).toBe('26 Jul 2026');
    });

    it('is not the browser default: `en-US` still renders day-first', () => {
        expect(formatDate(REF, 'en-US', UTC)).toBe('26 Jul 2026');
    });

    it('actually applies the locale rather than falling back to English', () => {
        expect(formatDate(REF, 'fr', UTC)).toBe('26 juil. 2026');
        expect(formatDate(REF, 'de', UTC)).toBe('26. Juli 2026');
        expect(formatDate(REF, 'fi', UTC)).toBe('26.7.2026');
        expect(formatDate(REF, 'pl', UTC)).toBe('26 lip 2026');
    });

    it('produces a distinct, non-empty rendering for every supported language', () => {
        const rendered = CODES.map((c) => formatDate(REF, c, UTC));
        for (const s of rendered) {
            expect(s).not.toBe(INVALID_DATE_PLACEHOLDER);
            // Day and year are digits in all nine; the month word is not pinned.
            expect(s).toMatch(/26/);
            expect(s).toMatch(/2026/);
        }
        // At least Finnish (numeric) and German (full month) differ from English.
        expect(new Set(rendered).size).toBeGreaterThan(1);
    });

    it('accepts Date, epoch millis and ISO strings alike', () => {
        const d = new Date(REF);
        expect(formatDate(d, 'en', UTC)).toBe('26 Jul 2026');
        expect(formatDate(d.getTime(), 'en', UTC)).toBe('26 Jul 2026');
        expect(formatDate(REF, 'en', UTC)).toBe('26 Jul 2026');
    });

    it('renders a placeholder instead of throwing on bad input', () => {
        expect(formatDate(undefined, 'en', UTC)).toBe(INVALID_DATE_PLACEHOLDER);
        expect(formatDate(null, 'en', UTC)).toBe(INVALID_DATE_PLACEHOLDER);
        expect(formatDate('', 'en', UTC)).toBe(INVALID_DATE_PLACEHOLDER);
        expect(formatDate('not-a-date', 'en', UTC)).toBe(INVALID_DATE_PLACEHOLDER);
        expect(formatDate(Number.NaN, 'en', UTC)).toBe(INVALID_DATE_PLACEHOLDER);
        expect(() => formatDate('not-a-date', 'en', UTC)).not.toThrow();
    });
});

describe('formatDateTime', () => {
    it('renders 24-hour time in English', () => {
        expect(formatDateTime(REF, 'en', UTC)).toBe('26 Jul 2026, 17:25');
    });

    it('never emits an AM/PM marker in any supported language', () => {
        for (const code of CODES) {
            const s = formatDateTime(REF, code, UTC);
            expect(s).not.toMatch(/\b[AP]\.?M\.?\b/i);
            expect(s).toMatch(/17[:.]25/);
        }
    });

    it('renders midnight as 00:00, never 24:00, in every supported language', () => {
        // `hour12: false` resolves to hour cycle h24 in some ICU builds, which
        // renders midnight as 24:00. `hourCycle: 'h23'` is why this holds.
        for (const code of CODES) {
            const s = formatDateTime('2026-07-26T00:00:00Z', code, UTC);
            expect(s).toMatch(/00[:.]00/);
            expect(s).not.toMatch(/24[:.]00/);
        }
    });

    it('renders the last minute of the day as 23:59 in every supported language', () => {
        for (const code of CODES) {
            expect(formatDateTime('2026-07-26T23:59:00Z', code, UTC)).toMatch(/23[:.]59/);
        }
    });

    it('applies the locale', () => {
        expect(formatDateTime(REF, 'fr', UTC)).toBe('26 juil. 2026, 17:25');
        expect(formatDateTime(REF, 'de', UTC)).toBe('26. Juli 2026, 17:25');
    });

    it('honours an explicit timezone rather than the runtime zone', () => {
        expect(formatDateTime(REF, 'en', { timeZone: 'UTC' })).toBe('26 Jul 2026, 17:25');
        expect(formatDateTime(REF, 'en', { timeZone: 'Asia/Tokyo' })).toBe('27 Jul 2026, 02:25');
    });

    it('renders a placeholder instead of throwing on bad input', () => {
        expect(formatDateTime(undefined, 'en', UTC)).toBe(INVALID_DATE_PLACEHOLDER);
        expect(formatDateTime('not-a-date', 'en', UTC)).toBe(INVALID_DATE_PLACEHOLDER);
    });
});

describe('formatRelative', () => {
    // The clock is injected, never `Date.now()`.
    const now = new Date('2026-07-26T12:00:00Z');
    const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
    const ahead = (ms: number) => new Date(now.getTime() + ms).toISOString();

    const MIN = 60_000;
    const HOUR = 60 * MIN;
    const DAY = 24 * HOUR;

    it('collapses anything under a minute to the locale word for "now"', () => {
        expect(formatRelative(ago(0), 'en', { now, ...UTC })).toBe('now');
        expect(formatRelative(ago(30_000), 'en', { now, ...UTC })).toBe('now');
        expect(formatRelative(ago(30_000), 'fr', { now, ...UTC })).toBe('maintenant');
    });

    it('counts minutes, hours and days', () => {
        expect(formatRelative(ago(MIN), 'en', { now, ...UTC })).toBe('1 minute ago');
        expect(formatRelative(ago(45 * MIN), 'en', { now, ...UTC })).toBe('45 minutes ago');
        expect(formatRelative(ago(3 * HOUR), 'en', { now, ...UTC })).toBe('3 hours ago');
        expect(formatRelative(ago(3 * DAY), 'en', { now, ...UTC })).toBe('3 days ago');
    });

    it('uses each locale’s own idiom, which a hand-rolled ladder could not', () => {
        expect(formatRelative(ago(3 * HOUR), 'fr', { now, ...UTC })).toBe('il y a 3 heures');
        expect(formatRelative(ago(2 * DAY), 'fr', { now, ...UTC })).toBe('avant-hier');
        expect(formatRelative(ago(2 * DAY), 'pl', { now, ...UTC })).toBe('przedwczoraj');
        expect(formatRelative(ago(3 * HOUR), 'de', { now, ...UTC })).toBe('vor 3 Stunden');
    });

    it('hands over to an absolute date at the cutover', () => {
        const justInside = formatRelative(ago(RELATIVE_CUTOVER_DAYS * DAY - MIN), 'en', {
            now,
            ...UTC,
        });
        expect(justInside).toBe('6 days ago');

        const atCutover = formatRelative(ago(RELATIVE_CUTOVER_DAYS * DAY), 'en', { now, ...UTC });
        expect(atCutover).toBe(formatDate(ago(RELATIVE_CUTOVER_DAYS * DAY), 'en', UTC));
        expect(atCutover).toBe('19 Jul 2026');

        expect(formatRelative(ago(120 * DAY), 'en', { now, ...UTC })).toBe('28 Mar 2026');
    });

    it('renders forward for future timestamps and clock skew', () => {
        expect(formatRelative(ahead(2 * HOUR), 'en', { now, ...UTC })).toBe('in 2 hours');
        // Sub-minute skew still reads as "now" rather than "in 0 seconds".
        expect(formatRelative(ahead(5_000), 'en', { now, ...UTC })).toBe('now');
        expect(formatRelative(ahead(30 * DAY), 'en', { now, ...UTC })).toBe('25 Aug 2026');
    });

    it('produces a non-placeholder rendering for every supported language', () => {
        for (const code of CODES) {
            const s = formatRelative(ago(3 * HOUR), code, { now, ...UTC });
            expect(s).not.toBe(INVALID_DATE_PLACEHOLDER);
            expect(s.length).toBeGreaterThan(0);
        }
    });

    it('renders a placeholder instead of throwing on bad input', () => {
        expect(formatRelative(undefined, 'en', { now, ...UTC })).toBe(INVALID_DATE_PLACEHOLDER);
        expect(formatRelative(null, 'en', { now, ...UTC })).toBe(INVALID_DATE_PLACEHOLDER);
        expect(formatRelative('not-a-date', 'en', { now, ...UTC })).toBe(INVALID_DATE_PLACEHOLDER);
    });
});
