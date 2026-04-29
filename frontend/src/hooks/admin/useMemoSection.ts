/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * useMemoSection hook
 *
 * Encapsulates data fetch, derived state, and optimistic mutations for the
 * MemoSection component. The component receives this hook's return value and
 * renders JSX from it.
 *
 * Note on orval wrapper shape: customInstance<T> returns Promise<T> directly
 * (no { data } envelope). All API calls are awaited to their value type.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
    createConcourseEntryApiAdminConcoursesCidMemoEntriesPost,
    createStudyEntryApiAdminStudiesSidMemoEntriesPost,
    deleteCommentApiAdminMemoCommentsCidDelete,
    deleteEntryApiAdminMemoEntriesEidDelete,
    getConcourseMemoApiAdminConcoursesCidMemoGet,
    getStudyMemoApiAdminStudiesSidMemoGet,
    getTemplatesApiAdminMemoTemplatesGet,
    postCommentApiAdminMemoEntriesEidCommentsPost,
    resolveCommentApiAdminMemoCommentsCidResolvePost,
    unresolveCommentApiAdminMemoCommentsCidUnresolvePost,
    updateCommentApiAdminMemoCommentsCidPatch,
    updateEntryApiAdminMemoEntriesEidPatch,
} from '@/api/generated';
import type {
    MemoCommentRead,
    MemoEntryCreate,
    MemoEntryRead,
    MemoEntryUpdate,
    MemoRead,
    MemoTemplate,
} from '@/api/model';
import { bumpLastSeen, getLastSeen } from '@/components/admin/memo/memoLastSeen';

export interface ProjectMemberLite {
    user_id: number;
    display_name: string;
}

export type MemoParentType = 'concourse' | 'study';

interface UseMemoSectionArgs {
    parentType: MemoParentType;
    parentId: number;
    currentUserId: number;
    projectMembers: ProjectMemberLite[];
}

