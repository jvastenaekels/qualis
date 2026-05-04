import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, MessageSquare, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
    useListItemVersionsApiAdminConcoursesConcourseIdItemsItemIdVersionsGet,
    useListItemCommentsApiAdminConcoursesConcourseIdItemsItemIdCommentsGet,
    useCreateItemCommentApiAdminConcoursesConcourseIdItemsItemIdCommentsPost,
    getListItemCommentsApiAdminConcoursesConcourseIdItemsItemIdCommentsGetQueryKey,
} from '@/api/generated';
import type { ConcourseItemVersionRead, ConcourseItemCommentRead } from '@/api/model';
import { useQueryClient } from '@tanstack/react-query';
import { parseApiErrorSync } from '@/lib/error-utils';
import { diffVersionFields } from './ItemDetailSheet.helpers';

interface ItemDetailSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    concourseId: number;
    itemId: number | null;
    itemCode: string;
    defaultTab?: 'history' | 'comments';
    memberNames?: Record<number, string>;
}

export function ItemDetailSheet({
    open,
    onOpenChange,
    concourseId,
    itemId,
    itemCode,
    defaultTab = 'history',
    memberNames = {},
}: ItemDetailSheetProps) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [newComment, setNewComment] = useState('');

    const { data: versions, isLoading: versionsLoading } =
        useListItemVersionsApiAdminConcoursesConcourseIdItemsItemIdVersionsGet(
            concourseId,
            itemId ?? 0,
            undefined,
            {
                query: { enabled: open && itemId !== null },
            }
        );

    const { data: comments, isLoading: commentsLoading } =
        useListItemCommentsApiAdminConcoursesConcourseIdItemsItemIdCommentsGet(
            concourseId,
            itemId ?? 0,
            undefined,
            {
                query: { enabled: open && itemId !== null },
            }
        );

    const createCommentMutation =
        useCreateItemCommentApiAdminConcoursesConcourseIdItemsItemIdCommentsPost();

    const handleAddComment = async () => {
        if (!newComment.trim() || itemId === null) return;
        try {
            await createCommentMutation.mutateAsync({
                concourseId,
                itemId,
                data: { body: newComment.trim() },
            });
            setNewComment('');
            await queryClient.invalidateQueries({
                queryKey:
                    getListItemCommentsApiAdminConcoursesConcourseIdItemsItemIdCommentsGetQueryKey(
                        concourseId,
                        itemId
                    ),
            });
            toast.success(t('admin.concourse.comment_added', 'Comment added'));
        } catch (err) {
            toast.error(
                parseApiErrorSync(
                    err,
                    t('admin.concourse.comment_error', 'Could not add comment. Try again.')
                )
            );
        }
    };

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
                <SheetHeader>
                    <SheetTitle className="text-lg font-black">{itemCode}</SheetTitle>
                    <SheetDescription className="sr-only">
                        {t(
                            'admin.concourse.item_detail_desc',
                            'History and comments for this item'
                        )}
                    </SheetDescription>
                </SheetHeader>
                <Tabs defaultValue={defaultTab} className="mt-4">
                    <TabsList className="w-full">
                        <TabsTrigger value="history" className="flex-1 gap-1.5">
                            <Clock className="size-3.5" />
                            {t('admin.concourse.history', 'History')}
                        </TabsTrigger>
                        <TabsTrigger value="comments" className="flex-1 gap-1.5">
                            <MessageSquare className="size-3.5" />
                            {t('admin.concourse.comments', 'Comments')}
                            {comments && comments.length > 0 && (
                                <Badge
                                    variant="secondary"
                                    className="ml-1 h-5 min-w-[20px] justify-center text-2xs"
                                >
                                    {comments.length}
                                </Badge>
                            )}
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="history">
                        <VersionList
                            versions={versions ?? []}
                            isLoading={versionsLoading}
                            formatDate={formatDate}
                            memberNames={memberNames}
                        />
                    </TabsContent>

                    <TabsContent value="comments">
                        <CommentList
                            comments={comments ?? []}
                            isLoading={commentsLoading}
                            formatDate={formatDate}
                            memberNames={memberNames}
                        />
                        <div className="mt-4 space-y-2">
                            <Textarea
                                value={newComment}
                                onChange={(e) => setNewComment(e.target.value)}
                                placeholder={t('admin.concourse.add_comment', 'Write a comment...')}
                                className="min-h-[80px] rounded-xl text-sm"
                            />
                            <Button
                                size="sm"
                                className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white"
                                disabled={!newComment.trim() || createCommentMutation.isPending}
                                onClick={handleAddComment}
                            >
                                {createCommentMutation.isPending ? (
                                    <Loader2 className="size-3.5 animate-spin mr-1.5" />
                                ) : (
                                    <Send className="size-3.5 mr-1.5" />
                                )}
                                {t('admin.concourse.send_comment', 'Send')}
                            </Button>
                        </div>
                    </TabsContent>
                </Tabs>
            </SheetContent>
        </Sheet>
    );
}

