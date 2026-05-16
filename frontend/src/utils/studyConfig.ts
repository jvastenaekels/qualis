import type { PreSortField, PostsortConfig, ProcessStep } from '@/schemas/study';

/**
 * Structurally-typed inputs so these helpers also accept `StudyUpdate`
 * (admin designer drafts) and not just the participant-side `StudyConfig`.
 * Both shapes share the relevant fields; the widened types let callers in
 * either context use the same canonical predicate.
 */
type RoughSortLike = { rough_sort_enabled?: boolean | null };
type PresortLike = {
    presort_config?: { enabled?: boolean } | Record<string, unknown> | null;
};

export const isPresortEnabled = (config: PresortLike | null | undefined): boolean => {
    if (!config?.presort_config) return true;
    if ('enabled' in config.presort_config) {
        return (config.presort_config as { enabled?: boolean }).enabled !== false;
    }
    return true;
};

/**
 * Whether the study has the rough-sort step (3-pile triage) enabled.
 *
 * Mirrors {@link isPresortEnabled} for symmetry. Default to true when the
 * field is missing (backwards-compat with older study configs that predate
 * the rough_sort_enabled flag).
 */
export const isRoughSortEnabled = (config: RoughSortLike | null | undefined): boolean => {
    if (!config) return true;
    return config.rough_sort_enabled !== false;
};

/**
 * Structural input accepted by the config accessors: the participant-side
 * `StudyConfig`, the admin designer draft (`StudyUpdate`), a study
 * translation, or the opaque wire shape — all share the relevant keys.
 * Widened to `unknown`-valued fields so the single controlled assertion in
 * each accessor is the only place the opaque→typed bridge happens. No
 * runtime validation (zod.parse) — type-only by design (see spec).
 */
type ConfigLike =
    | {
          presort_config?: unknown;
          postsort_config?: unknown;
          process_steps?: unknown;
      }
    | null
    | undefined;

/** Field map regardless of legacy (flat record) vs new ({enabled, fields}). */
export function presortFields(config: ConfigLike): Record<string, PreSortField> {
    const pc = config?.presort_config;
    if (!pc || typeof pc !== 'object') return {};
    if ('fields' in pc) {
        return (pc as { fields?: Record<string, PreSortField> }).fields ?? {};
    }
    return pc as Record<string, PreSortField>;
}

export function postsortConfig(config: ConfigLike): PostsortConfig | undefined {
    const pc = config?.postsort_config;
    if (!pc || typeof pc !== 'object') return undefined;
    return pc as PostsortConfig;
}

/** Steps from a config, designer draft, or a translation-like object. */
export function processSteps(source: ConfigLike): ProcessStep[] {
    const ps = source?.process_steps;
    return Array.isArray(ps) ? (ps as ProcessStep[]) : [];
}
