/**
 * Tests for EmptyState component
 *
 * Verifies rendering of different empty state variants
 * and interaction with CTAs.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmptyState } from './EmptyState';

// Mock dependencies
vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
    },
}));

vi.mock('qrcode.react', () => ({
    QRCodeSVG: ({ value }: { value: string }) => <div data-testid="qrcode" data-value={value} />,
}));

// Mock clipboard
const mockWriteText = vi.fn().mockResolvedValue(undefined);
Object.defineProperty(navigator, 'clipboard', {
    value: {
        writeText: mockWriteText,
    },
    writable: true,
    configurable: true,
});

describe('EmptyState', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('participants variant', () => {
        it('renders participant empty state with correct heading', () => {
            render(<EmptyState type="participants" studySlug="test-study" />);

            expect(screen.getByText('Ready to launch?')).toBeInTheDocument();
        });

        it('renders QR code when studySlug is provided', () => {
            render(<EmptyState type="participants" studySlug="my-study" />);

            const qrCode = screen.getByTestId('qrcode');
            expect(qrCode).toBeInTheDocument();
        });

        it('copies study link to clipboard when button clicked', async () => {
            const { toast } = await import('sonner');
            render(<EmptyState type="participants" studySlug="test-study" />);

            const copyButton = screen.getByRole('button', { name: /copy study link/i });
            fireEvent.click(copyButton);

            expect(mockWriteText).toHaveBeenCalled();
            expect(toast.success).toHaveBeenCalledWith('Study link copied to clipboard!');
        });
    });

    describe('team variant', () => {
        it('renders team empty state with correct heading', () => {
            render(<EmptyState type="team" />);

            expect(screen.getByText("You're flying solo")).toBeInTheDocument();
        });

        it('calls onAction when invite button clicked', () => {
            const onAction = vi.fn();
            render(<EmptyState type="team" onAction={onAction} />);

            const inviteButton = screen.getByRole('button', {
                name: /invite your first collaborator/i,
            });
            fireEvent.click(inviteButton);

            expect(onAction).toHaveBeenCalledTimes(1);
        });
    });

    describe('designer variant', () => {
        it('renders designer empty state with correct heading', () => {
            render(<EmptyState type="designer" />);

            expect(screen.getByText('Tabula Rasa')).toBeInTheDocument();
        });

        it('calls onAction when load example button clicked', () => {
            const onAction = vi.fn();
            render(<EmptyState type="designer" onAction={onAction} />);

            const loadButton = screen.getByRole('button', {
                name: /load example q-set/i,
            });
            fireEvent.click(loadButton);

            expect(onAction).toHaveBeenCalledTimes(1);
        });
    });

    describe('unknown type', () => {
        it('returns null for unknown type', () => {
            // @ts-expect-error Testing invalid prop
            const { container } = render(<EmptyState type="unknown" />);
            expect(container).toBeEmptyDOMElement();
        });
    });
});
