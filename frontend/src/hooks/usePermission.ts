/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
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
 * Permission matrix based on project roles
 *
 * Roles:
 * - owner: Full control over project and all studies
 * - researcher: Can create and edit studies, but cannot manage project team
 * - viewer: Read-only access
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
    researcher: new Set([
        'study:create',
        'study:delete',
        'study:edit_design',
        'study:edit_settings',
        'study:view_data',
        'study:launch_recruitment',
    ]),
    viewer: new Set(['study:view_data']),
};

/**
 * Hook to check user permissions based on project role
 */
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

    const can = (permission: Permission): boolean => hasPermission(permission);
    const cannot = (permission: Permission): boolean => !hasPermission(permission);

    return {
        can,
        cannot,
        role: currentProject?.user_role,
        isOwner: currentProject?.user_role === 'owner',
        isResearcher: currentProject?.user_role === 'researcher',
        isViewer: currentProject?.user_role === 'viewer',
    };
}
