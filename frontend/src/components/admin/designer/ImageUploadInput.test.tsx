import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import ImageUploadInput from './ImageUploadInput';
import { renderWithProviders, screen } from '@/test-utils/test-utils';

describe('ImageUploadInput — remove-image control name (Task 6.7c)', () => {
    it('falls back to a generic name when the caller passes no discriminator', () => {
        renderWithProviders(
            <ImageUploadInput value="https://example.com/logo.png" onChange={() => {}} />
        );

        expect(screen.getByRole('button', { name: 'Remove image' })).toBeInTheDocument();
    });

    it('uses the caller-supplied discriminator when provided', () => {
        renderWithProviders(
            <ImageUploadInput
                value="https://example.com/logo.png"
                onChange={() => {}}
                removeAriaLabel="Remove logo for Acme University"
            />
        );

        expect(
            screen.getByRole('button', { name: 'Remove logo for Acme University' })
        ).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Remove image' })).not.toBeInTheDocument();
    });
});

describe('ImageUploadInput — drag/drop zone is a real, keyboard-operable button (Task 6.7d)', () => {
    it('is a native <button> with no hand-rolled role/tabIndex, and opens the file picker via keyboard', async () => {
        const user = userEvent.setup();
        renderWithProviders(<ImageUploadInput value="" onChange={() => {}} />);

        await user.click(screen.getByRole('button', { name: 'Upload' }));

        const zone = screen.getByRole('button', { name: 'Drag & drop or click to upload' });
        // Positive: it's a genuine <button>, not a div faking the role.
        expect(zone.tagName).toBe('BUTTON');
        // Negative: no hand-rolled role attribute needed — the tag itself
        // carries the semantics.
        expect(zone).not.toHaveAttribute('role');

        const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click');
        zone.focus();
        await user.keyboard('{Enter}');

        // A native <button> converts Enter into a click automatically — no
        // custom onKeyDown needed — which is what actually opens the hidden
        // file input.
        expect(clickSpy).toHaveBeenCalled();
        clickSpy.mockRestore();
    });

    it('keeps the hidden file input outside the button (valid content model)', async () => {
        const user = userEvent.setup();
        renderWithProviders(<ImageUploadInput value="" onChange={() => {}} />);
        await user.click(screen.getByRole('button', { name: 'Upload' }));

        const zone = screen.getByRole('button', { name: 'Drag & drop or click to upload' });
        expect(zone.querySelector('input[type="file"]')).toBeNull();
    });
});
