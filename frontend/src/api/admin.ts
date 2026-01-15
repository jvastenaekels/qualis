import {
    updateStudyApiAdminStudiesSlugPatch,
    changeStudyStateApiAdminStudiesSlugStatePost,
    deleteStudyApiAdminStudiesSlugDelete,
} from './generated';
import type { StudyState } from './model';
import type { StudyUpdate } from './model';

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
};
