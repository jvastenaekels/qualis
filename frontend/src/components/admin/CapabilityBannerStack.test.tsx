import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithStore } from '@/test-utils/renderWithStore';
import { CapabilityBannerStack, CapabilityBannerChip } from './CapabilityBannerStack';
import type { CapabilityDescriptor } from '@/hooks/admin/useCapabilityBanners';

const SMTP: CapabilityDescriptor = {
    id: 'smtp',
    guideHref: '/docs/guides/running-without-smtp.md',
};
const S3: CapabilityDescriptor = { id: 's3', guideHref: '/docs/guides/running-without-s3.md' };

describe('CapabilityBannerStack', () => {
    it('renders one row per capability with mapped copy', () => {
        renderWithStore(<CapabilityBannerStack capabilities={[SMTP, S3]} onCollapse={vi.fn()} />);
        const rows = screen.getAllByRole('status');
        expect(rows).toHaveLength(2);
        expect(rows[0]).toHaveTextContent('Email delivery is not configured');
        expect(rows[1]).toHaveTextContent('Object storage is not configured');
    });

    it('collapse control calls onCollapse', async () => {
        const onCollapse = vi.fn();
        renderWithStore(<CapabilityBannerStack capabilities={[SMTP]} onCollapse={onCollapse} />);
        await userEvent.click(screen.getByRole('button', { name: 'Hide' }));
        expect(onCollapse).toHaveBeenCalledTimes(1);
    });
});

describe('CapabilityBannerChip', () => {
    it('shows the count and calls onExpand when clicked', async () => {
        const onExpand = vi.fn();
        renderWithStore(<CapabilityBannerChip count={2} onExpand={onExpand} />);
        const btn = screen.getByRole('button', { name: /Reduced functionality \(2\)/ });
        await userEvent.click(btn);
        expect(onExpand).toHaveBeenCalledTimes(1);
    });
});
