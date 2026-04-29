import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { MemoCommentRead, MemoEntryRead } from '@/api/model';
import { CommentThread } from './CommentThread';

interface ProjectMemberLite {
    user_id: number;
    display_name: string;
}

interface Props {
    entry: MemoEntryRead;
    canEdit: boolean;
    isOwner: boolean;
    currentUserId: number;
    members: ProjectMemberLite[];
    showResolved: boolean;
    onEditEntry: (id: number, patch: { title?: string; body?: string }) => Promise<unknown>;
    onDeleteEntry: (id: number) => Promise<void>;
    onPostComment: (entryId: number, body: string, mentions: number[]) => Promise<unknown>;
    onEditComment: (commentId: number, body: string) => Promise<unknown>;
    onDeleteComment: (commentId: number) => Promise<void>;
    onToggleResolve: (comment: MemoCommentRead) => Promise<void>;
}

export function MemoEntry({
    entry,
    canEdit,
    isOwner,
    currentUserId,
    members,
    showResolved,
    onEditEntry,
    onDeleteEntry,
    onPostComment,
    onEditComment,
    onDeleteComment,
    onToggleResolve,
}: Props) {
    const { t } = useTranslation();
    const [editing, setEditing] = useState(false);
    const [title, setTitle] = useState(entry.title);
    const [body, setBody] = useState(entry.body);
    const [showThread, setShowThread] = useState(false);

    const visibleCommentCount = entry.comments.filter(
        (c) => !c.deleted && (showResolved || !c.resolved)
    ).length;

    return (
        <div className="border rounded-xl bg-white">
            <div className="p-3 border-b">
                {editing ? (
                    <div className="space-y-2">
                        <input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full text-sm font-bold rounded-md border px-2 py-1"
                        />
                        <textarea
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            rows={4}
                            className="w-full text-sm rounded-md border px-2 py-1"
                        />
                        <div className="flex justify-end gap-2">
                            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                                {t('admin.memo.cancel', 'Cancel')}
                            </Button>
                            <Button
                                size="sm"
                                onClick={async () => {
                                    await onEditEntry(entry.id, { title, body });
                                    setEditing(false);
                                }}
                            >
                                {t('admin.memo.save', 'Save')}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div>
                        <div className="flex items-baseline justify-between">
                            <h4 className="text-sm font-bold text-slate-900">{entry.title}</h4>
                            {canEdit && (
                                <div className="flex gap-2 text-xs">
                                    <button
                                        type="button"
                                        className="text-indigo-600 hover:underline"
                                        onClick={() => setEditing(true)}
                                    >
                                        {t('admin.memo.edit', 'Edit')}
                                    </button>
                                    <button
                                        type="button"
                                        className="text-rose-600 hover:underline"
                                        onClick={() => {
                                            if (
                                                window.confirm(
                                                    t(
                                                        'admin.memo.delete_entry_confirm',
                                                        'Delete this entry?'
                                                    )
                                                )
                                            ) {
                                                onDeleteEntry(entry.id);
                                            }
                                        }}
                                    >
                                        {t('admin.memo.delete', 'Delete')}
                                    </button>
                                </div>
                            )}
                        </div>
                        {entry.body && (
                            <p className="text-sm text-slate-700 whitespace-pre-wrap mt-1">
                                {entry.body}
                            </p>
                        )}
                    </div>
                )}
            </div>
            <button
                type="button"
                className="text-xs text-slate-600 px-3 py-2 hover:bg-slate-50 w-full text-left"
                onClick={() => setShowThread((s) => !s)}
            >
                {visibleCommentCount === 1
                    ? t('admin.memo.comments_count_one', '{{n}} comment', {
                          n: 1,
                      })
                    : t('admin.memo.comments_count_other', '{{n}} comments', {
                          n: visibleCommentCount,
                      })}
            </button>
            {showThread && (
                <div className="p-3 bg-slate-50/50">
                    <CommentThread
                        comments={entry.comments}
                        showResolved={showResolved}
                        currentUserId={currentUserId}
                        isOwner={isOwner}
                        members={members}
                        onPost={(b, m) => onPostComment(entry.id, b, m).then(() => undefined)}
                        onEdit={(id, b) => onEditComment(id, b).then(() => undefined)}
                        onDelete={onDeleteComment}
                        onToggleResolve={onToggleResolve}
                    />
                </div>
            )}
        </div>
    );
}
