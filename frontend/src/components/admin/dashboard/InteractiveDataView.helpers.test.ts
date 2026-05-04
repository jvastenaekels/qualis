import { describe, it, expect } from 'vitest';
import {
    matchesQualityFilter,
    matchesConsentFilter,
    matchesStepFilter,
    matchesSearchFilter,
} from './InteractiveDataView.helpers';
import type { DumpParticipant } from './types';

// ---------------------------------------------------------------------------
// Minimal fixture factory
// ---------------------------------------------------------------------------

function makeParticipant(overrides: Partial<DumpParticipant> = {}): DumpParticipant {
    return {
        id: 'abc12345',
        db_id: 1,
        duration_seconds: 300,
        scores: [],
        placements: {},
        presort: {},
        postsort: {},
        language: 'en',
        is_discarded: false,
        discard_reason: null,
        status: 'completed',
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// matchesQualityFilter
// ---------------------------------------------------------------------------

describe('matchesQualityFilter', () => {
    it('all → always true', () => {
        expect(matchesQualityFilter(makeParticipant(), 'all')).toBe(true);
    });

    it('flagged → true when duration < 120s', () => {
        const p = makeParticipant({ duration_seconds: 90 });
        expect(matchesQualityFilter(p, 'flagged')).toBe(true);
    });

    it('flagged → true when is_discarded even with acceptable duration', () => {
        const p = makeParticipant({ duration_seconds: 300, is_discarded: true });
        expect(matchesQualityFilter(p, 'flagged')).toBe(true);
    });

    it('flagged → false when duration >= 120s and not discarded', () => {
        const p = makeParticipant({ duration_seconds: 120, is_discarded: false });
        expect(matchesQualityFilter(p, 'flagged')).toBe(false);
    });

    it('flagged → false when duration is null and not discarded', () => {
        const p = makeParticipant({ duration_seconds: null, is_discarded: false });
        expect(matchesQualityFilter(p, 'flagged')).toBe(false);
    });

    it('has_comments → true when there are card comments', () => {
        const p = makeParticipant({ postsort: { card_comments: { stmt1: 'nice card' } } });
        expect(matchesQualityFilter(p, 'has_comments')).toBe(true);
    });

    it('has_comments → false when no card comments', () => {
        const p = makeParticipant({ postsort: { card_comments: {} } });
        expect(matchesQualityFilter(p, 'has_comments')).toBe(false);
    });

    it('has_comments → false when card_comments is undefined', () => {
        const p = makeParticipant({ postsort: {} });
        expect(matchesQualityFilter(p, 'has_comments')).toBe(false);
    });

    it('has_audio → true when audio_recordings is non-empty', () => {
        const p = makeParticipant({ audio_recordings: { q1: 'blob' } });
        expect(matchesQualityFilter(p, 'has_audio')).toBe(true);
    });

    it('has_audio → false when audio_recordings is empty', () => {
        const p = makeParticipant({ audio_recordings: {} });
        expect(matchesQualityFilter(p, 'has_audio')).toBe(false);
    });

    it('has_audio → false when audio_recordings is undefined', () => {
        const p = makeParticipant({ audio_recordings: undefined });
        expect(matchesQualityFilter(p, 'has_audio')).toBe(false);
    });

    it('has_recruitment → true when recruitment_token present', () => {
        const p = makeParticipant({ recruitment_token: 'cohort-A' });
        expect(matchesQualityFilter(p, 'has_recruitment')).toBe(true);
    });

    it('has_recruitment → false when no recruitment_token', () => {
        const p = makeParticipant({ recruitment_token: undefined });
        expect(matchesQualityFilter(p, 'has_recruitment')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// matchesConsentFilter
// ---------------------------------------------------------------------------

describe('matchesConsentFilter', () => {
    it('empty set → always true', () => {
        expect(matchesConsentFilter(makeParticipant(), new Set())).toBe(true);
    });

    it('email filter → true when postsort.email is set', () => {
        const p = makeParticipant({ postsort: { email: 'user@example.com' } });
        expect(matchesConsentFilter(p, new Set(['email']))).toBe(true);
    });

    it('email filter → false when postsort.email is absent', () => {
        const p = makeParticipant({ postsort: {} });
        expect(matchesConsentFilter(p, new Set(['email']))).toBe(false);
    });

    it('newsletter filter → true when newsletter_consent is set', () => {
        const p = makeParticipant({ postsort: { newsletter_consent: true } });
        expect(matchesConsentFilter(p, new Set(['newsletter']))).toBe(true);
    });

    it('interview filter → true when interview_consent is set', () => {
        const p = makeParticipant({ postsort: { interview_consent: true } });
        expect(matchesConsentFilter(p, new Set(['interview']))).toBe(true);
    });

    it('combined email + newsletter → false when only email present', () => {
        const p = makeParticipant({ postsort: { email: 'user@example.com' } });
        expect(matchesConsentFilter(p, new Set(['email', 'newsletter']))).toBe(false);
    });

    it('combined email + newsletter → true when both present', () => {
        const p = makeParticipant({
            postsort: { email: 'user@example.com', newsletter_consent: true },
        });
        expect(matchesConsentFilter(p, new Set(['email', 'newsletter']))).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// matchesStepFilter
// ---------------------------------------------------------------------------

describe('matchesStepFilter', () => {
    it('all → always true', () => {
        expect(matchesStepFilter(makeParticipant(), 'all')).toBe(true);
    });

    it('completed → true when status is completed', () => {
        const p = makeParticipant({ status: 'completed' });
        expect(matchesStepFilter(p, 'completed')).toBe(true);
    });

    it('completed → false when status is in_progress', () => {
        const p = makeParticipant({ status: 'in_progress' });
        expect(matchesStepFilter(p, 'completed')).toBe(false);
    });

    it('numeric step → true when last_step_reached matches and status is not completed', () => {
        const p = makeParticipant({ last_step_reached: 3, status: 'in_progress' });
        expect(matchesStepFilter(p, 3)).toBe(true);
    });

    it('numeric step → false when last_step_reached matches but status is completed', () => {
        const p = makeParticipant({ last_step_reached: 3, status: 'completed' });
        expect(matchesStepFilter(p, 3)).toBe(false);
    });

    it('numeric step → false when last_step_reached differs', () => {
        const p = makeParticipant({ last_step_reached: 2, status: 'in_progress' });
        expect(matchesStepFilter(p, 4)).toBe(false);
    });

    it('numeric step → false when last_step_reached is null', () => {
        const p = makeParticipant({ last_step_reached: null, status: 'in_progress' });
        expect(matchesStepFilter(p, 2)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// matchesSearchFilter
// ---------------------------------------------------------------------------

describe('matchesSearchFilter', () => {
    it('empty string → always true', () => {
        expect(matchesSearchFilter(makeParticipant(), '')).toBe(true);
    });

    it('matches participant id (case-insensitive)', () => {
        const p = makeParticipant({ id: 'ABC12345' });
        expect(matchesSearchFilter(p, 'abc1')).toBe(true);
    });

    it('matches language field', () => {
        const p = makeParticipant({ language: 'fr' });
        expect(matchesSearchFilter(p, 'fr')).toBe(true);
    });

    it('matches status field', () => {
        const p = makeParticipant({ status: 'in_progress' });
        expect(matchesSearchFilter(p, 'progress')).toBe(true);
    });

    it('matches postsort email', () => {
        const p = makeParticipant({ postsort: { email: 'alice@example.com' } });
        expect(matchesSearchFilter(p, 'alice')).toBe(true);
    });

    it('matches recruitment_token', () => {
        const p = makeParticipant({ recruitment_token: 'cohort-B' });
        expect(matchesSearchFilter(p, 'cohort')).toBe(true);
    });

    it('matches ip_address', () => {
        const p = makeParticipant({ ip_address: '192.168.0.1' });
        expect(matchesSearchFilter(p, '192.168')).toBe(true);
    });

    it('no match → false', () => {
        const p = makeParticipant({ id: 'aaa', language: 'en', status: 'completed' });
        expect(matchesSearchFilter(p, 'zzz')).toBe(false);
    });
});
