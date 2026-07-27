import { describe, expect, it } from 'vitest';
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
