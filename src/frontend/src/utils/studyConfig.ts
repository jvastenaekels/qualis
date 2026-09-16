import type { PresortConfig } from '@/api/model';
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

/**
 * The canonical pre-sort config: `{ enabled, fields, ...rest }`.
 *
 * The backend guarantees this shape on every read since migration
 * `normalise_presort_config_shape` (and `PresortConfig`'s validator on every
 * write). The frontend still meets the older flat field map in two places a
 * migration cannot reach — a designer draft or a participant config cached
 * in the browser before that deploy — so this is the ONE function that
 * knows the flat form. Everything else reads through `presortFields` /
 * `isPresortEnabled` and writes through the object this returns.
 *
 * Always returns a fresh object (callers mutate it inside `updateDraft`).
 */
export function normalisePresortConfig(raw: unknown): PresortConfig & {
    enabled: boolean;
    fields: Record<string, unknown>;
} {
    if (!raw || typeof raw !== 'object') return { enabled: true, fields: {} };
    const obj = raw as Record<string, unknown>;
    if ('enabled' in obj || 'fields' in obj) {
        return {
            ...obj,
            enabled: obj.enabled !== false,
            fields: (obj.fields as Record<string, unknown> | undefined) ?? {},
        };
    }
    return { enabled: true, fields: obj };
}

export const isPresortEnabled = (config: PresortLike | null | undefined): boolean =>
    normalisePresortConfig(config?.presort_config).enabled;

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

/** The pre-sort field map, whatever shape the config arrived in. */
export function presortFields(config: ConfigLike): Record<string, PreSortField> {
    return normalisePresortConfig(config?.presort_config).fields as Record<string, PreSortField>;
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
