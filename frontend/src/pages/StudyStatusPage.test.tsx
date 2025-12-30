/*
 * Open-Q - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StudyStatusPage from './StudyStatusPage';

// Mock Lucide icons to avoid rendering issues
vi.mock('lucide-react', () => ({
    SearchX: () => <div data-testid="icon-search-x" />,
    Home: () => <div data-testid="icon-home" />,
    Construction: () => <div data-testid="icon-construction" />,
    LockKeyhole: () => <div data-testid="icon-lock" />,
    ClipboardList: () => <div data-testid="icon-clipboard" />,
}));

describe('StudyStatusPage', () => {
    it('renders not_found state by default', () => {
        render(<StudyStatusPage />);
        // Check for default message key (mocked or actual if i18n setup)
        // Since i18n might return keys in test env without setup, assuming keys or partials
        expect(screen.getByText('common.errors.study_not_found.title')).toBeTruthy();
        expect(screen.getByTestId('icon-search-x')).toBeTruthy();
        const link = screen.getByRole('link');
        expect(link.getAttribute('href')).toBe('/');
    });

    it('renders draft state correctly', () => {
        render(<StudyStatusPage type="draft" />);
        expect(screen.getByText('common.status.draft.title')).toBeTruthy();
        expect(screen.getByTestId('icon-clipboard')).toBeTruthy();
    });

    it('renders paused state with retry button', () => {
        const handleRetry = vi.fn();
        render(<StudyStatusPage type="paused" onRetry={handleRetry} />);

        expect(screen.getByText('common.status.paused.title')).toBeTruthy();
        expect(screen.getByTestId('icon-construction')).toBeTruthy();

        const button = screen.getByRole('button');
        fireEvent.click(button);
        expect(handleRetry).toHaveBeenCalledTimes(1);
    });

    it('renders closed state correctly', () => {
        render(<StudyStatusPage type="closed" />);
        expect(screen.getByText('common.status.closed.title')).toBeTruthy();
        expect(screen.getByTestId('icon-lock')).toBeTruthy();
    });
});