function VersionList({
    versions,
    isLoading,
    formatDate,
    memberNames,
}: {
    versions: ConcourseItemVersionRead[];
    isLoading: boolean;
    formatDate: (d: string) => string;
    memberNames: Record<number, string>;
}) {
    const { t } = useTranslation();

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="size-5 animate-spin text-slate-400" />
            </div>
        );
    }

    if (versions.length === 0) {
        return (
            <p className="text-center text-sm text-slate-400 py-12">
                {t('admin.concourse.no_history', 'No edit history yet.')}
            </p>
        );
    }

    // Sort versions ascending so we can compare consecutive pairs
    const sorted = [...versions].sort((a, b) => a.version_number - b.version_number);

    const getChanges = (v: ConcourseItemVersionRead, idx: number) => {
        if (idx === 0) return null;
        const prev = sorted[idx - 1];
        if (!prev) return null;
        return diffVersionFields(prev, v, t);
    };

    // Display newest first
    const displayed = [...sorted].reverse();

    return (
        <div className="space-y-3 mt-2">
            {displayed.map((v) => {
                const idx = sorted.indexOf(v);
                const changes = getChanges(v, idx);
                return (
                    <div
                        key={v.id}
                        className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 space-y-1.5"
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-2xs font-mono">
                                    {t('admin.concourse.version_label', 'v{{n}}', {
                                        n: v.version_number,
                                    })}
                                </Badge>
                                {v.changed_by != null && (
                                    <span className="text-2xs font-medium text-slate-500">
                                        {memberNames[v.changed_by] ?? `#${v.changed_by}`}
                                    </span>
                                )}
                                {changes && (
                                    <span className="text-2xs text-indigo-500">
                                        {t('admin.concourse.diff_changed', 'Changed:')}{' '}
                                        {changes.join(', ')}
                                    </span>
                                )}
                            </div>
                            <span className="text-2xs text-slate-400">
                                {formatDate(v.changed_at)}
                            </span>
                        </div>
                        <div className="text-sm text-slate-700">
                            <span className="font-mono text-xs text-slate-500 mr-1.5">
                                {v.code}
                            </span>
                            {v.translations_snapshot && v.translations_snapshot.length > 1 ? (
                                <div className="mt-1 space-y-0.5">
                                    {v.translations_snapshot.map((tr) => (
                                        <p
                                            key={tr.language_code}
                                            className="text-sm text-slate-700"
                                        >
                                            <span className="text-2xs font-bold text-slate-400 mr-1.5">
                                                {tr.language_code?.toUpperCase()}
                                            </span>
                                            {tr.text}
                                        </p>
                                    ))}
                                </div>
                            ) : (
                                (v.translations_snapshot?.[0]?.text ?? '')
                            )}
                        </div>
                        {v.change_comment && (
                            <p className="text-xs text-slate-500 italic border-l-2 border-slate-200 pl-2">
                                {v.change_comment}
                            </p>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

function CommentList({
    comments,
    isLoading,
    formatDate,
    memberNames,
}: {
    comments: ConcourseItemCommentRead[];
    isLoading: boolean;
    formatDate: (d: string) => string;
    memberNames: Record<number, string>;
}) {
    const { t } = useTranslation();

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="size-5 animate-spin text-slate-400" />
            </div>
        );
    }

    if (comments.length === 0) {
        return (
            <p className="text-center text-sm text-slate-400 py-12">
                {t('admin.concourse.no_comments', 'No comments yet.')}
            </p>
        );
    }

    return (
        <div className="space-y-3 mt-2">
            {comments.map((c) => (
                <div
                    key={c.id}
                    className="rounded-xl border border-slate-100 bg-white p-3 space-y-1"
                >
                    <div className="flex items-center justify-between">
                        <span className="text-2xs font-bold text-slate-500">
                            {c.user_id
                                ? (memberNames[c.user_id] ?? `#${c.user_id}`)
                                : t('common.unknown', 'Unknown')}
                        </span>
                        <span className="text-2xs text-slate-400">{formatDate(c.created_at)}</span>
                    </div>
                    <p className="text-sm text-slate-800 whitespace-pre-wrap">{c.body}</p>
                </div>
            ))}
        </div>
    );
}
