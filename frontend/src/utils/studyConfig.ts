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
