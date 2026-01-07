import type { WorkspaceRead } from '@/api/model/workspaceRead';

export interface WorkspaceWithRole extends WorkspaceRead {
    user_role: 'owner' | 'admin' | 'researcher' | 'viewer';
}
