import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { UserAvatar, computeInitials } from './UserAvatar';

describe('computeInitials', () => {
    it('returns 2-letter initials from a multi-word name', () => {
        expect(computeInitials('Ada Lovelace', null)).toBe('AL');
    });

    it('returns 1-letter initials from a single-word name (capped at 2)', () => {
        expect(computeInitials('Cher', null)).toBe('C');
    });

    it('falls back to first 2 letters of email when name missing', () => {
        expect(computeInitials(null, 'ada@example.com')).toBe('AD');
    });

    it('falls back to ? when both missing', () => {
        expect(computeInitials(null, null)).toBe('?');
    });

    it('handles three-word names by taking first two initials', () => {
        expect(computeInitials('Grace Brewster Hopper', null)).toBe('GB');
    });
});

describe('UserAvatar', () => {
    it('renders the computed initials inside the indigo square', () => {
        render(<UserAvatar name="Ada Lovelace" email="ada@x.io" />);
        expect(screen.getByText('AL')).toBeInTheDocument();
    });

    it('falls back to email when name is empty', () => {
        render(<UserAvatar name="" email="grace@x.io" />);
        expect(screen.getByText('GR')).toBeInTheDocument();
    });
});
