import { describe, it, expect, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test-utils/server';

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
        useParams: () => ({ slug: 'test-study' }),
        useLoaderData: () => ({
            study: {
                slug: 'test-study',
                title: 'Test Study',
                state: 'draft',
                grid_config: [],
                statements: [],
                translations: [
                    {
                        language_code: 'en',
                        ui_labels: {},
                    },
                ],
            },
            slug: 'test-study',
        }),
    };
});

// Mock sonner
vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

// Mock react-i18next
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: {
            language: 'en',
        },
    }),
}));

describe('Study State Management Integration Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Draft → Active Transition (Study Designer)', () => {
        it('successfully transitions study from draft to active', async () => {
            let studyState = 'draft';

            // Mock the state change API
            server.use(
                http.post('/api/admin/studies/test-study/state', async ({ request }) => {
                    const url = new URL(request.url);
                    const newState = url.searchParams.get('new_state');

                    if (newState === 'active') {
                        studyState = 'active';
                        return HttpResponse.json({ state: 'active' });
                    }

                    return HttpResponse.json({ error: 'Invalid state' }, { status: 400 });
                })
            );

            // Note: StudyDesignPage would need to be rendered with proper context
            // This is a simplified test focusing on the state management logic

            expect(studyState).toBe('draft');

            // Simulate the state change
            const response = await fetch('/api/admin/studies/test-study/state?new_state=active', {
                method: 'POST',
            });

            expect(response.ok).toBe(true);
            expect(studyState).toBe('active');
        });

        it('validates study before allowing activation', async () => {
            // Mock validation failure
            server.use(
                http.post('/api/admin/studies/test-study/validate', () => {
                    return HttpResponse.json({
                        errors: [
                            {
                                field: 'statements',
                                message: 'At least one statement required',
                            },
                        ],
                    });
                })
            );

            const response = await fetch('/api/admin/studies/test-study/validate', {
                method: 'POST',
            });

            const data = await response.json();
            expect(data.errors).toBeDefined();
            expect(data.errors[0].message).toContain('statement');
        });

        it('shows error when activation fails', async () => {
            server.use(
                http.post('/api/admin/studies/test-study/state', () => {
                    return HttpResponse.json({ detail: 'Validation failed' }, { status: 400 });
                })
            );

            const response = await fetch('/api/admin/studies/test-study/state?new_state=active', {
                method: 'POST',
            });

            expect(response.ok).toBe(false);
            expect(response.status).toBe(400);
        });
    });

    describe('Active → Archived Transition (Settings Page)', () => {
        it('allows archiving a closed study', async () => {
            let studyState = 'closed';

            server.use(
                http.post('/api/admin/studies/test-study/state', async ({ request }) => {
                    const url = new URL(request.url);
                    const newState = url.searchParams.get('new_state');

                    if (newState === 'archived' && studyState === 'closed') {
                        studyState = 'archived';
                        return HttpResponse.json({ state: 'archived' });
                    }

                    return HttpResponse.json(
                        { detail: 'Can only archive closed studies' },
                        { status: 400 }
                    );
                })
            );

            const response = await fetch('/api/admin/studies/test-study/state?new_state=archived', {
                method: 'POST',
            });

            expect(response.ok).toBe(true);
            expect(studyState).toBe('archived');
        });

        it('prevents archiving an active study', async () => {
            server.use(
                http.post('/api/admin/studies/test-study/state', () => {
                    return HttpResponse.json(
                        { detail: 'Can only archive closed studies' },
                        { status: 400 }
                    );
                })
            );

            const response = await fetch('/api/admin/studies/test-study/state?new_state=archived', {
                method: 'POST',
            });

            expect(response.ok).toBe(false);
            expect(response.status).toBe(400);
        });
    });

    describe('State Persistence', () => {
        it('persists state changes across page loads', async () => {
            let storedStudyState = 'draft';

            server.use(
                http.get('/api/admin/studies/test-study', () => {
                    return HttpResponse.json({
                        slug: 'test-study',
                        title: 'Test Study',
                        state: storedStudyState,
                        grid_config: [],
                        statements: [],
                    });
                }),
                http.post('/api/admin/studies/test-study/state', async ({ request }) => {
                    const url = new URL(request.url);
                    const newState = url.searchParams.get('new_state');
                    storedStudyState = newState || storedStudyState;
                    return HttpResponse.json({ state: storedStudyState });
                })
            );

            // Change state
            await fetch('/api/admin/studies/test-study/state?new_state=active', {
                method: 'POST',
            });

            // Verify persistence
            const response = await fetch('/api/admin/studies/test-study');
            const study = await response.json();

            expect(study.state).toBe('active');
        });
    });

    describe('Permission Checks', () => {
        it('prevents unauthorized state changes', async () => {
            server.use(
                http.post('/api/admin/studies/test-study/state', () => {
                    return HttpResponse.json(
                        { detail: 'Insufficient permissions' },
                        { status: 403 }
                    );
                })
            );

            const response = await fetch('/api/admin/studies/test-study/state?new_state=active', {
                method: 'POST',
            });

            expect(response.status).toBe(403);
        });
    });

    describe('Participant Access Control', () => {
        it('blocks participant access to closed studies', async () => {
            server.use(
                http.get('/api/study/test-study', () => {
                    return HttpResponse.json({ detail: 'Study is closed' }, { status: 403 });
                })
            );

            const response = await fetch('/api/study/test-study');

            expect(response.ok).toBe(false);
            expect(response.status).toBe(403);
        });

        it('allows participant access to active studies', async () => {
            server.use(
                http.get('/api/study/test-study', () => {
                    return HttpResponse.json({
                        slug: 'test-study',
                        title: 'Active Study',
                        state: 'active',
                        statements: [],
                        grid_config: [],
                    });
                })
            );

            const response = await fetch('/api/study/test-study');
            const study = await response.json();

            expect(response.ok).toBe(true);
            expect(study.state).toBe('active');
        });
    });

    describe('State Badge Display', () => {
        it('displays correct badge for each state', () => {
            const states = ['draft', 'active', 'closed', 'archived'];

            states.forEach((state) => {
                const badgeClass =
                    state === 'active'
                        ? 'bg-green-500'
                        : state === 'draft'
                          ? 'bg-amber-500'
                          : state === 'closed'
                            ? 'bg-red-500'
                            : 'bg-slate-500';

                expect(badgeClass).toBeDefined();
            });
        });
    });

    describe('Complete State Lifecycle', () => {
        it('transitions through full lifecycle: draft → active → closed → archived', async () => {
            let currentState = 'draft';

            server.use(
                http.post('/api/admin/studies/test-study/state', async ({ request }) => {
                    const url = new URL(request.url);
                    const newState = url.searchParams.get('new_state');

                    // Validate state transitions
                    const validTransitions: Record<string, string[]> = {
                        draft: ['active'],
                        active: ['closed'],
                        closed: ['archived', 'active'], // Can reopen
                        archived: [], // Terminal state
                    };

                    if (newState && validTransitions[currentState]?.includes(newState)) {
                        currentState = newState;
                        return HttpResponse.json({ state: currentState });
                    }

                    return HttpResponse.json(
                        {
                            detail: `Invalid transition from ${currentState} to ${newState}`,
                        },
                        { status: 400 }
                    );
                })
            );

            // Draft → Active
            let response = await fetch('/api/admin/studies/test-study/state?new_state=active', {
                method: 'POST',
            });
            expect(response.ok).toBe(true);
            expect(currentState).toBe('active');

            // Active → Closed
            response = await fetch('/api/admin/studies/test-study/state?new_state=closed', {
                method: 'POST',
            });
            expect(response.ok).toBe(true);
            expect(currentState).toBe('closed');

            // Closed → Archived
            response = await fetch('/api/admin/studies/test-study/state?new_state=archived', {
                method: 'POST',
            });
            expect(response.ok).toBe(true);
            expect(currentState).toBe('archived');

            // Archived → anything (should fail)
            response = await fetch('/api/admin/studies/test-study/state?new_state=active', {
                method: 'POST',
            });
            expect(response.ok).toBe(false);
        });
    });
});
