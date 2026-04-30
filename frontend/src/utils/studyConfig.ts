import type { StudyConfig } from '../schemas/study';

export const isPresortEnabled = (config: StudyConfig | null): boolean => {
    if (!config?.presort_config) return true;
    if ('enabled' in config.presort_config) {
        return config.presort_config.enabled !== false;
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
export const isRoughSortEnabled = (config: StudyConfig | null): boolean => {
    if (!config) return true;
    return config.rough_sort_enabled !== false;
};
