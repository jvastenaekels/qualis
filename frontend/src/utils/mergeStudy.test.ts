import { describe, it, expect } from 'vitest';
import { mergeStudyUpdates } from './mergeStudy';
import type { StudyUpdate } from '@/api/model';

describe('mergeStudyUpdates', () => {
    // Helper to create minimal study objects
    const createBase = (overrides: Partial<StudyUpdate> = {}): StudyUpdate => ({
        slug: 'test-study',
        grid_config: [],
        presort_config: {},
        postsort_config: {},
        // @ts-expect-error
        translations: [],
        ...overrides,
    });

    it('should overwrite local with server if only server changed (Safe Merge)', () => {
        const base = createBase({ slug: 'original' });
        const local = createBase({ slug: 'original' }); // Unchanged
        const server = createBase({ slug: 'server-updated' }); // Changed

        const result = mergeStudyUpdates(local, server, base);

        expect(result.success).toBe(true);
        expect(result.merged?.slug).toBe('server-updated');
        expect(result.conflicts).toBeUndefined();
    });

    it('should keep local change if server did not change (Safe Keep)', () => {
        const base = createBase({ slug: 'original' });
        const local = createBase({ slug: 'local-updated' }); // Changed
        const server = createBase({ slug: 'original' }); // Unchanged

        const result = mergeStudyUpdates(local, server, base);

        expect(result.success).toBe(true);
        expect(result.merged?.slug).toBe('local-updated');
    });

    it('should merge disjoint changes (Safe 3-way)', () => {
        // Base
        const base = createBase({
            slug: 'original',
            default_language: 'en',
        });

        // Local changed Slug
        const local = createBase({
            slug: 'local-slug',
            default_language: 'en',
        });

        // Server changed Language
        const server = createBase({
            slug: 'original',
            default_language: 'fr',
        });

        const result = mergeStudyUpdates(local, server, base);

        expect(result.success).toBe(true);
        expect(result.merged?.slug).toBe('local-slug');
        expect(result.merged?.default_language).toBe('fr');
    });

    it('should detect conflict if both changed the same simple field to different values', () => {
        const base = createBase({ slug: 'original' });
        const local = createBase({ slug: 'local-change' });
        const server = createBase({ slug: 'server-change' });

        const result = mergeStudyUpdates(local, server, base);

        expect(result.success).toBe(false);
        expect(result.conflicts).toContain('slug');
    });

    it('should auto-resolve if both changed same field to SAME value (Idempotent)', () => {
        const base = createBase({ slug: 'original' });
        const local = createBase({ slug: 'agreed-change' });
        const server = createBase({ slug: 'agreed-change' });

        const result = mergeStudyUpdates(local, server, base);

        expect(result.success).toBe(true);
        expect(result.merged?.slug).toBe('agreed-change');
    });

    it('should detect conflict on complex objects (Grid Config)', () => {
        // Deeply different grids
        const base = createBase({ grid_config: [{ score: 0, capacity: 1 }] });
        const local = createBase({ grid_config: [{ score: 0, capacity: 2 }] });
        const server = createBase({ grid_config: [{ score: 0, capacity: 3 }] });

        const result = mergeStudyUpdates(local, server, base);

        expect(result.success).toBe(false);
        expect(result.conflicts).toContain('grid_config');
    });

    it('should detect conflict on array modifications (Statements) - Strict V1 Logic', () => {
        // Currently we flag conflict if ANYONE touched statements while another touched them
        const base = createBase({ statements: [] });
        // @ts-expect-error
        const local = createBase({ statements: [{ code: 'S1', translations: [] }] });
        // @ts-expect-error
        const server = createBase({ statements: [{ code: 'S2', translations: [] }] });

        const result = mergeStudyUpdates(local, server, base);

        // V1 logic is strict on arrays
        expect(result.success).toBe(false);
        expect(result.conflicts).toContain('statements');
    });
});
