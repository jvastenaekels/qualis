/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
    formatDate,
    formatDateTime,
    formatRelative,
    type DateFormatOptions,
    type DateInput,
    type RelativeFormatOptions,
} from '@/lib/datetime';

export interface DateFormatters {
    /** `26 Jul 2026` */
    formatDate: (value: DateInput, options?: DateFormatOptions) => string;
    /** `26 Jul 2026, 17:25` */
    formatDateTime: (value: DateInput, options?: DateFormatOptions) => string;
    /** `2 hours ago`, falling back to `formatDate` past a week. */
    formatRelative: (value: DateInput, options?: RelativeFormatOptions) => string;
}

/**
 * `lib/datetime` bound to the active i18n language.
 *
 * Going through `useTranslation()` is what makes a language switch re-render
 * the dates — reading the `i18n` singleton directly inside a component would
 * format correctly on mount and then go stale.
 */
export function useDateFormat(): DateFormatters {
    const { i18n } = useTranslation();
    const language = i18n.language;

    return useMemo(
        () => ({
            formatDate: (value, options) => formatDate(value, language, options),
            formatDateTime: (value, options) => formatDateTime(value, language, options),
            formatRelative: (value, options) => formatRelative(value, language, options),
        }),
        [language]
    );
}
