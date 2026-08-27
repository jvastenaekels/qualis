interface AccessRulesValues {
    passwordEnabled: boolean;
    accessPassword?: string | null;
    startDate?: string | null;
    endDate?: string | null;
}

interface BuildOpts {
    isSlugLocked: boolean;
}

/**
 * Build the partial study-update payload for the recruitment "access rules"
 * form. Password edits are only valid in draft (unlocked) state — outside
 * draft, the backend whitelist accepts only start_date/end_date, so this
 * helper omits `access_password` entirely instead of sending a no-op null
 * that would trigger a 422.
 */
export function buildAccessRulesUpdate(
    data: AccessRulesValues,
    opts: BuildOpts
): Record<string, unknown> {
    const update: Record<string, unknown> = {};

    if (!opts.isSlugLocked) {
        if (!data.passwordEnabled) {
            update.access_password = null;
        } else if (data.accessPassword) {
            update.access_password = data.accessPassword;
        }
    }

    update.start_date = data.startDate ? new Date(data.startDate).toISOString() : null;
    update.end_date = data.endDate ? new Date(data.endDate).toISOString() : null;
    return update;
}
