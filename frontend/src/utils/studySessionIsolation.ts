/**
 * Returns true when the persisted participant session is explicitly tied to a
 * different study than the current route.
 *
 * A missing stored study slug is treated as legacy/fresh state and is not reset
 * here; other guards can still reset completed legacy sessions.
 */
export function shouldResetParticipantSessionForStudy(
    routeSlug: string | null | undefined,
    storedStudySlug: string | null | undefined
): boolean {
    if (!routeSlug) return false;
    if (!storedStudySlug) return false;
    return storedStudySlug !== routeSlug;
}
