import { describe, expect, it } from 'vitest';
import { shouldResetParticipantSessionForStudy } from './studySessionIsolation';

describe('shouldResetParticipantSessionForStudy', () => {
    it('does not reset when the route slug is missing', () => {
        expect(shouldResetParticipantSessionForStudy(undefined, 'study-a')).toBe(false);
        expect(shouldResetParticipantSessionForStudy('', 'study-a')).toBe(false);
    });

    it('does not reset a fresh legacy session with no stored study slug', () => {
        expect(shouldResetParticipantSessionForStudy('study-a', null)).toBe(false);
        expect(shouldResetParticipantSessionForStudy('study-a', undefined)).toBe(false);
    });

    it('does not reset when the stored session belongs to the current study', () => {
        expect(shouldResetParticipantSessionForStudy('study-a', 'study-a')).toBe(false);
    });

    it('resets when the stored participant session belongs to a different study', () => {
        expect(shouldResetParticipantSessionForStudy('study-b', 'study-a')).toBe(true);
    });
});
