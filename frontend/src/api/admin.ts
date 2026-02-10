import {
    updateStudyApiAdminStudiesSlugPatch,
    changeStudyStateApiAdminStudiesSlugStatePost,
    deleteStudyApiAdminStudiesSlugDelete,
} from './generated';
import { customInstance } from './mutator';
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
        await customInstance({
            url: `/api/admin/studies/${slug}/reset`,
            method: 'POST',
        });
    },

    /**
     * Export study configuration as JSON
     */
    exportStudyConfig: async (slug: string, signal?: AbortSignal) => {
        const response = await fetch(`/api/admin/studies/${slug}/export/config`, {
            headers: {
                Authorization: `Bearer ${useAuthStore.getState().token}`,
            },
            signal,
        });
        if (!response.ok) throw new Error('Failed to export configuration');
        return response.json();
    },

    /**
     * Validate study configuration for import
     */
    validateStudyImport: async (config: unknown, signal?: AbortSignal) => {
        const response = await fetch('/api/admin/studies/validate-import', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${useAuthStore.getState().token}`,
                'X-Workspace-ID': String(useAuthStore.getState().currentWorkspace?.id),
            },
            body: JSON.stringify(config),
            signal,
        });
        if (!response.ok) throw new Error('Validation failed');
        return { data: await response.json() };
    },

    /**
     * Import study configuration and create new study
     */
    importStudyConfig: async (
        data: { config: unknown; new_slug: string },
        signal?: AbortSignal
    ) => {
        const response = await fetch('/api/admin/studies/import', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${useAuthStore.getState().token}`,
                'X-Workspace-ID': String(useAuthStore.getState().currentWorkspace?.id),
            },
            body: JSON.stringify(data),
            signal,
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Import failed');
        }
        return { data: await response.json() };
    },

    /**
     * Export data as CSV
     */
    exportCSV: async (slug: string, signal?: AbortSignal) => {
        const response = await fetch(`/api/admin/studies/${slug}/export/csv`, {
            headers: {
                Authorization: `Bearer ${useAuthStore.getState().token}`,
            },
            signal,
        });
        if (!response.ok) throw new Error('Failed to export CSV');
        return response.blob();
    },

    /**
     * Export data as PQMethod (ZIP)
     */
    exportPQMethod: async (slug: string, signal?: AbortSignal) => {
        const response = await fetch(`/api/admin/studies/${slug}/export/pqmethod`, {
            headers: {
                Authorization: `Bearer ${useAuthStore.getState().token}`,
            },
            signal,
        });
        if (!response.ok) throw new Error('Failed to export PQMethod data');
        return response.blob();
    },

    /**
     * Export data as R-Kit (ZIP)
     */
    exportRKit: async (slug: string, signal?: AbortSignal) => {
        const response = await fetch(`/api/admin/studies/${slug}/export/r-kit`, {
            headers: {
                Authorization: `Bearer ${useAuthStore.getState().token}`,
            },
            signal,
        });
        if (!response.ok) throw new Error('Failed to export R-Kit data');
        return response.blob();
    },

    /**
     * Export single participant results as CSV
     */
    exportParticipantCSV: async (slug: string, participantId: number, signal?: AbortSignal) => {
        const response = await fetch(
            `/api/admin/studies/${slug}/participants/${participantId}/export/csv`,
            {
                headers: {
                    Authorization: `Bearer ${useAuthStore.getState().token}`,
                },
                signal,
            }
        );
        if (!response.ok) throw new Error('Failed to export participant CSV');
        return response.blob();
    },

    /**
     * Export single participant audio recordings as ZIP
     */
    exportParticipantAudio: async (slug: string, participantId: number, signal?: AbortSignal) => {
        const response = await fetch(
            `/api/admin/studies/${slug}/participants/${participantId}/export/audio`,
            {
                headers: {
                    Authorization: `Bearer ${useAuthStore.getState().token}`,
                },
                signal,
            }
        );
        if (!response.ok) throw new Error('Failed to export participant audio');
        return response.blob();
    },

    /**
     * Export single participant results as JSON
     */
    exportParticipantJSON: async (slug: string, participantId: number, signal?: AbortSignal) => {
        const response = await fetch(
            `/api/admin/studies/${slug}/participants/${participantId}/export/json`,
            {
                headers: {
                    Authorization: `Bearer ${useAuthStore.getState().token}`,
                },
                signal,
            }
        );
        if (!response.ok) throw new Error('Failed to export participant JSON');
        return response.json();
    },

    /**
     * Export complete research package (ZIP)
     */
    exportResearchPackage: async (slug: string, signal?: AbortSignal) => {
        const response = await fetch(`/api/admin/studies/${slug}/export/package`, {
            headers: {
                Authorization: `Bearer ${useAuthStore.getState().token}`,
            },
            signal,
        });
        if (!response.ok) throw new Error('Failed to export research package');
        return response.blob();
    },
};
