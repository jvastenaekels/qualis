/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenaekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { useAuthStore } from '@/store/useAuthStore';
import type { ProjectRole } from '@/api/model/projectRole';

type Permission =
    | 'project:delete'
    | 'project:manage_team'
    | 'project:settings'
    | 'study:create'
    | 'study:delete'
    | 'study:edit_design'
    | 'study:edit_settings'
    | 'study:view_data'
    | 'study:launch_recruitment';

/**
 * Permission matrix based on project roles.
 *
 * Roles:
 * - owner: full control. One per project; set at creation, immutable via API.
 * - member: edits studies and concourses but cannot manage the team or delete the project.
 * - viewer: read-only.
 */
const PERMISSION_MATRIX: Record<ProjectRole, Set<Permission>> = {
    owner: new Set([
        'project:delete',
        'project:manage_team',
        'project:settings',
        'study:create',
        'study:delete',
        'study:edit_design',
        'study:edit_settings',
        'study:view_data',
        'study:launch_recruitment',
    ]),
    member: new Set([
        'study:create',
        'study:delete',
        'study:edit_design',
        'study:edit_settings',
        'study:view_data',
        'study:launch_recruitment',
    ]),
    viewer: new Set(['study:view_data']),
};

export function usePermission() {
    const { currentProject } = useAuthStore();

    const hasPermission = (permission: Permission): boolean => {
        if (!currentProject?.user_role) {
            return false;
        }
        const role = currentProject.user_role as ProjectRole;
        const rolePermissions = PERMISSION_MATRIX[role];
        return rolePermissions?.has(permission) || false;
    };

    return {
        can: hasPermission,
        cannot: (permission: Permission) => !hasPermission(permission),
        role: currentProject?.user_role,
        isOwner: currentProject?.user_role === 'owner',
        isMember: currentProject?.user_role === 'member',
        isViewer: currentProject?.user_role === 'viewer',
    };
}
