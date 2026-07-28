/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SlugInput } from './slug-input';

/**
 * jsdom never computes real layout — every element's getBoundingClientRect()
 * and offsetWidth report 0, and jsdom's global ResizeObserver polyfill
 * (src/setupTests.ts) is a no-op that never invokes its callback. So no test
 * in this file can observe genuine pixel geometry; a hard-coded `pl-32`
 * would satisfy a naive "gap >= 8" assertion here just as well as a real
 * measurement does. To actually prove the padding is *derived from* the
 * measured prefix width — not a constant — this file replaces the global
 * ResizeObserver with a controllable mock that lets a test fire the
 * observer's callback with an arbitrary `contentRect.width` and check the
 * component's padding tracks it.
 */

type ROCallback = ConstructorParameters<typeof ResizeObserver>[0];

let observedCallbacks: ROCallback[];

class ControllableResizeObserver {
    callback: ROCallback;
    constructor(callback: ROCallback) {
        this.callback = callback;
        observedCallbacks.push(callback);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
}

function fireResize(width: number, index = 0) {
    const callback = observedCallbacks[index];
    act(() => {
        // biome-ignore lint/suspicious/noExplicitAny: minimal ResizeObserverEntry stub for the test
        callback([{ contentRect: { width } } as any], null as unknown as ResizeObserver);
    });
}

describe('SlugInput', () => {
    beforeEach(() => {
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

    it('derives the input’s left padding from the measured prefix width, not a constant', () => {
        render(<SlugInput prefix="/app/" value="example-project" onChange={() => {}} />);
        const input = screen.getByRole('textbox') as HTMLInputElement;

        fireResize(40);
        expect(input.style.paddingLeft).toBe('52px'); // 40 + 12px gutter

        fireResize(100);
        expect(input.style.paddingLeft).toBe('112px'); // 100 + 12px gutter — tracks the new width
    });

    it('measures independently per prefix, so two instances with different prefixes do not share one padding', () => {
        render(
            <>
                <SlugInput prefix="/app/" value="a" onChange={() => {}} />
                <SlugInput prefix="/study/" value="b" onChange={() => {}} />
            </>
        );
        const [shortInput, longInput] = screen.getAllByRole('textbox') as HTMLInputElement[];

        fireResize(30, 0); // "/app/" measured narrow
        fireResize(70, 1); // "/study/" measured wider

        expect(shortInput.style.paddingLeft).toBe('42px');
        expect(longInput.style.paddingLeft).toBe('82px');
        expect(shortInput.style.paddingLeft).not.toBe(longInput.style.paddingLeft);
    });

    it('falls back to a fixed padding before any measurement has arrived', () => {
        render(<SlugInput prefix="/app/" value="example-project" onChange={() => {}} />);
        const input = screen.getByRole('textbox') as HTMLInputElement;
        // No fireResize() call yet — the observer hasn't reported a width.
        expect(input.style.paddingLeft).toBe('48px');
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
});
