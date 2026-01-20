import {
    updateStudyApiAdminStudiesSlugPatch,
    changeStudyStateApiAdminStudiesSlugStatePost,
    deleteStudyApiAdminStudiesSlugDelete,
} from './generated';
import type { StudyState } from './model';
import type { StudyUpdate } from './model';
import { useAuthStore } from '../store/useAuthStore';

export const AdminService = {
    /**
     * Update study configuration (title, slug, dates, etc)
     */
    updateStudy: async (slug: string, data: StudyUpdate) => {
        return updateStudyApiAdminStudiesSlugPatch(slug, data);
    },

    /**
     * Change study lifecycle state (draft, active, closed, archived)
     */
    updateStudyState: async (slug: string, newState: string) => {
        // Cast string to StudyState enum if needed, generated types should handle it
        return changeStudyStateApiAdminStudiesSlugStatePost(slug, {
            new_state: newState as StudyState,
        });
    },

    /**
     * Permanently delete a study
     */
    deleteStudy: async (slug: string) => {
        return deleteStudyApiAdminStudiesSlugDelete(slug);
    },

    /**
     * Reset/Delete all participants for a study
     */
    resetStudyParticipants: async (slug: string) => {
        const response = await fetch(`/api/admin/studies/${slug}/reset`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${useAuthStore.getState().token}`,
            },
        });
        if (!response.ok) throw new Error('Failed to reset participants');
    },

    /**
     * Export study configuration as JSON
     */
    exportStudyConfig: async (slug: string) => {
        const response = await fetch(`/api/admin/studies/${slug}/export/config`, {
            headers: {
                Authorization: `Bearer ${useAuthStore.getState().token}`,
            },
        });
        if (!response.ok) throw new Error('Failed to export configuration');
        return response.json();
    },

    /**
     * Validate study configuration for import
     */
    validateStudyImport: async (config: unknown) => {
        const response = await fetch('/api/admin/studies/validate-import', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${useAuthStore.getState().token}`,
                'X-Workspace-ID': String(useAuthStore.getState().currentWorkspace?.id),
            },
            body: JSON.stringify(config),
        });
        if (!response.ok) throw new Error('Validation failed');
        return { data: await response.json() };
    },

    /**
     * Import study configuration and create new study
     */
    importStudyConfig: async (data: { config: unknown; new_slug: string }) => {
        const response = await fetch('/api/admin/studies/import', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${useAuthStore.getState().token}`,
                'X-Workspace-ID': String(useAuthStore.getState().currentWorkspace?.id),
            },
            body: JSON.stringify(data),
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Import failed');
        }
        return { data: await response.json() };
    },
};
