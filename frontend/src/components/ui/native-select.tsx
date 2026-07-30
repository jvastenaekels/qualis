/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * A styled native `<select>` — deliberately not the Radix `Select` in
 * `ui/select.tsx`.
 *
 * Both participant dropdowns are driven by a real form element: the pre-sort's
 * goes through `react-hook-form`'s `register()`, which needs the ref and the
 * native change event. Swapping in the Radix component would change the form
 * contract, not the styling.
 *
 * The UA arrow is kept. `appearance-none` without a chevron of our own is worse
 * than the default control, and adding one means owning its position at every
 * font size.
 */
const NativeSelect = React.forwardRef<
    HTMLSelectElement,
    React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
    <select
        ref={ref}
        className={cn(
            // Same tokens as SurveyField's shared field classes, plus the
            // `bg-white` whose absence was the whole defect and a real padding
            // (a bare `<select>` inherits the UA's, which is tighter than the
            // inputs beside it).
            'block w-full min-h-[44px] rounded-md border border-gray-300 bg-white p-3 text-base shadow-sm focus:border-[var(--brand-accent)] focus:ring-[var(--brand-accent)]',
            className
        )}
        {...props}
    />
));
NativeSelect.displayName = 'NativeSelect';

export { NativeSelect };
