import type { DumpParticipant } from './types';

// Mirror of the component-level constants so matchers stay self-contained.
const SUSPECT_DURATION_THRESHOLD = 120;

export type ConsentType = 'email' | 'newsletter' | 'interview';
export type StatusFilter = 'all' | 'completed' | 'in_progress' | 'abandoned';
export type StepFilter = 'all' | 'completed' | 1 | 2 | 3 | 4 | 5;
export type QualityFilter = 'all' | 'flagged' | 'has_comments' | 'has_audio' | 'has_recruitment';

/**
 * Returns true when the participant's quality attributes match the given filter.
 *
 * @param p             Participant row.
 * @param qualityFilter Active quality filter value.
 */
export function matchesQualityFilter(p: DumpParticipant, qualityFilter: QualityFilter): boolean {
    if (qualityFilter === 'all') return true;
    if (qualityFilter === 'flagged') {
        return (
            (p.duration_seconds !== null && p.duration_seconds < SUSPECT_DURATION_THRESHOLD) ||
            p.is_discarded
        );
    }
    if (qualityFilter === 'has_comments') {
        return Object.keys(p.postsort.card_comments || {}).length > 0;
    }
    if (qualityFilter === 'has_audio') {
        return p.audio_recordings !== undefined && Object.keys(p.audio_recordings).length > 0;
    }
    if (qualityFilter === 'has_recruitment') {
        return !!p.recruitment_token;
    }
    return true;
}

/**
 * Returns true when the participant satisfies all active consent filters.
 * An empty filter set matches every participant.
 *
 * @param p              Participant row.
 * @param consentFilters Set of consent types that must all be present.
 */
export function matchesConsentFilter(
    p: DumpParticipant,
    consentFilters: Set<ConsentType>
): boolean {
    if (consentFilters.size === 0) return true;
    return [...consentFilters].every((f) => {
        if (f === 'email') return !!p.postsort.email;
        if (f === 'newsletter') return !!p.postsort.newsletter_consent;
        if (f === 'interview') return !!p.postsort.interview_consent;
        return true;
    });
}

/**
 * Returns true when the participant is at the expected step.
 *
 * @param p          Participant row.
 * @param stepFilter Active step filter value.
 */
export function matchesStepFilter(p: DumpParticipant, stepFilter: StepFilter): boolean {
    if (stepFilter === 'all') return true;
    if (stepFilter === 'completed') return p.status === 'completed';
    return p.last_step_reached === stepFilter && p.status !== 'completed';
}

/**
 * Returns true when the participant matches the free-text search query.
 * An empty query matches every participant.
 *
 * @param p            Participant row.
 * @param globalFilter Lowercased search string (empty string = no filter).
 */
export function matchesSearchFilter(p: DumpParticipant, globalFilter: string): boolean {
    if (!globalFilter) return true;
    const q = globalFilter.toLowerCase();
    return (
        p.id.toLowerCase().includes(q) ||
        (p.language || '').toLowerCase().includes(q) ||
        (p.status || '').toLowerCase().includes(q) ||
        (p.postsort?.email || '').toLowerCase().includes(q) ||
        (p.recruitment_token || '').toLowerCase().includes(q) ||
        (p.ip_address || '').toLowerCase().includes(q)
    );
}
