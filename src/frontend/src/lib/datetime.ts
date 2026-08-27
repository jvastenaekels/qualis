/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Single source of truth for rendering dates and times in the admin UI.
 *
 * Before this module the app shipped four mutually inconsistent formats —
 * `1 minute ago`, `7/26/2026`, `Jul 26, 17:25` (24h) and
 * `Jul 26, 2026, 05:38 PM` (12h) — the last two on the same Analysis screen.
 * Every call site now routes through `formatDate` / `formatDateTime` /
 * `formatRelative`.
 *
 * Four decisions are load-bearing; change them here, not at a call site.
 *
 * 1. **Locale = the active i18n language, never the browser's.** A researcher
 *    who set the admin UI to French must not get US month-first dates because
 *    their laptop is `en-US`. Call sites pass `i18n.language`; `useDateFormat()`
 *    binds it for them and re-renders on a language switch.
 *
 * 2. **`en` resolves to `en-GB`, not bare `en`.** Bare `'en'` resolves to US
 *    conventions: `{day:'2-digit', month:'short', year:'numeric'}` renders
 *    `Jul 26, 2026` — month first. Every one of the other eight supported
 *    locales is day-first. The product is British-spelled throughout
 *    ("anonymised", "serialisation") and `SUPPORTED_LANGUAGES` flies 🇬🇧 for
 *    `en`, so `en-GB` is both the coherent choice and the one that makes the
 *    day-first ordering uniform across all nine languages: `26 Jul 2026`.
 *
 * 3. **24-hour clock via `hourCycle: 'h23'`, not `hour12: false`.** They are
 *    not synonyms: `hour12: false` historically resolved to hour cycle `h24`
 *    in some locales, which renders midnight as `24:00`. Modern V8/ICU has
 *    converged on `h23` for `hour12: false` (verified across all nine locales
 *    plus ja/ko/zh/da on Node 26), but `h23` states the intent and is immune
 *    to a future ICU change.
 *
 * 4. **Timezone = the runtime zone.** Backend timestamps are
 *    `DateTime(timezone=True)` columns serialised with a UTC offset, so
 *    `new Date(iso)` is unambiguous; rendering them in the viewer's own zone is
 *    what a researcher reading their own study data expects. Tests must pass an
 *    explicit `timeZone` rather than depend on the machine's `TZ`.
 *
 * No function in this module throws. These strings come off the API and land
 * inside table cells; a `RangeError` from an unparseable value would blank the
 * page, so bad input renders `INVALID_DATE_PLACEHOLDER` instead.
 */

// Deliberately `constants/languages`, not `@/i18n`: importing the latter runs
// i18next's `.init()` side effect, which a pure formatting module (and its
// unit test) has no business triggering. `SUPPORTED_LANGUAGES` is the canonical
// source per CLAUDE.md and is kept in step with `SUPPORTED_I18N_LANGUAGES` by
// an existing cross-consistency test.
import { SUPPORTED_LANGUAGES } from '@/constants/languages';

const KNOWN_LANGUAGE_CODES = new Set(SUPPORTED_LANGUAGES.map((l) => l.code));

/** Anything a call site might hand us, including what the API omits. */
export type DateInput = string | number | Date | null | undefined;

/** Rendered in place of a missing or unparseable timestamp. */
export const INVALID_DATE_PLACEHOLDER = '—';

/**
 * Beyond this many days, `formatRelative` hands over to an absolute date.
 * "3 months ago" is strictly less informative than "26 Jul 2026", and the
 * elapsed-time framing stops being useful about the point it stops being
 * countable in days.
 */
export const RELATIVE_CUTOVER_DAYS = 7;

export interface DateFormatOptions {
    /** IANA zone. Omitted = the runtime zone. Tests should pass `'UTC'`. */
    timeZone?: string;
}

export interface RelativeFormatOptions extends DateFormatOptions {
    /** Injected clock, so tests never race `Date.now()`. */
    now?: Date;
}

