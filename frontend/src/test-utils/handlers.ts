import {
    getGetStudyApiAdminStudiesSlugGetMockHandler,
    getGetStudyApiStudySlugGetMockHandler,
    getQualisAPIMock,
} from '../api/generated';
import type { StudyRead } from '../api/model';
import type { StudyConfig } from '../schemas/study';

// Two fixtures because admin and public endpoints return different shapes:
//   GET /api/admin/studies/{slug}      → StudyRead (translations[] arrays)
//   GET /api/study/{slug}              → flat StudyConfig (server resolves
//                                        translations into top-level fields)
// Tests render at /study/demo, so the public fixture must echo the URL slug
// AND match the flat shape useStudyConfig consumes.

const demoAdminStudy: StudyRead = {
    id: 1,
    slug: 'demo',
    state: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    project_id: 1,
    default_language: 'en',
    translations: [
        {
            id: 1,
            study_id: 1,
            language_code: 'en',
            title: 'Demo Study',
            description: 'A study for testing',
            instructions: 'Please sort the cards',
            ui_labels: {},
        },
    ],
    statements: [
        { id: 1, code: 's1', translations: [{ id: 1, statement_id: 1, language_code: 'en', text: 'Statement 1' }] },
        { id: 2, code: 's2', translations: [{ id: 2, statement_id: 2, language_code: 'en', text: 'Statement 2' }] },
        { id: 3, code: 's3', translations: [{ id: 3, statement_id: 3, language_code: 'en', text: 'Statement 3' }] },
    ],
    grid_config: [
        { score: -1, capacity: 1 },
        { score: 0, capacity: 1 },
        { score: 1, capacity: 1 },
    ],
    presort_config: {},
    postsort_config: {},
};

const demoPublicStudy: StudyConfig = {
    slug: 'demo',
    title: 'Demo Study',
    description: 'A study for testing',
    instructions: 'Please sort the cards',
    statements: [
        { id: 1, text: 'Statement 1', code: 's1' },
        { id: 2, text: 'Statement 2', code: 's2' },
        { id: 3, text: 'Statement 3', code: 's3' },
    ],
    grid_config: [
        { score: -1, capacity: 1 },
        { score: 0, capacity: 1 },
        { score: 1, capacity: 1 },
    ],
    presort_config: {},
    postsort_config: {},
    language: 'en',
    ui_labels: {},
} as StudyConfig;

export const handlers = [
    getGetStudyApiAdminStudiesSlugGetMockHandler(demoAdminStudy),
    getGetStudyApiStudySlugGetMockHandler(demoPublicStudy),

    ...getQualisAPIMock(),
];
