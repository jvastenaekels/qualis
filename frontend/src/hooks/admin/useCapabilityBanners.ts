import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePlatformConfigStore } from '@/store/usePlatformConfigStore';

export const CAPABILITY_BANNERS_STORAGE_KEY = 'qualis.capabilityBanners';

export type CapabilityId = 'smtp' | 's3';

export interface CapabilityDescriptor {
    id: CapabilityId;
    guideHref: string;
}

const GUIDE_HREF: Record<CapabilityId, string> = {
    smtp: '/docs/guides/running-without-smtp.md',
    s3: '/docs/guides/running-without-s3.md',
};

interface Persisted {
    collapsed: boolean;
    sig: string;
}

function readPersisted(): Persisted | null {
    try {
        const raw = localStorage.getItem(CAPABILITY_BANNERS_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Persisted;
        if (typeof parsed?.collapsed !== 'boolean' || typeof parsed?.sig !== 'string') return null;
        return parsed;
    } catch {
        return null;
    }
}

interface UseCapabilityBanners {
    capabilities: CapabilityDescriptor[];
    collapsed: boolean;
    setCollapsed: (v: boolean) => void;
    count: number;
}

export function useCapabilityBanners(): UseCapabilityBanners {
    const isEmailManual = usePlatformConfigStore((s) => s.isEmailManual());
    const isAudioStorageAvailable = usePlatformConfigStore((s) => s.isAudioStorageAvailable());

    const capabilities = useMemo<CapabilityDescriptor[]>(() => {
        const list: CapabilityDescriptor[] = [];
        if (isEmailManual) list.push({ id: 'smtp', guideHref: GUIDE_HREF.smtp });
        if (!isAudioStorageAvailable) list.push({ id: 's3', guideHref: GUIDE_HREF.s3 });
        return list;
    }, [isEmailManual, isAudioStorageAvailable]);

    const sig = useMemo(() => capabilities.map((c) => c.id).join(','), [capabilities]);

    const [collapsed, setCollapsedState] = useState<boolean>(() => {
        const p = readPersisted();
        return p !== null && p.sig === sig ? p.collapsed : false;
    });

    useEffect(() => {
        const p = readPersisted();
        if (p !== null && p.sig === sig) {
            setCollapsedState(p.collapsed);
        } else {
            setCollapsedState(false);
            if (sig !== '') {
                localStorage.setItem(
                    CAPABILITY_BANNERS_STORAGE_KEY,
                    JSON.stringify({ collapsed: false, sig })
                );
            }
        }
    }, [sig]);

    const setCollapsed = useCallback(
        (v: boolean) => {
            setCollapsedState(v);
            localStorage.setItem(
                CAPABILITY_BANNERS_STORAGE_KEY,
                JSON.stringify({ collapsed: v, sig })
            );
        },
        [sig]
    );

    return { capabilities, collapsed, setCollapsed, count: capabilities.length };
}
