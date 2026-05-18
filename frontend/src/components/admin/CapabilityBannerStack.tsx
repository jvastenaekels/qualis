import { useTranslation } from 'react-i18next';
import { AlertTriangle, ChevronDown } from 'lucide-react';
import { CapabilityBanner } from './CapabilityBanner';
import type { CapabilityDescriptor, CapabilityId } from '@/hooks/admin/useCapabilityBanners';

const MESSAGE_KEY: Record<CapabilityId, { key: string; fallback: string }> = {
    smtp: {
        key: 'admin.capability_banner.smtp',
        fallback:
            'Email delivery is not configured. Account recovery (password reset, email change, email-based two-factor authentication) requires manual administrator action.',
    },
    s3: {
        key: 'admin.capability_banner.s3',
        fallback:
            'Object storage is not configured. Audio responses cannot be collected; audio-enabled studies fall back to text-only responses.',
    },
};

interface StackProps {
    capabilities: CapabilityDescriptor[];
    onCollapse: () => void;
}

/** Expanded stack: one CapabilityBanner per active capability + collapse. */
export function CapabilityBannerStack({ capabilities, onCollapse }: StackProps) {
    const { t } = useTranslation();
    if (capabilities.length === 0) return null;
    return (
        <div>
            {capabilities.map((c) => {
                const m = MESSAGE_KEY[c.id];
                return (
                    <CapabilityBanner
                        key={c.id}
                        message={t(m.key, m.fallback)}
                        guideHref={c.guideHref}
                        guideLabel={t('admin.capability_banner.view_guide', 'View guide')}
                    />
                );
            })}
            <div className="flex justify-end border-b border-amber-200 bg-amber-50 px-4 py-1">
                <button
                    type="button"
                    onClick={onCollapse}
                    className="flex items-center gap-1 text-xs font-medium text-amber-800 underline underline-offset-2 hover:text-amber-900"
                >
                    {t('admin.capability_banner.collapse', 'Hide')}
                </button>
            </div>
        </div>
    );
}

interface ChipProps {
    count: number;
    onExpand: () => void;
}

/** Collapsed indicator: always-visible amber pill in the admin header. */
export function CapabilityBannerChip({ count, onExpand }: ChipProps) {
    const { t } = useTranslation();
    if (count === 0) return null;
    return (
        <button
            type="button"
            onClick={onExpand}
            title={t(
                'admin.capability_banner.chip_tooltip',
                'Some platform capabilities are unavailable. Click for details.'
            )}
            className="flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
        >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
                {t('admin.capability_banner.chip_count', 'Reduced functionality ({{n}})', {
                    n: count,
                })}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        </button>
    );
}
