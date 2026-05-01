/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * Fire-and-forget progress reporter for participant studies.
 *
 * Subscribes to the session store and reports each step advance to
 * `/api/study/{slug}/progress`. Skipped in pilot mode and when no
 * session token is set. Failures are silent — participant experience
 * is unaffected by an unreachable progress endpoint.
 */

import { useEffect, useRef } from 'react';
import { customInstance } from '../../api/mutator';
import { useSessionStore } from '../../store/useSessionStore';

export function useProgressReporter(slug: string | undefined): void {
    const lastReportedStepRef = useRef(0);
    useEffect(() => {
        const unsub = useSessionStore.subscribe((state, prevState) => {
            const step = state.maxReachedStep;
            if (
                step > prevState.maxReachedStep &&
                step > lastReportedStepRef.current &&
                !state.isPilotMode &&
                state.token &&
                slug
            ) {
                lastReportedStepRef.current = step;
                customInstance({
                    url: `/api/study/${slug}/progress`,
                    method: 'PATCH',
                    data: { session_token: state.token, step },
                }).catch(() => {
                    // Silent failure — participant experience is unaffected
                });
            }
        });
        return unsub;
    }, [slug]);
}
