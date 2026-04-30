/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * RoughSortGuard
 *
 * Route-level defence for `/study/:slug/rough-sort`. When the study has
 * `rough_sort_enabled = false` (deck-only configuration), a participant who
 * lands on the rough-sort URL — via paste, bookmark, or stale link — is
 * redirected to `/fine-sort` with `replace` so the back button does not
 * bounce them back to the disabled step.
 *
 * Loading behaviour: if the config is not yet hydrated, render `RoughSortPage`
 * unchanged. The page has its own loading UI; redirecting on `null` would
 * silently break a normal first load.
 *
 * Sibling guards live in `StudyLayout` (sidebar `visibleSteps` + `handleStepClick`).
 * This guard catches the URL-paste path that those don't.
 */

import { Navigate, useParams } from 'react-router-dom';
import RoughSortPage from '../../pages/RoughSortPage';
import { useConfigStore } from '../../store/useConfigStore';
import { isRoughSortEnabled } from '../../utils/studyConfig';

export function RoughSortGuard() {
    const { slug } = useParams();
    const config = useConfigStore((s) => s.config);

    // Wait for config to load before deciding (otherwise we may flicker
    // a redirect before the participant's study is known).
    if (!config) {
        return <RoughSortPage />;
    }

    if (!isRoughSortEnabled(config)) {
        return <Navigate to={`/study/${slug}/fine-sort`} replace />;
    }
    return <RoughSortPage />;
}
