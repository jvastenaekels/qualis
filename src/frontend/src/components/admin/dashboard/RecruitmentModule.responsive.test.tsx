import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen } from '@/test-utils/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RecruitmentModule from './RecruitmentModule';

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

describe('RecruitmentModule responsive layout', () => {
    beforeEach(() => {
        Object.defineProperty(window, 'location', {
            value: new URL('https://qualis.test/app/project/studies/study'),
            writable: true,
        });
        Object.defineProperty(navigator, 'clipboard', {
            value: {
                writeText: vi.fn().mockResolvedValue(undefined),
            },
            configurable: true,
        });
        vi.spyOn(window, 'open').mockImplementation(() => null);
    });

    it('keeps grid ownership outside of the reusable card', () => {
        const { container } = renderWithProviders(<RecruitmentModule slug="long-study" />);

        const card = container.querySelector('[data-testid="recruitment-module"]');

        expect(card?.className).not.toContain('md:col-span-4');
        expect(card?.className).not.toContain('col-span-12');
    });

    it('uses a single-column action layout in narrow sidebar breakpoints', () => {
        const { container } = renderWithProviders(<RecruitmentModule slug="long-study" />);

        const actions = container.querySelector('[data-testid="recruitment-actions"]');

        expect(actions?.className).toContain('grid-cols-1');
        expect(actions?.className).toContain('sm:grid-cols-2');
        expect(actions?.className).toContain('lg:grid-cols-1');
        expect(actions?.className).toContain('xl:grid-cols-2');
    });

    it('allows QR and live-study labels to wrap instead of clipping', () => {
        renderWithProviders(<RecruitmentModule slug="long-study" />);

        const showQr = screen.getByRole('button', { name: /show qr/i });
        const liveStudy = screen.getByRole('button', { name: /live study/i });

        expect(showQr.className).toContain('whitespace-normal');
        expect(showQr.className).toContain('h-auto');
        expect(liveStudy.className).toContain('whitespace-normal');
        expect(liveStudy.className).toContain('h-auto');
    });

    it('allows the expanded download button label to wrap', async () => {
        const user = userEvent.setup();
        renderWithProviders(<RecruitmentModule slug="long-study" />);

        await user.click(screen.getByRole('button', { name: /show qr/i }));

        const download = screen.getByRole('button', { name: /download image/i });
        expect(download.className).toContain('whitespace-normal');
        expect(download.className).toContain('h-auto');
    });
});