export function useMemoSection({
    parentType,
    parentId,
    currentUserId,
    projectMembers,
}: UseMemoSectionArgs) {
    const [memo, setMemo] = useState<MemoRead | null>(null);
    const [templates, setTemplates] = useState<MemoTemplate[]>([]);
    const [showResolved, setShowResolved] = useState(false);
    const [lastSeenAt, setLastSeenAt] = useState(() =>
        getLastSeen(currentUserId, parentType, parentId)
    );

    const fetchMemo = useCallback(async (): Promise<MemoRead> => {
        const result =
            parentType === 'concourse'
                ? await getConcourseMemoApiAdminConcoursesCidMemoGet(parentId)
                : await getStudyMemoApiAdminStudiesSidMemoGet(parentId);
        return result;
    }, [parentType, parentId]);

    useEffect(() => {
        let cancelled = false;
        fetchMemo()
            .then((m) => {
                if (!cancelled) setMemo(m);
            })
            .catch(() => {
                if (!cancelled) toast.error('Memo load failed');
            });
        getTemplatesApiAdminMemoTemplatesGet({ parent_type: parentType })
            .then((res) => {
                if (!cancelled) setTemplates(res);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [fetchMemo, parentType]);

    const entries: MemoEntryRead[] = useMemo(() => memo?.entries ?? [], [memo]);

    const allComments: MemoCommentRead[] = useMemo(
        () => entries.flatMap((e) => e.comments),
        [entries]
    );

    const unreadCount = useMemo(
        () =>
            allComments.filter(
                (c) => !c.deleted && c.created_at > lastSeenAt && c.user_id !== currentUserId
            ).length,
        [allComments, lastSeenAt, currentUserId]
    );

    const mentionsForYou = useMemo(
        () =>
            allComments.filter(
                (c) =>
                    !c.deleted &&
                    !c.resolved &&
                    c.mentions.includes(currentUserId) &&
                    c.created_at > lastSeenAt
            ),
        [allComments, currentUserId, lastSeenAt]
    );

    const markSeen = useCallback(() => {
        bumpLastSeen(currentUserId, parentType, parentId);
        setLastSeenAt(new Date().toISOString());
    }, [currentUserId, parentType, parentId]);

    const refetch = useCallback(async () => {
        const m = await fetchMemo();
        setMemo(m);
    }, [fetchMemo]);

    const addEntry = useCallback(
        async (payload: MemoEntryCreate): Promise<MemoEntryRead> => {
            const created =
                parentType === 'concourse'
                    ? await createConcourseEntryApiAdminConcoursesCidMemoEntriesPost(
                          parentId,
                          payload
                      )
                    : await createStudyEntryApiAdminStudiesSidMemoEntriesPost(parentId, payload);
            setMemo((m) =>
                m
                    ? {
                          ...m,
                          entries: [...m.entries, created].sort((a, b) => a.position - b.position),
                      }
                    : m
            );
            return created;
        },
        [parentType, parentId]
    );

    const editEntry = useCallback(
        async (entryId: number, patch: MemoEntryUpdate): Promise<MemoEntryRead> => {
            const updated = await updateEntryApiAdminMemoEntriesEidPatch(entryId, patch);
            setMemo((m) =>
                m
                    ? {
                          ...m,
                          entries: m.entries.map((e) => (e.id === entryId ? updated : e)),
                      }
                    : m
            );
            return updated;
        },
        []
    );

    const removeEntry = useCallback(async (entryId: number): Promise<void> => {
        await deleteEntryApiAdminMemoEntriesEidDelete(entryId);
        setMemo((m) => (m ? { ...m, entries: m.entries.filter((e) => e.id !== entryId) } : m));
    }, []);

    const addComment = useCallback(
        async (entryId: number, body: string, mentions: number[]): Promise<MemoCommentRead> => {
            const created = await postCommentApiAdminMemoEntriesEidCommentsPost(entryId, {
                body,
                mentions,
            });
            setMemo((m) =>
                m
                    ? {
                          ...m,
                          entries: m.entries.map((e) =>
                              e.id === entryId ? { ...e, comments: [...e.comments, created] } : e
                          ),
                      }
                    : m
            );
            return created;
        },
        []
    );

    const editComment = useCallback(
        async (commentId: number, body: string): Promise<MemoCommentRead> => {
            const updated = await updateCommentApiAdminMemoCommentsCidPatch(commentId, { body });
            setMemo((m) =>
                m
                    ? {
                          ...m,
                          entries: m.entries.map((e) => ({
                              ...e,
                              comments: e.comments.map((c) => (c.id === commentId ? updated : c)),
                          })),
                      }
                    : m
            );
            return updated;
        },
        []
    );

    const removeComment = useCallback(async (commentId: number): Promise<void> => {
        const soft = await deleteCommentApiAdminMemoCommentsCidDelete(commentId);
        setMemo((m) =>
            m
                ? {
                      ...m,
                      entries: m.entries.map((e) => ({
                          ...e,
                          comments: e.comments.map((c) => (c.id === commentId ? soft : c)),
                      })),
                  }
                : m
        );
    }, []);

    const toggleResolve = useCallback(async (comment: MemoCommentRead): Promise<void> => {
        const updated = comment.resolved
            ? await unresolveCommentApiAdminMemoCommentsCidUnresolvePost(comment.id)
            : await resolveCommentApiAdminMemoCommentsCidResolvePost(comment.id);
        setMemo((m) =>
            m
                ? {
                      ...m,
                      entries: m.entries.map((e) => ({
                          ...e,
                          comments: e.comments.map((c) => (c.id === comment.id ? updated : c)),
                      })),
                  }
                : m
        );
    }, []);

    return {
        entries,
        templates,
        unreadCount,
        mentionsForYou,
        showResolved,
        setShowResolved,
        markSeen,
        refetch,
        addEntry,
        editEntry,
        removeEntry,
        addComment,
        editComment,
        removeComment,
        toggleResolve,
        projectMembers,
    };
}
