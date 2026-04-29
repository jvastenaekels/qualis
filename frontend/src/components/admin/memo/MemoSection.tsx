/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    type MemoParentType,
    type ProjectMemberLite,
    useMemoSection,
} from '@/hooks/admin/useMemoSection';
import { MemoEntry } from './MemoEntry';

interface Props {
    parentType: MemoParentType;
    parentId: number;
    currentUserId: number;
    isOwner: boolean;
    canEdit: boolean;
    members: ProjectMemberLite[];
}

export function MemoSection({
    parentType,
    parentId,
    currentUserId,
    isOwner,
    canEdit,
    members,
}: Props) {
    const { t } = useTranslation();
    const m = useMemoSection({
        parentType,
        parentId,
        currentUserId,
        projectMembers: members,
    });

    // Bump last-seen the first time we render with non-empty content.
    useEffect(() => {
        if (m.entries.length > 0) m.markSeen();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [parentId]);

    const [newEntryTitle, setNewEntryTitle] = useState('');
    const [adding, setAdding] = useState(false);

    const resolvedCount = m.entries
        .flatMap((e) => e.comments)
        .filter((c) => c.resolved).length;

    return (
        <div className="space-y-3">
            {m.mentionsForYou.length > 0 && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm">
                    <div className="font-bold text-amber-900 mb-1">
                        {t('admin.memo.mentions_for_you', 'Mentions for you')}
                    </div>
                    <ul className="list-disc ml-5 text-amber-900">
                        {m.mentionsForYou.map((c) => (
                            <li key={c.id}>{c.body}</li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="flex gap-2">
                {canEdit && (
                    <Button size="sm" onClick={() => setAdding((s) => !s)}>
                        {t('admin.memo.add_entry', 'Add entry')}
                    </Button>
                )}
                {canEdit && m.templates.length > 0 && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline">
                                {t('admin.memo.insert_template', 'Insert from template')}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                            {m.templates.map((tpl) => (
                                <DropdownMenuItem
                                    key={tpl.title}
                                    onClick={() =>
                                        m.addEntry({ title: tpl.title, body: '' })
                                    }
                                >
                                    {tpl.title}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
                <div className="flex-1" />
                <button
                    type="button"
                    className="text-xs text-slate-600 hover:underline"
                    onClick={() => m.setShowResolved((s) => !s)}
                >
                    {m.showResolved
                        ? t('admin.memo.hide_resolved', 'Hide resolved')
                        : t('admin.memo.show_resolved', 'Show resolved ({{n}})', {
                              n: resolvedCount,
                          })}
                </button>
            </div>

            {adding && (
                <div className="border rounded-xl p-3 bg-white">
                    <input
                        value={newEntryTitle}
                        onChange={(e) => setNewEntryTitle(e.target.value)}
                        placeholder={t(
                            'admin.memo.entry_title_placeholder',
                            'Section title…',
                        )}
                        className="w-full text-sm rounded-md border px-2 py-1 mb-2"
                    />
                    <div className="flex justify-end gap-2">
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                                setAdding(false);
                                setNewEntryTitle('');
                            }}
                        >
                            {t('admin.memo.cancel', 'Cancel')}
                        </Button>
                        <Button
                            size="sm"
                            disabled={!newEntryTitle.trim()}
                            onClick={async () => {
                                await m.addEntry({
                                    title: newEntryTitle.trim(),
                                    body: '',
                                });
                                setAdding(false);
                                setNewEntryTitle('');
                            }}
                        >
                            {t('admin.memo.save', 'Save')}
                        </Button>
                    </div>
                </div>
            )}

            <div className="space-y-2">
                {m.entries.map((e) => (
                    <MemoEntry
                        key={e.id}
                        entry={e}
                        canEdit={canEdit}
                        isOwner={isOwner}
                        currentUserId={currentUserId}
                        members={members}
                        showResolved={m.showResolved}
                        onEditEntry={m.editEntry}
                        onDeleteEntry={m.removeEntry}
                        onPostComment={m.addComment}
                        onEditComment={m.editComment}
                        onDeleteComment={m.removeComment}
                        onToggleResolve={m.toggleResolve}
                    />
                ))}
            </div>
        </div>
    );
}
