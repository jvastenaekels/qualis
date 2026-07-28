/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import * as React from 'react';

import { cn } from '@/lib/utils';

/** Breathing room, in px, kept between the measured prefix and the value text. */
const PREFIX_GUTTER_PX = 12;

/**
 * Padding used before the prefix has been measured at least once (first
 * paint, or an environment — like jsdom — that never fires ResizeObserver).
 * It only ever shows up as a brief flash in real browsers; the two prior
 * hard-coded paddings this component replaces (`pl-32`, `pl-14`) are proof
 * a guessed constant is not a substitute for the real measurement below.
 */
const FALLBACK_PADDING_PX = 48;

export interface SlugInputProps
    extends Omit<React.ComponentPropsWithoutRef<'input'>, 'value' | 'onChange' | 'prefix'> {
    /** Static, non-editable text rendered before the value, e.g. "/app/". */
    prefix: string;
    value: string;
    onChange: (value: string) => void;
}

/**
 * A text input prefixed with a fixed string, whose left padding is derived
 * from the prefix's own measured width (ref + ResizeObserver) instead of a
 * guessed Tailwind class. The same `pl-*` guess shipped twice and was wrong
 * in both directions: `pl-32` (128px) for a ~60px "/app/" prefix left a 68px
 * gap, and `pl-14` (56px) for an exactly-56px "/study/" prefix made the
 * value collide with it. Measuring removes the guess entirely.
 *
 * Forwards ref, id, and any other native input props to the underlying
 * `<input>` (not the decorative wrapper) so it composes correctly inside
 * `FormControl` — whose Radix `Slot` clones id/aria-describedby/aria-invalid
 * onto this component's single child and expects them to land on the real
 * control, not a `<div>` (see RecruitmentPage.tsx's task 6.7e comment for
 * the a11y bug that pattern otherwise causes: FormLabel's `htmlFor` pointing
 * at a non-labelable element).
 */
const SlugInput = React.forwardRef<HTMLInputElement, SlugInputProps>(
    ({ prefix, value, onChange, className, style, ...rest }, forwardedRef) => {
        const prefixRef = React.useRef<HTMLSpanElement>(null);
        const [prefixWidth, setPrefixWidth] = React.useState<number | null>(null);

        React.useEffect(() => {
            const node = prefixRef.current;
            if (!node) {
                return undefined;
            }

            const observer = new ResizeObserver((entries) => {
                const measured = entries[0]?.contentRect.width;
                if (typeof measured === 'number') {
                    setPrefixWidth(measured);
                }
            });
            observer.observe(node);
            return () => observer.disconnect();
        }, []);

        const paddingLeft =
            prefixWidth === null ? FALLBACK_PADDING_PX : prefixWidth + PREFIX_GUTTER_PX;

        return (
            <div className="relative">
                <span
                    ref={prefixRef}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 select-none whitespace-nowrap text-xs font-bold text-slate-400"
                >
                    {prefix}
                </span>
                <input
                    {...rest}
                    ref={forwardedRef}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    style={{ paddingLeft, ...style }}
                    className={cn(
                        'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
                        className
                    )}
                />
            </div>
        );
    }
);
SlugInput.displayName = 'SlugInput';

export { SlugInput };
