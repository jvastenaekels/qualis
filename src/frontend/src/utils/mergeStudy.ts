import type { StudyUpdate } from '@/api/model';

type ResolutionStrategy = 'manual' | 'local-wins' | 'server-wins';

export interface MergeStudyResult {
    success: boolean;
    merged?: StudyUpdate | null;
    conflicts?: string[];
    warnings?: string[];
}

/** @deprecated Use MergeStudyResult */
type MergeResult = MergeStudyResult;

/** Track of conflicts/warnings produced while resolving each field. */
interface MergeAccumulator {
    conflicts: string[];
    warnings: string[];
}

/**
 * 3-way merge for one field. Returns the value to keep (or undefined to keep local).
 * Mutates `acc` to record conflicts/warnings.
 */
function resolveField<T>(
    fieldName: string,
    localVal: T,
    baseVal: T,
    serverVal: T,
    strategy: ResolutionStrategy,
    acc: MergeAccumulator
): { take: 'local' | 'server' } {
    const localJson = JSON.stringify(localVal);
    const baseJson = JSON.stringify(baseVal);
    const serverJson = JSON.stringify(serverVal);

    const localChanged = localJson !== baseJson;
    const serverChanged = serverJson !== baseJson;

    if (!serverChanged) return { take: 'local' };

    // Server changed and local didn't — accept server.
    if (!localChanged) return { take: 'server' };

    // Both changed to the same value — no conflict.
    if (localJson === serverJson) return { take: 'local' };

    // Both changed to different values — conflict, resolved per strategy.
    if (strategy === 'local-wins') {
        acc.warnings.push(fieldName);
        return { take: 'local' };
    }
    if (strategy === 'server-wins') {
        acc.warnings.push(fieldName);
        return { take: 'server' };
    }
    acc.conflicts.push(fieldName);
    return { take: 'local' };
}

const IGNORED_SIMPLE_FIELDS = new Set<keyof StudyUpdate>([
    'last_updated_at',
    'translations',
    'statements',
    'grid_config',
]);

function mergeSimpleFields(
    merged: StudyUpdate,
    local: StudyUpdate,
    server: StudyUpdate,
    baseline: StudyUpdate,
    strategy: ResolutionStrategy,
    acc: MergeAccumulator
): void {
    for (const key of Object.keys(local) as (keyof StudyUpdate)[]) {
        if (IGNORED_SIMPLE_FIELDS.has(key)) continue;
        const decision = resolveField(key, local[key], baseline[key], server[key], strategy, acc);
        if (decision.take === 'server') {
            // @ts-expect-error key is a valid StudyUpdate key
            merged[key] = server[key];
        }
    }
}

/**
 * Merges a local draft with a new server state, using the original state as a baseline.
 * Returns success with merged object, or failure with list of conflicting fields.
 */
export function mergeStudyUpdates(
    local: StudyUpdate,
    server: StudyUpdate,
    baseline: StudyUpdate | null,
    strategy: ResolutionStrategy = 'manual'
): MergeResult {
    if (!baseline) {
        if (strategy === 'local-wins') {
            return {
                success: true,
                merged: { ...local, last_updated_at: server.last_updated_at },
                warnings: ['Baselineless merge (Local Wins)'],
            };
        }
        return { success: false, conflicts: ['Full Study (No Baseline)'] };
    }

    const merged: StudyUpdate = { ...local };
    const acc: MergeAccumulator = { conflicts: [], warnings: [] };

    mergeSimpleFields(merged, local, server, baseline, strategy, acc);

    const grid = resolveField(
        'grid_config',
        local.grid_config,
        baseline.grid_config,
        server.grid_config,
        strategy,
        acc
    );
    if (grid.take === 'server') merged.grid_config = server.grid_config;

    const statements = resolveField(
        'statements',
        local.statements,
        baseline.statements,
        server.statements,
        strategy,
        acc
    );
    if (statements.take === 'server') merged.statements = server.statements;

    const translations = resolveField(
        'translations',
        local.translations,
        baseline.translations,
        server.translations,
        strategy,
        acc
    );
    if (translations.take === 'server') merged.translations = server.translations;

    merged.last_updated_at = server.last_updated_at;

    if (acc.conflicts.length > 0) {
        return { success: false, conflicts: acc.conflicts };
    }

    return { success: true, merged, warnings: acc.warnings };
}
