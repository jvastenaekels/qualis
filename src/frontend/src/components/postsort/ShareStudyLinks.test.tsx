import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test-utils/test-utils';
import { ShareStudyLinks } from './ShareStudyLinks';

describe('ShareStudyLinks', () => {
    const defaultProps = {
        studyUrl: 'https://example.com/study/demo',
        studyTitle: 'Climate Change Perspectives',
    };

    beforeEach(() => {
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText: vi.fn().mockResolvedValue(undefined) },
            writable: true,
            configurable: true,
        });
        // Remove navigator.share by default so native share button is hidden
        Object.defineProperty(navigator, 'share', {
            value: undefined,
            writable: true,
            configurable: true,
        });
    });

    it('renders copy link button and all social channel links', () => {
        renderWithProviders(<ShareStudyLinks {...defaultProps} />);

        expect(screen.getByText('Copy link')).toBeInTheDocument();
        expect(screen.getByLabelText('Email')).toBeInTheDocument();
        expect(screen.getByLabelText('WhatsApp')).toBeInTheDocument();
        expect(screen.getByLabelText('Bluesky')).toBeInTheDocument();
        expect(screen.getByLabelText('Facebook')).toBeInTheDocument();
        expect(screen.getByLabelText('LinkedIn')).toBeInTheDocument();
    });

    it('renders "Spread the word" label', () => {
        renderWithProviders(<ShareStudyLinks {...defaultProps} />);
        expect(screen.getByText('Spread the word')).toBeInTheDocument();
    });

    it('copies URL to clipboard on copy link click', () => {
        renderWithProviders(<ShareStudyLinks {...defaultProps} />);
        fireEvent.click(screen.getByText('Copy link'));
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(defaultProps.studyUrl);
    });

    it('constructs correct WhatsApp share URL', () => {
        renderWithProviders(<ShareStudyLinks {...defaultProps} />);
        const link = screen.getByLabelText('WhatsApp');
        expect(link.getAttribute('href')).toContain('wa.me');
        expect(link.getAttribute('href')).toContain(encodeURIComponent(defaultProps.studyUrl));
    });

    it('constructs correct Bluesky share URL', () => {
        renderWithProviders(<ShareStudyLinks {...defaultProps} />);
        const link = screen.getByLabelText('Bluesky');
        expect(link.getAttribute('href')).toContain('bsky.app/intent/compose');
        expect(link.getAttribute('href')).toContain(encodeURIComponent(defaultProps.studyUrl));
    });

    it('constructs correct Facebook share URL', () => {
        renderWithProviders(<ShareStudyLinks {...defaultProps} />);
        const link = screen.getByLabelText('Facebook');
        expect(link.getAttribute('href')).toContain('facebook.com/sharer');
        expect(link.getAttribute('href')).toContain(encodeURIComponent(defaultProps.studyUrl));
    });

    it('constructs correct LinkedIn share URL', () => {
        renderWithProviders(<ShareStudyLinks {...defaultProps} />);
        const link = screen.getByLabelText('LinkedIn');
        expect(link.getAttribute('href')).toContain('linkedin.com/sharing');
        expect(link.getAttribute('href')).toContain(encodeURIComponent(defaultProps.studyUrl));
    });

    it('constructs correct email mailto link', () => {
        renderWithProviders(<ShareStudyLinks {...defaultProps} />);
        const link = screen.getByLabelText('Email');
        const href = link.getAttribute('href') ?? '';
        expect(href).toContain('mailto:');
        expect(href).toContain('subject=');
        expect(href).toContain(encodeURIComponent(defaultProps.studyUrl));
    });

    it('opens social links in new tab', () => {
        renderWithProviders(<ShareStudyLinks {...defaultProps} />);
        for (const label of ['WhatsApp', 'Bluesky', 'Facebook', 'LinkedIn']) {
            const link = screen.getByLabelText(label);
            expect(link).toHaveAttribute('target', '_blank');
            expect(link).toHaveAttribute('rel', 'noopener noreferrer');
        }
    });

    it('shows native share button when navigator.share is available', () => {
        Object.defineProperty(navigator, 'share', {
            value: vi.fn(),
            writable: true,
            configurable: true,
        });
        renderWithProviders(<ShareStudyLinks {...defaultProps} />);
        expect(screen.getByLabelText('Share')).toBeInTheDocument();
    });

    it('hides native share button when navigator.share is unavailable', () => {
        renderWithProviders(<ShareStudyLinks {...defaultProps} />);
        expect(screen.queryByLabelText('Share')).not.toBeInTheDocument();
    });

    it('calls navigator.share with correct args on native share click', async () => {
        const shareMock = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'share', {
            value: shareMock,
            writable: true,
            configurable: true,
        });
        renderWithProviders(<ShareStudyLinks {...defaultProps} />);
        fireEvent.click(screen.getByLabelText('Share'));
        expect(shareMock).toHaveBeenCalledWith(
            expect.objectContaining({
                title: defaultProps.studyTitle,
                url: defaultProps.studyUrl,
            })
        );
    });
});
