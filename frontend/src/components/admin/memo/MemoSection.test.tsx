/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils/test-utils';
import { MemoSection } from './MemoSection';

vi.mock('@/api/generated', () => ({
    getConcourseMemoApiAdminConcoursesCidMemoGet: vi.fn().mockResolvedValue({
        parent_type: 'concourse',
        parent_id: 42,
        entries: [],
    }),
    getStudyMemoApiAdminStudiesSidMemoGet: vi.fn(),
    getTemplatesApiAdminMemoTemplatesGet: vi.fn().mockResolvedValue([
        { title: 'Sources canvassed', description: 'Where did the items come from?' },
    ]),
    createConcourseEntryApiAdminConcoursesCidMemoEntriesPost: vi.fn().mockResolvedValue({
        id: 1,
        parent_type: 'concourse',
        parent_id: 42,
        title: 'Sources canvassed',
        body: '',
        position: 10,
        created_at: '2026-04-30T12:00:00Z',
        updated_at: '2026-04-30T12:00:00Z',
        created_by: 1,
        last_edited_by: 1,
        comments: [],
    }),
    createStudyEntryApiAdminStudiesSidMemoEntriesPost: vi.fn(),
    updateEntryApiAdminMemoEntriesEidPatch: vi.fn(),
    deleteEntryApiAdminMemoEntriesEidDelete: vi.fn(),
    postCommentApiAdminMemoEntriesEidCommentsPost: vi.fn().mockResolvedValue({
        id: 99,
        entry_id: 1,
        user_id: 1,
        body: 'first thought',
        mentions: [],
        resolved: false,
        resolved_at: null,
        resolved_by: null,
        deleted: false,
        created_at: '2026-04-30T13:00:00Z',
        updated_at: '2026-04-30T13:00:00Z',
    }),
    updateCommentApiAdminMemoCommentsCidPatch: vi.fn(),
    deleteCommentApiAdminMemoCommentsCidDelete: vi.fn(),
    resolveCommentApiAdminMemoCommentsCidResolvePost: vi.fn(),
    unresolveCommentApiAdminMemoCommentsCidUnresolvePost: vi.fn(),
}));

vi.mock('sonner', () => ({
    toast: { error: vi.fn() },
}));

beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
});

describe('MemoSection', () => {
    it('adds an entry from a template', async () => {
        const user = userEvent.setup();
        // Re-apply default mocks after clearAllMocks
        const api = await import('@/api/generated');
        // biome-ignore lint/suspicious/noExplicitAny: test mock
        (api.getConcourseMemoApiAdminConcoursesCidMemoGet as any).mockResolvedValue({
            parent_type: 'concourse',
            parent_id: 42,
            entries: [],
        });
        // biome-ignore lint/suspicious/noExplicitAny: test mock
        (api.getTemplatesApiAdminMemoTemplatesGet as any).mockResolvedValue([
            { title: 'Sources canvassed', description: 'Where did the items come from?' },
        ]);
        // biome-ignore lint/suspicious/noExplicitAny: test mock
        (api.createConcourseEntryApiAdminConcoursesCidMemoEntriesPost as any).mockResolvedValue({
            id: 1,
            parent_type: 'concourse',
            parent_id: 42,
            title: 'Sources canvassed',
            body: '',
            position: 10,
            created_at: '2026-04-30T12:00:00Z',
            updated_at: '2026-04-30T12:00:00Z',
            created_by: 1,
            last_edited_by: 1,
            comments: [],
        });

        renderWithProviders(
            <MemoSection
                parentType="concourse"
                parentId={42}
                currentUserId={1}
                isOwner
                canEdit
                members={[{ user_id: 1, display_name: 'me' }]}
            />,
        );
        await waitFor(() =>
            expect(screen.getByText(/Insert from template/i)).toBeInTheDocument(),
        );
        await user.click(screen.getByText(/Insert from template/i));
        // Click the menu item — it appears in the Radix portal
        await user.click(await screen.findByRole('menuitem', { name: 'Sources canvassed' }));
        // After insertion the entry heading is rendered
        await waitFor(() =>
            expect(screen.getByRole('heading', { name: 'Sources canvassed' })).toBeInTheDocument(),
        );
    });

    it('posts a comment after expanding the thread', async () => {
        const user = userEvent.setup();
        const api = await import('@/api/generated');
        // biome-ignore lint/suspicious/noExplicitAny: test mock
        (api.getConcourseMemoApiAdminConcoursesCidMemoGet as any).mockResolvedValue({
            parent_type: 'concourse',
            parent_id: 42,
            entries: [
                {
                    id: 1,
                    parent_type: 'concourse',
                    parent_id: 42,
                    title: 'Sources canvassed',
                    body: '',
                    position: 10,
                    created_at: '2026-04-30T12:00:00Z',
                    updated_at: '2026-04-30T12:00:00Z',
                    created_by: 1,
                    last_edited_by: 1,
                    comments: [],
                },
            ],
        });
        // biome-ignore lint/suspicious/noExplicitAny: test mock
        (api.getTemplatesApiAdminMemoTemplatesGet as any).mockResolvedValue([]);
        // biome-ignore lint/suspicious/noExplicitAny: test mock
        (api.postCommentApiAdminMemoEntriesEidCommentsPost as any).mockResolvedValue({
            id: 99,
            entry_id: 1,
            user_id: 1,
            body: 'first thought',
            mentions: [],
            resolved: false,
            resolved_at: null,
            resolved_by: null,
            deleted: false,
            created_at: '2026-04-30T13:00:00Z',
            updated_at: '2026-04-30T13:00:00Z',
        });

        renderWithProviders(
            <MemoSection
                parentType="concourse"
                parentId={42}
                currentUserId={1}
                isOwner
                canEdit
                members={[{ user_id: 1, display_name: 'me' }]}
            />,
        );
        await waitFor(() =>
            expect(screen.getByText('Sources canvassed')).toBeInTheDocument(),
        );

        // Expand the thread
        await user.click(screen.getByText(/0 comments/i));
        const textarea = screen.getByPlaceholderText(/Write a comment/i);
        await user.type(textarea, 'first thought');
        await user.click(screen.getByRole('button', { name: /Post/i }));

        await waitFor(() =>
            expect(screen.getByText('first thought')).toBeInTheDocument(),
        );
    });
});
