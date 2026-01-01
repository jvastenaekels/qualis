import { HttpResponse, http } from 'msw';

export const handlers = [
    http.get('*/api/study/:slug', ({ params }) => {
        return HttpResponse.json({
            slug: params.slug,
            title: 'Demo Study',
            description: 'A study for testing',
            instructions: 'Please sort the cards',
            language_code: 'en',
            statements: [
                { id: 1, text: 'Statement 1' },
                { id: 2, text: 'Statement 2' },
                { id: 3, text: 'Statement 3' },
            ],
            grid_config: [
                { score: -1, capacity: 1 },
                { score: 0, capacity: 1 },
                { score: 1, capacity: 1 },
            ],
            presort_config: {},
        });
    }),

    http.post('*/api/study/:slug/submit', () => {
        return HttpResponse.json({ confirmation_code: 'TEST-CODE' });
    }),

    http.post('*/api/study/:slug/consent', () => {
        return HttpResponse.json({ status: 'ok' });
    }),

    http.post('*/api/logs', () => {
        return HttpResponse.json({ status: 'ok' });
    }),
];
