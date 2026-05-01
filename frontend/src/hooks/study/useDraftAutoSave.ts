/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Debounced participant draft auto-save.
 *
 * Subscribes to the response store, debounces save requests by 5s, and
 * persists the latest snapshot to `/api/study/{slug}/save-draft`.
 * Flushes the queued save on `beforeunload` (via `keepalive` fetch) and
 * on unmount (via the regular `customInstance`).
 *
 * The hook returns `draftSaveStatus` so the layout chrome can render a
 * subtle 'saving' / 'saved' / 'error' indicator next to the resume code.
 *
 * Save is skipped when:
 * - the session has no token,
 * - pilot mode is on,
 * - the participant is in completed or submitting state,
 * - or `slug` is undefined (route mismatch).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { BASE_URL, customInstance } from '../../api/mutator';
import { useResponseStore } from '../../store/useResponseStore';
import { useSessionStore } from '../../store/useSessionStore';

export type DraftSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function useDraftAutoSave(slug: string | undefined): {
    draftSaveStatus: DraftSaveStatus;
} {
    const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [draftSaveStatus, setDraftSaveStatus] = useState<DraftSaveStatus>('idle');
    const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    /** Returns the session token when draft-saving is allowed, or null to skip. */
    const getDraftSaveToken = useCallback(() => {
        const session = useSessionStore.getState();
        if (
            !session.token ||
            session.isPilotMode ||
            session.isCompleted ||
            session.isSubmitting ||
            !slug
        )
            return null;
        return session.token;
    }, [slug]);

    useEffect(() => {
        const unsub = useResponseStore.subscribe(() => {
            const token = getDraftSaveToken();
            if (!token) return;

            if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
            draftSaveTimerRef.current = setTimeout(() => {
                const freshToken = getDraftSaveToken();
                if (!freshToken) return;
                const { presort, rough, qsort, postsort } = useResponseStore.getState();
                setDraftSaveStatus('saving');
                customInstance({
                    url: `/api/study/${slug}/save-draft`,
                    method: 'PUT',
                    data: {
                        session_token: freshToken,
                        draft_responses: { presort, rough, qsort, postsort },
                    },
                })
                    .then(() => {
                        setDraftSaveStatus('saved');
                        if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
                        saveStatusTimerRef.current = setTimeout(
                            () => setDraftSaveStatus('idle'),
                            3000
                        );
                    })
                    .catch(() => {
                        setDraftSaveStatus('error');
                        if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
                        saveStatusTimerRef.current = setTimeout(
                            () => setDraftSaveStatus('idle'),
                            5000
                        );
                    });
            }, 5000);
        });

        const buildDraftPayload = () => {
            const token = getDraftSaveToken();
            if (!token) return null;
            const { presort, rough, qsort, postsort } = useResponseStore.getState();
            return {
                url: `${BASE_URL}/api/study/${slug}/save-draft`,
                body: JSON.stringify({
                    session_token: token,
                    draft_responses: { presort, rough, qsort, postsort },
                }),
            };
        };

        const handleBeforeUnload = () => {
            if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
            const payload = buildDraftPayload();
            if (!payload) return;
            fetch(payload.url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: payload.body,
                keepalive: true,
            }).catch(() => {});
        };
        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            unsub();
            window.removeEventListener('beforeunload', handleBeforeUnload);
            if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
            // Flush (not discard) any pending draft save on unmount.
            if (draftSaveTimerRef.current) {
                clearTimeout(draftSaveTimerRef.current);
                const payload = buildDraftPayload();
                if (payload) {
                    customInstance({
                        url: `/api/study/${slug}/save-draft`,
                        method: 'PUT',
                        data: JSON.parse(payload.body),
                    }).catch(() => {});
                }
            }
        };
    }, [slug, getDraftSaveToken]);

    return { draftSaveStatus };
}
