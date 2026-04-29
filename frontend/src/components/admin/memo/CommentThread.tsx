import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { MemoCommentRead } from '@/api/model';
import { MentionAutocomplete } from './MentionAutocomplete';

interface ProjectMemberLite {
    user_id: number;
    display_name: string;
}

interface Props {
    comments: MemoCommentRead[];
    showResolved: boolean;
    currentUserId: number;
    isOwner: boolean;
    members: ProjectMemberLite[];
    onPost: (body: string, mentions: number[]) => Promise<void>;
    onEdit: (commentId: number, body: string) => Promise<void>;
    onDelete: (commentId: number) => Promise<void>;
    onToggleResolve: (comment: MemoCommentRead) => Promise<void>;
}

function displayNameFor(userId: number | null, members: ProjectMemberLite[]): string {
    if (userId === null) return '(removed)';
    const m = members.find((x) => x.user_id === userId);
    return m ? `@${m.display_name}` : `user #${userId}`;
}

export function CommentThread({
    comments,
    showResolved,
    currentUserId,
    isOwner,
    members,
    onPost,
    onEdit,
    onDelete,
    onToggleResolve,
}: Props) {
    const { t } = useTranslation();
    const [draft, setDraft] = useState('');
    const [mentions, setMentions] = useState<number[]>([]);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editDraft, setEditDraft] = useState('');

    const visible = showResolved ? comments : comments.filter((c) => !c.resolved);

    const submit = async () => {
        if (!draft.trim()) return;
        await onPost(draft, mentions);
        setDraft('');
        setMentions([]);
    };

    return (
        <div className="space-y-3">
            {visible.map((c) => {
                const isAuthor = c.user_id === currentUserId;
                const canModerate = isAuthor || isOwner;
                if (editingId === c.id) {
                    return (
                        <div key={c.id} className="border rounded-xl p-3 bg-white space-y-2">
                            <textarea
                                value={editDraft}
                                onChange={(e) => setEditDraft(e.target.value)}
                                rows={3}
                                className="w-full text-sm rounded-md border px-2 py-1"
                            />
                            <div className="flex gap-2 justify-end">
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setEditingId(null)}
                                >
                                    {t('admin.memo.cancel', 'Cancel')}
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={async () => {
                                        await onEdit(c.id, editDraft);
                                        setEditingId(null);
                                    }}
                                >
                                    {t('admin.memo.save', 'Save')}
                                </Button>
                            </div>
                        </div>
                    );
                }
                return (
                    <div key={c.id} className="border rounded-xl p-3 bg-white text-sm">
                        <div className="text-xs text-slate-500 mb-1">
                            {displayNameFor(c.user_id, members)} ·{' '}
                            {new Date(c.created_at).toLocaleDateString()}
                            {c.resolved && (
                                <span className="ml-2 text-emerald-600">
                                    {t('admin.memo.resolved_label', '[resolved]')}
                                </span>
                            )}
                        </div>
                        <div className="whitespace-pre-wrap">
                            {c.deleted ? (
                                <em className="text-slate-400">
                                    {t('admin.memo.deleted_body', '[deleted comment]')}
                                </em>
                            ) : (
                                c.body
                            )}
                        </div>
                        {!c.deleted && (
                            <div className="flex gap-2 mt-2 text-xs">
                                {canModerate && (
                                    <button
                                        type="button"
                                        className="text-indigo-600 hover:underline"
                                        onClick={() => {
                                            setEditingId(c.id);
                                            setEditDraft(c.body);
                                        }}
                                    >
                                        {t('admin.memo.edit', 'Edit')}
                                    </button>
                                )}
                                {canModerate && (
                                    <button
                                        type="button"
                                        className="text-rose-600 hover:underline"
                                        onClick={() => onDelete(c.id)}
                                    >
                                        {t('admin.memo.delete', 'Delete')}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className="text-slate-600 hover:underline"
                                    onClick={() => onToggleResolve(c)}
                                >
                                    {c.resolved
                                        ? t('admin.memo.unresolve', 'Unresolve')
                                        : t('admin.memo.resolve', 'Resolve')}
                                </button>
                            </div>
                        )}
                    </div>
                );
            })}

            <div className="space-y-2">
                <MentionAutocomplete
                    value={draft}
                    onChange={(v, m) => {
                        setDraft(v);
                        setMentions(m);
                    }}
                    members={members}
                    placeholder={t(
                        'admin.memo.comment_placeholder',
                        'Write a comment. Use @ to mention.'
                    )}
                />
                <div className="flex justify-end">
                    <Button size="sm" onClick={submit} disabled={!draft.trim()}>
                        {t('admin.memo.post_comment', 'Post')}
                    </Button>
                </div>
            </div>
        </div>
    );
}
