import { useOutletContext } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import type { ProjectWithRole } from '@/api/model/projectWithRole';
import type { StudyRead } from '@/api/model';

interface AdminContext {
    project?: ProjectWithRole;
    study?: StudyRead;
}

/**
 * useAdminContext
 *
 * Safely consumes routing context with fallbacks to global stores.
 * Prevents crashes during hydration or deep-linking if React Router context is temporarily undefined.
 */
export function useAdminContext() {
    const context = useOutletContext<AdminContext>() || {};
    const { currentProject: storeProject } = useAuthStore();

    return {
        project: context.project || (storeProject as ProjectWithRole | undefined),
        study: context.study,
    };
}
