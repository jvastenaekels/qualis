/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NativeSelect } from './native-select';
import { SurveyField } from '../survey/SurveyField';
import type { PreSortField } from '@/schemas/study';

/**
 * The defect: the pre-sort's dropdown rendered on `rgb(239, 239, 239)` — the
 * user agent's own grey — the single grey field in a form of white ones. The
 * post-sort's dropdown, four screens later, was white, rounded and bordered.
 *
 * Cause: `SurveyField`'s shared field classes never set a background. `<input>`
 * and `<textarea>` are white by UA default, so the omission was invisible on
 * every field type except `<select>`.
 */

// react-hook-form's register() returns { name, onChange, onBlur, ref }; the
// component only needs the shape, not the form.
const noopRegister = vi.fn(() => ({
    name: 'sector',
    onChange: vi.fn(),
    onBlur: vi.fn(),
    ref: vi.fn(),
    // biome-ignore lint/suspicious/noExplicitAny: standing in for UseFormRegister
})) as any;

const selectConfig = {
    type: 'select',
    label: 'Which sector do you work in?',
    options: [
        { value: 'research', label: 'Research' },
        { value: 'industry', label: 'Industry' },
    ],
} as PreSortField;

describe('NativeSelect', () => {
    it('is a native <select>, not a Radix listbox', () => {
        // The pre-sort registers this element with react-hook-form; swapping in
        // a Radix Select would change the form contract, not just the styling.
        render(<NativeSelect aria-label="sector" />);
        expect(screen.getByRole('combobox').tagName).toBe('SELECT');
    });

    it('forwards its ref, which register() needs', () => {
        const ref = vi.fn();
        render(<NativeSelect aria-label="sector" ref={ref} />);
        expect(ref).toHaveBeenCalledWith(expect.any(HTMLSelectElement));
    });

    it('keeps the caller class alongside its own', () => {
        render(<NativeSelect aria-label="sector" className="mt-1" />);
        const select = screen.getByRole('combobox');
        expect(select.className).toMatch(/mt-1/);
        expect(select.className).toMatch(/bg-white/);
    });
});

describe('SurveyField select', () => {
    it('renders the pre-sort dropdown on the same white as its sibling fields', () => {
        render(<SurveyField id="sector" fieldConfig={selectConfig} register={noopRegister} />);
        expect(screen.getByRole('combobox').className).toMatch(/bg-white/);
    });

    it('carries the same border and radius as the text fields around it', () => {
        const { unmount } = render(
            <SurveyField id="sector" fieldConfig={selectConfig} register={noopRegister} />
        );
        const select = screen.getByRole('combobox').className;
        unmount();

        render(
            <SurveyField
                id="name"
                fieldConfig={{ type: 'text', label: 'Name' } as PreSortField}
                register={noopRegister}
            />
        );
        const input = screen.getByRole('textbox').className;

        for (const token of ['rounded-md', 'border-gray-300', 'min-h-[44px]', 'text-base']) {
            expect(select).toContain(token);
            expect(input).toContain(token);
        }
    });
});
