import { describe, it, expect } from 'vitest';
import { diffVersionFields } from './ItemDetailSheet.helpers';
import type { ConcourseItemVersionRead } from '@/api/model';
import type { TFunction } from 'i18next';

// ---------------------------------------------------------------------------
// Stub translation function — returns the fallback string for readable assertions.
// Cast through `unknown` because i18next's TFunction has overloaded signatures.
// ---------------------------------------------------------------------------
const t = ((_key: string, fallback?: string) => fallback ?? _key) as unknown as TFunction;

// ---------------------------------------------------------------------------
// Minimal fixtures
// ---------------------------------------------------------------------------

function makeVersion(overrides: Partial<ConcourseItemVersionRead> = {}): ConcourseItemVersionRead {
    return {
        id: 1,
        item_id: 10,
        version_number: 1,
        code: 'ITEM-001',
        status: 'active',
        changed_at: '2026-01-01T00:00:00Z',
        translations_snapshot: [],
        tag_ids_snapshot: [],
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// diffVersionFields
// ---------------------------------------------------------------------------

describe('diffVersionFields', () => {
    it('no changes → returns null', () => {
        const prev = makeVersion();
        const current = makeVersion();
        expect(diffVersionFields(prev, current, t)).toBeNull();
    });

    it('code-only change → ["code"]', () => {
        const prev = makeVersion({ code: 'ITEM-001' });
        const current = makeVersion({ code: 'ITEM-002' });
        expect(diffVersionFields(prev, current, t)).toEqual(['code']);
    });

    it('status-only change → ["status"]', () => {
        const prev = makeVersion({ status: 'active' });
        const current = makeVersion({ status: 'archived' });
        expect(diffVersionFields(prev, current, t)).toEqual(['status']);
    });

    it('translations_snapshot text change → ["text"]', () => {
        const prev = makeVersion({
            translations_snapshot: [{ language_code: 'en', text: 'Hello' }],
        });
        const current = makeVersion({
            translations_snapshot: [{ language_code: 'en', text: 'Hi' }],
        });
        expect(diffVersionFields(prev, current, t)).toEqual(['text']);
    });

    it('tag_ids_snapshot change → ["tags"]', () => {
        const prev = makeVersion({ tag_ids_snapshot: [1, 2] });
        const current = makeVersion({ tag_ids_snapshot: [1, 3] });
        expect(diffVersionFields(prev, current, t)).toEqual(['tags']);
    });

    it('multiple changes → all labels present in order', () => {
        const prev = makeVersion({
            code: 'OLD',
            status: 'active',
            translations_snapshot: [{ language_code: 'en', text: 'Before' }],
            tag_ids_snapshot: [1],
        });
        const current = makeVersion({
            code: 'NEW',
            status: 'archived',
            translations_snapshot: [{ language_code: 'en', text: 'After' }],
            tag_ids_snapshot: [2],
        });
        expect(diffVersionFields(prev, current, t)).toEqual(['code', 'status', 'text', 'tags']);
    });

    it('reordered translations with same content → no text change (sort-invariant)', () => {
        const prev = makeVersion({
            translations_snapshot: [
                { language_code: 'en', text: 'Hello' },
                { language_code: 'fr', text: 'Bonjour' },
            ],
        });
        const current = makeVersion({
            translations_snapshot: [
                { language_code: 'fr', text: 'Bonjour' },
                { language_code: 'en', text: 'Hello' },
            ],
        });
        expect(diffVersionFields(prev, current, t)).toBeNull();
    });

    it('reordered tag_ids_snapshot with same values → no tags change (sort-invariant)', () => {
        const prev = makeVersion({ tag_ids_snapshot: [3, 1, 2] });
        const current = makeVersion({ tag_ids_snapshot: [1, 2, 3] });
        expect(diffVersionFields(prev, current, t)).toBeNull();
    });

    it('null/undefined snapshots treated as empty → no change', () => {
        const prev = makeVersion({ translations_snapshot: undefined, tag_ids_snapshot: undefined });
        const current = makeVersion({ translations_snapshot: [], tag_ids_snapshot: [] });
        expect(diffVersionFields(prev, current, t)).toBeNull();
    });
});
