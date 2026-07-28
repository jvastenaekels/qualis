/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import * as React from 'react';

import { cn } from '@/lib/utils';

/** Breathing room, in px, kept between the measured prefix's right edge and the value text. */
const PREFIX_GUTTER_PX = 12;

/**
 * Padding used before the prefix has been measured at least once. In a real
 * browser this is only ever visible for the single frame between mount and
 * the layout-effect's synchronous measurement below; it exists mainly for
 * jsdom, which never fires ResizeObserver at all. The two prior hard-coded
 * paddings this component replaces (`pl-32`, `pl-14`) are proof a guessed
 * constant is not a substitute for the real measurement.
 */
const FALLBACK_PADDING_PX = 48;

/**
 * Default look for the prefix text: matches ProjectSettingsPage/CreateProjectPage's
 * original `/app/` styling, including the vertical divider (`border-r`) that
 * separated it from the value — dropped by an earlier version of this
 * component without being called out, which this restores. Pass
 * `prefixClassName` to replace it wholesale for a differently-styled value
 * (see RecruitmentPage.tsx's call site for the monospace, divider-less case).
 */
const DEFAULT_PREFIX_CLASSES =
    'pointer-events-none absolute left-3 top-1/2 flex h-4 -translate-y-1/2 select-none items-center whitespace-nowrap border-r border-slate-300 pr-3 text-xs font-bold text-slate-400';

export interface SlugInputProps
    extends Omit<React.ComponentPropsWithoutRef<'input'>, 'value' | 'onChange' | 'prefix'> {
    /** Static, non-editable text rendered before the value, e.g. "/app/". */
    prefix: string;
    value: string;
    onChange: (value: string) => void;
    /**
     * Replaces `DEFAULT_PREFIX_CLASSES` wholesale (not merged — pass the
     * full class list) when a call site needs a differently-styled prefix,
     * e.g. to match a monospace value instead of the default sans-serif one.
     */
    prefixClassName?: string;
}

/**
 * A text input prefixed with a fixed string, whose left padding is derived
 * from the prefix's own measured position and width (ref + ResizeObserver)
 * instead of a guessed Tailwind class. The same `pl-*` guess shipped twice
 * and was wrong in both directions: `pl-32` (128px) for a ~60px "/app/"
 * prefix left a 68px gap, and `pl-14` (56px) for an exactly-56px "/study/"
 * prefix made the value collide with it. Measuring removes the guess
 * entirely.
 *
 * The prefix span is positioned `left-3` (12px in from the input's own left
 * edge) — the padding formula below measures `offsetLeft` (that 12px) *and*
 * `offsetWidth` (the prefix's rendered size), not just the latter. Adding
 * only `prefixWidth + PREFIX_GUTTER_PX` (an earlier version of this file)
 * places the value's first glyph at the prefix's *right edge*, which is the
 * same defect this component exists to remove, just shrunk from 68px too
 * much to 1px too little.
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
    ({ prefix, value, onChange, className, style, prefixClassName, ...rest }, forwardedRef) => {
        const prefixRef = React.useRef<HTMLSpanElement>(null);
        const [paddingLeft, setPaddingLeft] = React.useState<number | null>(null);

        // useLayoutEffect (not useEffect) + a synchronous measure() call
        // before the ResizeObserver is even attached: without both, the
        // first frame paints with FALLBACK_PADDING_PX and only corrects
        // itself once the observer's first (async) callback fires — a
        // visible flash from 48px to the real value.
        React.useLayoutEffect(() => {
            const node = prefixRef.current;
            if (!node) {
                return undefined;
            }

            const measure = () => {
                setPaddingLeft(node.offsetLeft + node.offsetWidth + PREFIX_GUTTER_PX);
            };
            measure();

            const observer = new ResizeObserver(measure);
            observer.observe(node);
            return () => observer.disconnect();
        }, []);

        return (
            <div className="relative">
                <span ref={prefixRef} className={prefixClassName ?? DEFAULT_PREFIX_CLASSES}>
                    {prefix}
                </span>
                <input
                    {...rest}
                    ref={forwardedRef}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    style={{ paddingLeft: paddingLeft ?? FALLBACK_PADDING_PX, ...style }}
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
