import {
    getGetStudyApiAdminStudiesSlugGetMockHandler,
    getGetStudyApiStudySlugGetMockHandler,
    getQualisAPIMock,
} from '../api/generated';
import type { StudyRead } from '../api/model';

const demoStudy: StudyRead = {
    id: 1,
    slug: 'demo-study',
    state: 'draft',
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
        {
            id: 1,
            code: 's1',
            translations: [{ id: 1, statement_id: 1, language_code: 'en', text: 'Statement 1' }],
        },
        {
            id: 2,
            code: 's2',
            translations: [{ id: 2, statement_id: 2, language_code: 'en', text: 'Statement 2' }],
        },
        {
            id: 3,
            code: 's3',
            translations: [{ id: 3, statement_id: 3, language_code: 'en', text: 'Statement 3' }],
        },
    ],
    grid_config: [
        { score: -1, capacity: 1 },
        { score: 0, capacity: 1 },
        { score: 1, capacity: 1 },
    ],
    presort_config: {},
    postsort_config: {},
};

export const handlers = [
    // Specific overrides — cast via unknown for the public study endpoint
    // because the backend currently returns dict[str, Any] without a
    // response_model, so orval types it as an opaque dict that doesn't
    // structurally overlap with StudyRead.
    getGetStudyApiAdminStudiesSlugGetMockHandler(demoStudy),
    getGetStudyApiStudySlugGetMockHandler(demoStudy as unknown as never),

    // Fallback to auto-generated mocks for everything else
    ...getQualisAPIMock(),
];