/**
 * Maps an i18next language to the BCP-47 tag `Intl` should use.
 *
 * i18next's `supportedLngs` allow-list normally hands us a bare code, but a
 * region-qualified detection (`en-US`, `pt-BR`) can survive, so we strip the
 * region and re-resolve. Anything unrecognised falls back to `en`, matching
 * i18next's own `fallbackLng`.
 */
export function resolveLocale(language: string | null | undefined): string {
    const base = ((language ?? '').split('-')[0] ?? '').toLowerCase();
    const known = KNOWN_LANGUAGE_CODES.has(base) ? base : 'en';
    // See decision 2 in the module docstring.
    return known === 'en' ? 'en-GB' : known;
}

/** `null` for anything we must not hand to `Intl`. */
function toDate(value: DateInput): Date | null {
    if (value === null || value === undefined || value === '') return null;
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

// Intl constructors are expensive and the Data table renders one call per row
// per render; memoise per (locale, option-set).
const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>();
const relativeFormatters = new Map<string, Intl.RelativeTimeFormat>();

function dateTimeFormatter(locale: string, options: Intl.DateTimeFormatOptions) {
    const key = `${locale}|${JSON.stringify(options)}`;
    let fmt = dateTimeFormatters.get(key);
    if (!fmt) {
        fmt = new Intl.DateTimeFormat(locale, options);
        dateTimeFormatters.set(key, fmt);
    }
    return fmt;
}

function relativeFormatter(locale: string) {
    let fmt = relativeFormatters.get(locale);
    if (!fmt) {
        fmt = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
        relativeFormatters.set(locale, fmt);
    }
    return fmt;
}

/**
 * Calendar date, no time. `26 Jul 2026` in `en`.
 */
export function formatDate(
    value: DateInput,
    language: string | null | undefined,
    options: DateFormatOptions = {}
): string {
    const date = toDate(value);
    if (!date) return INVALID_DATE_PLACEHOLDER;
    return dateTimeFormatter(resolveLocale(language), {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        ...(options.timeZone ? { timeZone: options.timeZone } : {}),
    }).format(date);
}

/**
 * Date and time to the minute, 24-hour. `26 Jul 2026, 17:25` in `en`.
 */
export function formatDateTime(
    value: DateInput,
    language: string | null | undefined,
    options: DateFormatOptions = {}
): string {
    const date = toDate(value);
    if (!date) return INVALID_DATE_PLACEHOLDER;
    return dateTimeFormatter(resolveLocale(language), {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        ...(options.timeZone ? { timeZone: options.timeZone } : {}),
    }).format(date);
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Elapsed time in words — `2 hours ago`, `il y a 2 heures` — via
 * `Intl.RelativeTimeFormat`, which carries every locale's plural rules and
 * idioms ("avant-hier", "przedwczoraj") that a hand-rolled ladder cannot.
 *
 * Past `RELATIVE_CUTOVER_DAYS` it returns `formatDate(value)` instead, so old
 * records read as dates rather than as a vague "3 months ago".
 *
 * Future timestamps (clock skew, a study end date) render forward — `in 2
 * days` — and use the same cutover.
 */
export function formatRelative(
    value: DateInput,
    language: string | null | undefined,
    options: RelativeFormatOptions = {}
): string {
    const date = toDate(value);
    if (!date) return INVALID_DATE_PLACEHOLDER;

    const now = options.now ?? new Date();
    const deltaMs = date.getTime() - now.getTime();
    const absMs = Math.abs(deltaMs);

    if (absMs >= RELATIVE_CUTOVER_DAYS * DAY_MS) {
        return formatDate(date, language, options);
    }

    const fmt = relativeFormatter(resolveLocale(language));
    if (absMs < MINUTE_MS) {
        // `numeric: 'auto'` turns 0 seconds into the locale's "now"/"maintenant".
        return fmt.format(0, 'second');
    }
    if (absMs < HOUR_MS) {
        return fmt.format(Math.trunc(deltaMs / MINUTE_MS), 'minute');
    }
    if (absMs < DAY_MS) {
        return fmt.format(Math.trunc(deltaMs / HOUR_MS), 'hour');
    }
    return fmt.format(Math.trunc(deltaMs / DAY_MS), 'day');
}
