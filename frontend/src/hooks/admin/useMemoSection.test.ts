/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * useMemoSection unit tests
 *
 * Note on mock shapes: customInstance<T> returns Promise<T> directly (no { data }
 * envelope), so all mocks resolve to the value directly.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMemoSection } from './useMemoSection';

vi.mock('@/api/generated', () => ({
    getConcourseMemoApiAdminConcoursesCidMemoGet: vi.fn(),
    getStudyMemoApiAdminStudiesSidMemoGet: vi.fn(),
    getTemplatesApiAdminMemoTemplatesGet: vi.fn(),
    createConcourseEntryApiAdminConcoursesCidMemoEntriesPost: vi.fn(),
    createStudyEntryApiAdminStudiesSidMemoEntriesPost: vi.fn(),
    updateEntryApiAdminMemoEntriesEidPatch: vi.fn(),
    deleteEntryApiAdminMemoEntriesEidDelete: vi.fn(),
    postCommentApiAdminMemoEntriesEidCommentsPost: vi.fn(),
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

const buildEmptyMemo = () => ({
    parent_type: 'concourse' as const,
    parent_id: 42,
    entries: [],
});

describe('useMemoSection', () => {
    it('fetches memo on mount', async () => {
        const api = await import('@/api/generated');
        // biome-ignore lint/suspicious/noExplicitAny: test mock
        (api.getConcourseMemoApiAdminConcoursesCidMemoGet as any).mockResolvedValue(
            buildEmptyMemo()
        );
        // biome-ignore lint/suspicious/noExplicitAny: test mock
        (api.getTemplatesApiAdminMemoTemplatesGet as any).mockResolvedValue([]);
        const { result } = renderHook(() =>
            useMemoSection({
                parentType: 'concourse',
                parentId: 42,
                currentUserId: 1,
                projectMembers: [],
            })
        );
        await waitFor(() => expect(result.current.entries).toEqual([]));
    });

    it('computes unread count from comments newer than localStorage timestamp', async () => {
        const api = await import('@/api/generated');
        // biome-ignore lint/suspicious/noExplicitAny: test mock
        (api.getConcourseMemoApiAdminConcoursesCidMemoGet as any).mockResolvedValue({
            parent_type: 'concourse',
            parent_id: 42,
            entries: [
                {
                    id: 1,
                    title: 't',
                    body: '',
                    position: 10,
                    parent_type: 'concourse',
                    parent_id: 42,
                    created_at: '2026-04-30T09:00:00Z',
                    updated_at: '2026-04-30T09:00:00Z',
                    created_by: 2,
                    last_edited_by: 2,
                    comments: [
                        {
                            id: 10,
                            entry_id: 1,
                            user_id: 2,
                            body: 'first',
                            mentions: [],
                            resolved: false,
                            resolved_at: null,
                            resolved_by: null,
                            deleted: false,
                            created_at: '2026-04-30T10:00:00Z',
                            updated_at: '2026-04-30T10:00:00Z',
                        },
                        {
                            id: 11,
                            entry_id: 1,
                            user_id: 2,
                            body: 'second',
                            mentions: [],
                            resolved: false,
                            resolved_at: null,
                            resolved_by: null,
                            deleted: false,
                            created_at: '2026-04-30T11:00:00Z',
                            updated_at: '2026-04-30T11:00:00Z',
                        },
                    ],
                },
            ],
        });
        // biome-ignore lint/suspicious/noExplicitAny: test mock
        (api.getTemplatesApiAdminMemoTemplatesGet as any).mockResolvedValue([]);

        // Set last seen between the two comments — only the second is unread.
        localStorage.setItem('memo-last-seen:1:concourse:42', '2026-04-30T10:30:00Z');

        const { result } = renderHook(() =>
            useMemoSection({
                parentType: 'concourse',
                parentId: 42,
                currentUserId: 1,
                projectMembers: [],
            })
        );
        await waitFor(() => expect(result.current.unreadCount).toBe(1));
    });

    it('mentionsForYou filters to comments mentioning current user, unresolved, unread', async () => {
        const api = await import('@/api/generated');
        // biome-ignore lint/suspicious/noExplicitAny: test mock
        (api.getConcourseMemoApiAdminConcoursesCidMemoGet as any).mockResolvedValue({
            parent_type: 'concourse',
            parent_id: 42,
            entries: [
                {
                    id: 1,
                    title: 't',
                    body: '',
                    position: 10,
                    parent_type: 'concourse',
                    parent_id: 42,
                    created_at: '2026-04-30T09:00:00Z',
                    updated_at: '2026-04-30T09:00:00Z',
                    created_by: 2,
                    last_edited_by: 2,
                    comments: [
                        {
                            id: 10,
                            entry_id: 1,
                            user_id: 2,
                            body: 'hi @1',
                            mentions: [1, 2],
                            resolved: false,
                            resolved_at: null,
                            resolved_by: null,
                            deleted: false,
                            created_at: '2026-04-30T10:00:00Z',
                            updated_at: '2026-04-30T10:00:00Z',
                        },
                        {
                            id: 11,
                            entry_id: 1,
                            user_id: 2,
                            body: 'hi @2',
                            mentions: [2],
                            resolved: false,
                            resolved_at: null,
                            resolved_by: null,
                            deleted: false,
                            created_at: '2026-04-30T10:00:00Z',
                            updated_at: '2026-04-30T10:00:00Z',
                        },
                    ],
                },
            ],
        });
        // biome-ignore lint/suspicious/noExplicitAny: test mock
        (api.getTemplatesApiAdminMemoTemplatesGet as any).mockResolvedValue([]);

        const { result } = renderHook(() =>
            useMemoSection({
                parentType: 'concourse',
                parentId: 42,
                currentUserId: 1,
                projectMembers: [],
            })
        );
        await waitFor(() => expect(result.current.mentionsForYou).toHaveLength(1));
        expect(result.current.mentionsForYou[0].id).toBe(10);
    });

    it('addEntry calls API and merges into entries', async () => {
        const api = await import('@/api/generated');
        // biome-ignore lint/suspicious/noExplicitAny: test mock
        (api.getConcourseMemoApiAdminConcoursesCidMemoGet as any).mockResolvedValue(
            buildEmptyMemo()
        );
        // biome-ignore lint/suspicious/noExplicitAny: test mock
        (api.getTemplatesApiAdminMemoTemplatesGet as any).mockResolvedValue([]);
        // biome-ignore lint/suspicious/noExplicitAny: test mock
        (api.createConcourseEntryApiAdminConcoursesCidMemoEntriesPost as any).mockResolvedValue({
            id: 99,
            parent_type: 'concourse',
            parent_id: 42,
            title: 'N',
            body: '',
            position: 10,
            created_at: '2026-04-30T12:00:00Z',
            updated_at: '2026-04-30T12:00:00Z',
            created_by: 1,
            last_edited_by: 1,
            comments: [],
        });

        const { result } = renderHook(() =>
            useMemoSection({
                parentType: 'concourse',
                parentId: 42,
                currentUserId: 1,
                projectMembers: [],
            })
        );
        await waitFor(() => expect(result.current.entries).toEqual([]));
        await act(async () => {
            await result.current.addEntry({ title: 'N', body: '' });
        });
        expect(result.current.entries.find((e) => e.id === 99)).toBeTruthy();
    });

    it('markSeen bumps localStorage and clears unread', async () => {
        const api = await import('@/api/generated');
        // Comment timestamp is in the past (before "now") but after epoch — so it's
        // unread initially (lastSeenAt = epoch), and markSeen() sets lastSeenAt to
        // current time which is after the comment, making unreadCount drop to 0.
        const pastTimestamp = '2020-01-01T00:00:00Z';
        // biome-ignore lint/suspicious/noExplicitAny: test mock
        (api.getConcourseMemoApiAdminConcoursesCidMemoGet as any).mockResolvedValue({
            parent_type: 'concourse',
            parent_id: 42,
            entries: [
                {
                    id: 1,
                    title: 't',
                    body: '',
                    position: 10,
                    parent_type: 'concourse',
                    parent_id: 42,
                    created_at: pastTimestamp,
                    updated_at: pastTimestamp,
                    created_by: 2,
                    last_edited_by: 2,
                    comments: [
                        {
                            id: 10,
                            entry_id: 1,
                            user_id: 2,
                            body: 'first',
                            mentions: [],
                            resolved: false,
                            resolved_at: null,
                            resolved_by: null,
                            deleted: false,
                            created_at: pastTimestamp,
                            updated_at: pastTimestamp,
                        },
                    ],
                },
            ],
        });
        // biome-ignore lint/suspicious/noExplicitAny: test mock
        (api.getTemplatesApiAdminMemoTemplatesGet as any).mockResolvedValue([]);

        const { result } = renderHook(() =>
            useMemoSection({
                parentType: 'concourse',
                parentId: 42,
                currentUserId: 1,
                projectMembers: [],
            })
        );
        await waitFor(() => expect(result.current.unreadCount).toBe(1));
        act(() => {
            result.current.markSeen();
        });
        await waitFor(() => expect(result.current.unreadCount).toBe(0));
    });
});
