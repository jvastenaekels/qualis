import type { StudyUpdate } from '@/api/model';

export interface MergeResult {
    success: boolean;
    merged?: StudyUpdate;
    conflicts?: string[];
}

/**
 * Merges a local draft with a new server state, using the original state as a baseline.
 * Returns success with merged object, or failure with list of conflicting fields.
 */
export function mergeStudyUpdates(
    local: StudyUpdate,
    server: StudyUpdate,
    baseline: StudyUpdate | null
): MergeResult {
    if (!baseline) {
        // No baseline means we can't do a 3-way merge correctly without assume everything is a conflict or everything is overwrite.
        // Safer to fail.
        return { success: false, conflicts: ['Full Study (No Baseline)'] };
    }

    const merged: StudyUpdate = { ...local };
    const conflicts: string[] = [];

    // Fields to ignore or handle specially
    const ignoredFields = ['last_updated_at', 'translations', 'statements', 'grid_config'];

    // 1. Simple Fields
    const keys = Object.keys(local) as (keyof StudyUpdate)[];

    for (const key of keys) {
        if (ignoredFields.includes(key)) continue;

        const localVal = JSON.stringify(local[key]);
        const baseVal = JSON.stringify(baseline[key]);
        const serverVal = JSON.stringify(server[key]);

        const localChanged = localVal !== baseVal;
        const serverChanged = serverVal !== baseVal;

        if (serverChanged) {
            if (!localChanged) {
                // Safe update: Server changed, Local didn't. Accept Server.
                // @ts-expect-error
                merged[key] = server[key];
            } else if (localVal !== serverVal) {
                // Conflict: Both changed to different values
                conflicts.push(key);
            }
        }
    }

    // 2. Grid Config
    // Grid is sensitive. If server changed grid, and local changed grid, big conflict.
    if (JSON.stringify(server.grid_config) !== JSON.stringify(baseline.grid_config)) {
        if (JSON.stringify(local.grid_config) !== JSON.stringify(baseline.grid_config)) {
            if (JSON.stringify(local.grid_config) !== JSON.stringify(server.grid_config)) {
                conflicts.push('grid_config');
            }
        } else {
            merged.grid_config = server.grid_config;
        }
    }

    // 3. Statements (Array Merge by Code)
    // We assume 'code' is the stable identifier for statements in the Designer.
    // If server added/removed, and local added/removed...
    // Strategy: Union of codes.
    // If conflict on content (text) for same code -> Flag conflict.

    // TODO: Complex array merging logic.
    // For "Super Friendly" v1, let's be conservative:
    // If BOTH touched the statements list, flag conflict.
    // Ideally we dive deep, but let's see.

    const localStatementsJson = JSON.stringify(local.statements);
    const baseStatementsJson = JSON.stringify(baseline.statements);
    const serverStatementsJson = JSON.stringify(server.statements);

    if (serverStatementsJson !== baseStatementsJson) {
        if (localStatementsJson !== baseStatementsJson) {
            if (localStatementsJson !== serverStatementsJson) {
                conflicts.push('statements');
                // We could implement smarter merge here later
            }
        } else {
            merged.statements = server.statements;
        }
    }

    // 4. Translations (Array Merge by Language Code)
    const localTransJson = JSON.stringify(local.translations);
    const baseTransJson = JSON.stringify(baseline.translations);
    const serverTransJson = JSON.stringify(server.translations);

    if (serverTransJson !== baseTransJson) {
        if (localTransJson !== baseTransJson) {
            if (localTransJson !== serverTransJson) {
                conflicts.push('translations');
            }
        } else {
            merged.translations = server.translations;
        }
    }

    // Always take the server's timestamp
    merged.last_updated_at = server.last_updated_at;

    if (conflicts.length > 0) {
        return { success: false, conflicts };
    }

    return { success: true, merged };
}
