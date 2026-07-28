/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SlugInput } from './slug-input';

/**
 * jsdom never computes real layout — every element's getBoundingClientRect(),
 * offsetLeft and offsetWidth report 0, and jsdom's global ResizeObserver
 * polyfill (src/setupTests.ts) is a no-op that never invokes its callback.
 * So no test in this file can observe genuine pixel geometry; a hard-coded
 * `pl-32` would satisfy a naive "gap >= 8" assertion here just as well as a
 * real measurement does. To actually prove the padding is *derived from*
 * the prefix's measured position and width — not a constant — this file
 * replaces the global ResizeObserver with a controllable mock, and stubs
 * `offsetLeft`/`offsetWidth` on the specific prefix node under test, so a
 * test can set an arbitrary measured geometry and check the component's
 * padding tracks it.
 */

type ROCallback = ConstructorParameters<typeof ResizeObserver>[0];

let observedNodes: Element[];
let observedCallbacks: ROCallback[];

class ControllableResizeObserver {
    callback: ROCallback;
    constructor(callback: ROCallback) {
        this.callback = callback;
        observedCallbacks.push(callback);
    }
    observe(node: Element) {
        observedNodes.push(node);
    }
    unobserve() {}
    disconnect() {}
}

/** Stubs the observed prefix node's offsetLeft/offsetWidth, then fires its observer callback. */
function fireResize(offsetLeft: number, offsetWidth: number, index = 0) {
    const node = observedNodes[index];
    const callback = observedCallbacks[index];
    Object.defineProperty(node, 'offsetLeft', { value: offsetLeft, configurable: true });
    Object.defineProperty(node, 'offsetWidth', { value: offsetWidth, configurable: true });
    act(() => {
        callback([] as unknown as ResizeObserverEntry[], null as unknown as ResizeObserver);
    });
}

describe('SlugInput', () => {
    beforeEach(() => {
        observedNodes = [];
        observedCallbacks = [];
        vi.stubGlobal('ResizeObserver', ControllableResizeObserver);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    // Brief's own smoke test (task-6.1-brief.md step 1). It passes even
    // before the prefix has been measured (jsdom's zero-width layout makes
    // input.left and prefix.right both 0, so the assertion only exercises
    // the fallback/gutter constant) — it does NOT prove the padding is
    // measurement-driven. Test below does.
    it('keeps a gutter between the prefix and the value', () => {
        render(<SlugInput prefix="/app/" value="example-project" onChange={() => {}} />);
        const input = screen.getByRole('textbox');
        const prefix = screen.getByText('/app/');
        const gap =
            input.getBoundingClientRect().left +
            Number.parseFloat(getComputedStyle(input).paddingLeft) -
            prefix.getBoundingClientRect().right;
        expect(gap).toBeGreaterThanOrEqual(8);
    });

    it('derives the input’s left padding from the measured prefix position and width, not a constant', () => {
        render(<SlugInput prefix="/app/" value="example-project" onChange={() => {}} />);
        const input = screen.getByRole('textbox') as HTMLInputElement;

        // offsetLeft=12 (the prefix's own `left-3`) + offsetWidth=40 + 12px gutter.
        fireResize(12, 40);
        expect(input.style.paddingLeft).toBe('64px');

        fireResize(12, 100);
        expect(input.style.paddingLeft).toBe('124px'); // tracks the new width

        // Regression check for the exact defect flagged in review: an
        // earlier version of this component added prefixWidth + gutter
        // WITHOUT the prefix's own 12px offsetLeft, which placed the value
        // at the prefix's right edge (a ~1px gap) instead of after a real
        // gutter. If offsetLeft is ever forgotten again, the padding below
        // would be 52px, not 64px, and this assertion would catch it.
        fireResize(12, 40);
        expect(input.style.paddingLeft).toBe('64px');
        expect(input.style.paddingLeft).not.toBe('52px');
    });

    it('measures independently per prefix, so two instances with different prefixes do not share one padding', () => {
        render(
            <>
                <SlugInput prefix="/app/" value="a" onChange={() => {}} />
                <SlugInput prefix="/study/" value="b" onChange={() => {}} />
            </>
        );
        const [shortInput, longInput] = screen.getAllByRole('textbox') as HTMLInputElement[];

        fireResize(12, 30, 0); // "/app/" measured narrow
        fireResize(12, 70, 1); // "/study/" measured wider

        expect(shortInput.style.paddingLeft).toBe('54px');
        expect(longInput.style.paddingLeft).toBe('94px');
        expect(shortInput.style.paddingLeft).not.toBe(longInput.style.paddingLeft);
    });

    it('measures synchronously on mount, without waiting for the observer to fire', () => {
        // useLayoutEffect calls measure() itself before ever attaching the
        // ResizeObserver — this is what removes the one-frame flash of
        // FALLBACK_PADDING_PX a plain useEffect produced (measured live:
        // 48px -> 58.84px). No fireResize() call here: by the time render()
        // returns, the padding already reflects the initial measurement
        // (jsdom's zero-layout numbers: offsetLeft=0, offsetWidth=0, so
        // 0 + 0 + 12px gutter), not the 48px fallback.
        render(<SlugInput prefix="/app/" value="example-project" onChange={() => {}} />);
        const input = screen.getByRole('textbox') as HTMLInputElement;
        expect(input.style.paddingLeft).toBe('12px');
        expect(input.style.paddingLeft).not.toBe('48px');
    });

    it('calls onChange with the raw string value, not the event', () => {
        const onChange = vi.fn();
        render(<SlugInput prefix="/app/" value="" onChange={onChange} />);
        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: 'my-slug' } });
        expect(onChange).toHaveBeenCalledWith('my-slug');
    });

    it('forwards id and a ref to the underlying input (required for FormControl/Slot composition)', () => {
        let refValue: HTMLInputElement | null = null;
        render(
            <SlugInput
                prefix="/app/"
                value=""
                onChange={() => {}}
                id="project-slug"
                ref={(node) => {
                    refValue = node;
                }}
            />
        );
        const input = screen.getByRole('textbox');
        expect(input).toHaveAttribute('id', 'project-slug');
        expect(refValue).toBe(input);
    });

    it('replaces the default prefix classes wholesale when prefixClassName is given', () => {
        render(
            <SlugInput
                prefix="/study/"
                value=""
                onChange={() => {}}
                prefixClassName="text-slate-600 font-mono"
            />
        );
        const prefix = screen.getByText('/study/');
        expect(prefix.className).toBe('text-slate-600 font-mono');
        expect(prefix.className).not.toContain('border-r');
    });
});
