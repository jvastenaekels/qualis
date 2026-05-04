import { describe, it, expect } from 'vitest';
import { isTransitionAllowed } from './StudyStatusControl';

describe('isTransitionAllowed (state-machine guard)', () => {
    // Same-state transitions never allowed
    it.each(['draft', 'active', 'paused', 'closed'])('%s → %s is disallowed', (s) => {
        expect(isTransitionAllowed(s, s)).toBe(false);
    });

    // From draft: only draft → active
    it('draft → active is allowed', () => {
        expect(isTransitionAllowed('draft', 'active')).toBe(true);
    });
    it('draft → paused is disallowed', () => {
        expect(isTransitionAllowed('draft', 'paused')).toBe(false);
    });
    it('draft → closed is disallowed', () => {
        expect(isTransitionAllowed('draft', 'closed')).toBe(false);
    });

    // From active: paused, closed, draft (reverting always allowed)
    it('active → paused is allowed', () => {
        expect(isTransitionAllowed('active', 'paused')).toBe(true);
    });
    it('active → closed is allowed', () => {
        expect(isTransitionAllowed('active', 'closed')).toBe(true);
    });
    it('active → draft is allowed (revert to draft)', () => {
        expect(isTransitionAllowed('active', 'draft')).toBe(true);
    });

    // From paused: active, closed, draft
    it('paused → active is allowed', () => {
        expect(isTransitionAllowed('paused', 'active')).toBe(true);
    });
    it('paused → closed is allowed', () => {
        expect(isTransitionAllowed('paused', 'closed')).toBe(true);
    });
    it('paused → draft is allowed', () => {
        expect(isTransitionAllowed('paused', 'draft')).toBe(true);
    });

    // From closed: active, draft (NOT paused — re-pausing a closed study isn't supported)
    it('closed → active is allowed', () => {
        expect(isTransitionAllowed('closed', 'active')).toBe(true);
    });
    it('closed → draft is allowed', () => {
        expect(isTransitionAllowed('closed', 'draft')).toBe(true);
    });
    it('closed → paused is disallowed', () => {
        expect(isTransitionAllowed('closed', 'paused')).toBe(false);
    });

    // Unknown source state → no transition
    it('unknown state → anything is disallowed', () => {
        expect(isTransitionAllowed('unknown', 'draft')).toBe(false);
        expect(isTransitionAllowed('unknown', 'active')).toBe(false);
    });
});
