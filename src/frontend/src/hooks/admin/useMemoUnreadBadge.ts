/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { useEffect, useState } from 'react';
import {
    getConcourseMemoUnreadApiAdminConcoursesCidMemoUnreadGet,
    getStudyMemoUnreadApiAdminStudiesSidMemoUnreadGet,
} from '@/api/generated';
import { getLastSeen } from '@/components/admin/memo/memoLastSeen';

/**
 * Fetches the number of unread memo comments for the given parent on mount.
 *
 * "Unread" = comments newer than the last time the current user expanded the
 * memo accordion, authored by someone other than the current user, and not
 * soft-deleted.
 *
 * Returns 0 when parentId or currentUserId is falsy (safe during loading).
 * Errors are silently swallowed — the badge is non-critical UX.
 */
export function useMemoUnreadBadge(
    parentType: 'concourse' | 'study',
    parentId: number,
    currentUserId: number
): number {
    const [count, setCount] = useState(0);

    useEffect(() => {
        // Guard: skip fetch while IDs are not yet resolved.
        if (!parentId || !currentUserId) return;

        let cancelled = false;
        const since = getLastSeen(currentUserId, parentType, parentId);
        const fetcher =
            parentType === 'concourse'
                ? () =>
                      getConcourseMemoUnreadApiAdminConcoursesCidMemoUnreadGet(parentId, { since })
                : () => getStudyMemoUnreadApiAdminStudiesSidMemoUnreadGet(parentId, { since });

        fetcher()
            .then((n) => {
                if (!cancelled) setCount(n);
            })
            .catch(() => {
                // Silent — badge is non-critical UX.
            });

        return () => {
            cancelled = true;
        };
    }, [parentType, parentId, currentUserId]);

    return count;
}
