import { useState, useMemo, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    Library,
    Plus,
    Upload,
    Download,
    Trash2,
    Loader2,
    Check,
    X,
    Tag,
    Pencil,
    Clock,
    MessageSquare,
    Settings2,
    CheckSquare,
    Filter,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { StudyPageHeader } from '@/components/admin/layout/StudyPageHeader';
import { usePermission } from '@/hooks/usePermission';
import {
    useGetConcourseApiAdminConcoursesConcourseIdGet,
    useCreateItemApiAdminConcoursesConcourseIdItemsPost,
    useUpdateItemApiAdminConcoursesConcourseIdItemsItemIdPatch,
    useDeleteItemApiAdminConcoursesConcourseIdItemsItemIdDelete,
    useImportItemsFromTextApiAdminConcoursesConcourseIdItemsImportPost,
    useListTagsApiAdminConcoursesTagsGet,
    useCreateTagApiAdminConcoursesTagsPost,
    useDeleteTagApiAdminConcoursesTagsTagIdDelete,
    getGetConcourseApiAdminConcoursesConcourseIdGetQueryKey,
    getListTagsApiAdminConcoursesTagsGetQueryKey,
} from '@/api/generated';
import type { ConcourseItemRead, ConcourseItemStatus, ConcourseTagRead } from '@/api/model';
import { useQueryClient } from '@tanstack/react-query';
import { parseApiErrorSync } from '@/lib/error-utils';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { ItemDetailSheet } from '@/components/admin/concourse/ItemDetailSheet';

const STATUS_COLORS: Record<string, string> = {
    proposed: 'bg-amber-100 text-amber-800 border-amber-200',
    accepted: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    rejected: 'bg-red-100 text-red-800 border-red-200',
};

export default function ConcourseDetailPage() {
    const { t } = useTranslation();
    const { can } = usePermission();
    const { concourseId } = useParams<{ concourseId: string }>();
    const queryClient = useQueryClient();
    const id = Number(concourseId);

    const { data: concourse, isLoading } = useGetConcourseApiAdminConcoursesConcourseIdGet(id, {
        query: {
            enabled: !!id,
            refetchInterval: 15_000,
        },
    });

    const { data: tags } = useListTagsApiAdminConcoursesTagsGet();

    const [activeLocale, setActiveLocale] = useState('en');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [filterTag, setFilterTag] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [importOpen, setImportOpen] = useState(false);
    const [addItemOpen, setAddItemOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<number | null>(null);
    const [editCode, setEditCode] = useState('');
    const [editText, setEditText] = useState('');
    const [editSource, setEditSource] = useState('');
    const [editChangeNote, setEditChangeNote] = useState('');
    const [sheetItemId, setSheetItemId] = useState<number | null>(null);
    const [sheetItemCode, setSheetItemCode] = useState('');
    const [sheetTab, setSheetTab] = useState<'history' | 'comments'>('history');
    const [tagManagerOpen, setTagManagerOpen] = useState(false);
    const [newTagName, setNewTagName] = useState('');
    const [newTagColor, setNewTagColor] = useState('#6366f1');
    const [deleteTagId, setDeleteTagId] = useState<number | null>(null);
    const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
    const [bulkActionPending, setBulkActionPending] = useState(false);

    // Mutations
    const createItemMutation = useCreateItemApiAdminConcoursesConcourseIdItemsPost();
    const updateItemMutation = useUpdateItemApiAdminConcoursesConcourseIdItemsItemIdPatch();
    const deleteItemMutation = useDeleteItemApiAdminConcoursesConcourseIdItemsItemIdDelete();
    const importMutation = useImportItemsFromTextApiAdminConcoursesConcourseIdItemsImportPost();
    const createTagMutation = useCreateTagApiAdminConcoursesTagsPost();
    const deleteTagMutation = useDeleteTagApiAdminConcoursesTagsTagIdDelete();

    const invalidate = () =>
        queryClient.invalidateQueries({
            queryKey: getGetConcourseApiAdminConcoursesConcourseIdGetQueryKey(id),
        });

    const invalidateTags = () =>
        queryClient.invalidateQueries({
            queryKey: getListTagsApiAdminConcoursesTagsGetQueryKey(),
        });

    const handleCreateTag = async () => {
        if (!newTagName.trim()) return;
        try {
            await createTagMutation.mutateAsync({
                data: { name: newTagName.trim(), color: newTagColor },
            });
            await invalidateTags();
            setNewTagName('');
            toast.success(t('admin.concourse.tag_created', 'Tag created'));
        } catch (err) {
            toast.error(
                parseApiErrorSync(
                    err,
                    t('admin.concourse.tag_create_error', 'Failed to create tag')
                )
            );
        }
    };

    const handleDeleteTag = async (tagId: number) => {
        try {
            await deleteTagMutation.mutateAsync({ tagId });
            await Promise.all([invalidateTags(), invalidate()]);
            setDeleteTagId(null);
            toast.success(t('admin.concourse.tag_deleted', 'Tag deleted'));
        } catch (err) {
            toast.error(
                parseApiErrorSync(
                    err,
                    t('admin.concourse.tag_delete_error', 'Failed to delete tag')
                )
            );
        }
    };

    // Filter items
    const filteredItems = useMemo(() => {
        if (!concourse?.items) return [];
        return concourse.items
            .filter((item) => {
                if (filterStatus !== 'all' && item.status !== filterStatus) return false;
                if (filterTag !== 'all' && !item.tags?.some((tag) => String(tag.id) === filterTag))
                    return false;
                if (searchQuery) {
                    const text =
                        item.translations?.find((tr) => tr.language_code === activeLocale)?.text ??
                        item.translations?.[0]?.text ??
                        '';
                    const q = searchQuery.toLowerCase();
                    if (
                        !item.code.toLowerCase().includes(q) &&
                        !text.toLowerCase().includes(q) &&
                        !(item.source ?? '').toLowerCase().includes(q)
                    )
                        return false;
                }
                return true;
            })
            .sort((a, b) => a.display_order - b.display_order);
    }, [concourse?.items, filterStatus, filterTag, searchQuery, activeLocale]);

    const toggleSelectItem = useCallback((itemId: number) => {
        setSelectedItems((prev) => {
            const next = new Set(prev);
            if (next.has(itemId)) next.delete(itemId);
            else next.add(itemId);
            return next;
        });
    }, []);

    const toggleSelectAll = useCallback(() => {
        setSelectedItems((prev) => {
            const filteredIds = filteredItems.map((item) => item.id);
            const allSelected = filteredIds.length > 0 && filteredIds.every((id) => prev.has(id));
            if (allSelected) return new Set();
            return new Set(filteredIds);
        });
    }, [filteredItems]);

    const handleBulkStatusChange = async (status: ConcourseItemStatus) => {
        if (selectedItems.size === 0) return;
        setBulkActionPending(true);
        try {
            const items = concourse?.items?.filter((item) => selectedItems.has(item.id)) ?? [];
            await Promise.all(
                items.map((item) =>
                    updateItemMutation.mutateAsync({
                        concourseId: id,
                        itemId: item.id,
                        data: { version: item.version, status },
                    })
                )
            );
            await invalidate();
            setSelectedItems(new Set());
            toast.success(
                t('admin.concourse.bulk_status_success', '{{count}} items updated', {
                    count: items.length,
                })
            );
        } catch (err) {
            toast.error(
                parseApiErrorSync(
                    err,
                    t('admin.concourse.bulk_status_error', 'Failed to update some items')
                )
            );
            await invalidate();
        } finally {
            setBulkActionPending(false);
        }
    };

    const exportCsv = useCallback(() => {
        if (!concourse?.items?.length) return;
        const items = filteredItems.length > 0 ? filteredItems : (concourse.items ?? []);
        const allLangs = [
            ...new Set(items.flatMap((i) => i.translations?.map((tr) => tr.language_code) ?? [])),
        ].sort();

        const headers = ['code', 'status', 'source', ...allLangs.map((l) => `text_${l}`), 'tags'];
        const rows = items.map((item) => {
            const texts = allLangs.map((lang) => {
                const tr = item.translations?.find((t) => t.language_code === lang);
                return tr?.text ?? '';
            });
            const tagNames = item.tags?.map((tag) => tag.name).join('; ') ?? '';
            return [item.code, item.status, item.source ?? '', ...texts, tagNames];
        });

        const csvEscape = (v: string) => {
            if (v.includes(',') || v.includes('"') || v.includes('\n')) {
                return `"${v.replace(/"/g, '""')}"`;
            }
            return v;
        };

        const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
        const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${concourse.title.replace(/[^a-zA-Z0-9-_ ]/g, '').trim()}_concourse.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }, [concourse, filteredItems]);

    // Add item
    const [newCode, setNewCode] = useState('');
    const [newText, setNewText] = useState('');
    const [newSource, setNewSource] = useState('');
    const [newTagIds, setNewTagIds] = useState<number[]>([]);

    const handleAddItem = async () => {
        if (!newCode.trim() || !newText.trim()) return;
        try {
            await createItemMutation.mutateAsync({
                concourseId: id,
                data: {
                    code: newCode.trim(),
                    source: newSource.trim() || null,
                    translations: [{ language_code: activeLocale, text: newText.trim() }],
                    tag_ids: newTagIds,
                },
            });
            await invalidate();
            setAddItemOpen(false);
            setNewCode('');
            setNewText('');
            setNewSource('');
            setNewTagIds([]);
            toast.success(t('admin.concourse.item_created', 'Item added'));
        } catch (err) {
            toast.error(
                parseApiErrorSync(err, t('admin.concourse.item_create_error', 'Failed to add item'))
            );
        }
    };

    // Edit item
    const [editTagIds, setEditTagIds] = useState<number[]>([]);

    const startEdit = (item: ConcourseItemRead) => {
        setEditingItem(item.id);
        setEditCode(item.code);
        setEditText(
            item.translations?.find((tr) => tr.language_code === activeLocale)?.text ??
                item.translations?.[0]?.text ??
                ''
        );
        setEditSource(item.source ?? '');
        setEditChangeNote('');
        setEditTagIds(item.tags?.map((tag) => tag.id) ?? []);
    };

    const saveEdit = async (item: ConcourseItemRead) => {
        try {
            await updateItemMutation.mutateAsync({
                concourseId: id,
                itemId: item.id,
                data: {
                    version: item.version,
                    code: editCode.trim() || undefined,
                    source: editSource.trim() || undefined,
                    translations: [{ language_code: activeLocale, text: editText.trim() }],
                    tag_ids: editTagIds,
                    change_comment: editChangeNote.trim() || undefined,
                },
            });
            await invalidate();
            setEditingItem(null);
            setEditChangeNote('');
            toast.success(t('admin.concourse.item_updated', 'Item updated'));
        } catch (err) {
            toast.error(
                parseApiErrorSync(
                    err,
                    t('admin.concourse.item_update_error', 'Failed to update item')
                )
            );
        }
    };

    // Change status
    const changeStatus = async (item: ConcourseItemRead, status: ConcourseItemStatus) => {
        try {
            await updateItemMutation.mutateAsync({
                concourseId: id,
                itemId: item.id,
                data: { version: item.version, status },
            });
            await invalidate();
        } catch (err) {
            toast.error(
                parseApiErrorSync(err, t('admin.concourse.status_error', 'Failed to change status'))
            );
        }
    };

    // Delete item
    const handleDelete = async (itemId: number) => {
        try {
            await deleteItemMutation.mutateAsync({ concourseId: id, itemId });
            await invalidate();
            toast.success(t('admin.concourse.item_deleted', 'Item deleted'));
        } catch (err) {
            toast.error(
                parseApiErrorSync(
                    err,
                    t('admin.concourse.item_delete_error', 'Failed to delete item')
                )
            );
        }
    };

    // Bulk import
    const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

    const [importText, setImportText] = useState('');
    const [importPrefix, setImportPrefix] = useState('C');

    const handleImport = async () => {
        if (!importText.trim()) return;
        try {
            const result = await importMutation.mutateAsync({
                concourseId: id,
                data: {
                    text_block: importText,
                    language_code: activeLocale,
                    code_prefix: importPrefix,
                },
            });
            await invalidate();
            setImportOpen(false);
            setImportText('');
            toast.success(
                t('admin.concourse.import_success', '{{count}} items imported', {
                    count: result.length,
                })
            );
        } catch (err) {
            toast.error(parseApiErrorSync(err, t('admin.concourse.import_error', 'Import failed')));
        }
    };

    const languages = useMemo(
        () => [
            ...new Set(
                concourse?.items?.flatMap(
                    (i) => i.translations?.map((tr) => tr.language_code) ?? []
                ) ?? []
            ),
        ],
        [concourse?.items]
    );

    useEffect(() => {
        if (!languages.includes(activeLocale) && languages.length > 0) {
            setActiveLocale(languages[0]);
        }
    }, [languages, activeLocale]);

    if (isLoading) {
        return (
            <div className="p-8">
                <Skeleton className="h-12 w-1/3 mb-6" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }

    if (!concourse) {
        return (
            <div className="p-8 text-center text-slate-500">
                {t('common.errors.not_found', 'Not found')}
            </div>
        );
    }

    const canEdit = can('study:edit_design');

    return (
        <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6 pt-2">
            {/* Header */}
            <StudyPageHeader
                title={concourse.title}
                description={concourse.description ?? undefined}
                icon={Library}
                actions={
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            className="rounded-xl"
                            onClick={exportCsv}
                            disabled={!concourse.items?.length}
                        >
                            <Download className="size-4 sm:mr-1" />
                            <span className="hidden sm:inline">
                                {t('admin.concourse.export_csv', 'Export CSV')}
                            </span>
                        </Button>
                        {canEdit && (
                            <>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="rounded-xl"
                                    onClick={() => setImportOpen(true)}
                                >
                                    <Upload className="size-4 sm:mr-1" />
                                    <span className="hidden sm:inline">
                                        {t('admin.concourse.bulk_import', 'Bulk Import')}
                                    </span>
                                </Button>
                                <Button
                                    size="sm"
                                    className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white"
                                    onClick={() => setAddItemOpen(true)}
                                >
                                    <Plus className="size-4 sm:mr-1" />
                                    <span className="hidden sm:inline">
                                        {t('admin.concourse.add_item', 'Add Item')}
                                    </span>
                                </Button>
                            </>
                        )}
                    </div>
                }
            />

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
                <Input
                    placeholder={t('admin.concourse.search_placeholder', 'Search items...')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-9 rounded-xl w-full sm:w-64 bg-white"
                />
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="h-9 w-full sm:w-36 rounded-xl bg-white text-xs font-bold">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                        <SelectItem value="all">{t('common.all', 'All')}</SelectItem>
                        <SelectItem value="proposed">
                            {t('admin.concourse.status.proposed', 'Proposed')}
                        </SelectItem>
                        <SelectItem value="accepted">
                            {t('admin.concourse.status.accepted', 'Accepted')}
                        </SelectItem>
                        <SelectItem value="rejected">
                            {t('admin.concourse.status.rejected', 'Rejected')}
                        </SelectItem>
                    </SelectContent>
                </Select>
                {tags && tags.length > 0 && (
                    <Select value={filterTag} onValueChange={setFilterTag}>
                        <SelectTrigger className="h-9 w-full sm:w-36 rounded-xl bg-white text-xs font-bold">
                            <Tag className="size-3 mr-1" />
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                            <SelectItem value="all">{t('common.all', 'All')}</SelectItem>
                            {tags.map((tag) => (
                                <SelectItem key={tag.id} value={String(tag.id)}>
                                    {tag.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
                {canEdit && (
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-9 rounded-xl text-xs font-bold"
                        onClick={() => setTagManagerOpen(true)}
                    >
                        <Settings2 className="size-3 mr-1" />
                        {t('admin.concourse.manage_tags', 'Tags')}
                    </Button>
                )}
                {languages.length > 1 && (
                    <Select value={activeLocale} onValueChange={setActiveLocale}>
                        <SelectTrigger className="h-9 w-24 rounded-xl bg-white text-xs font-bold">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                            {languages.map((lang) => (
                                <SelectItem key={lang} value={lang}>
                                    {lang.toUpperCase()}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
                <span className="text-xs text-slate-400 ml-auto">
                    {filteredItems.length} / {concourse.items?.length ?? 0}{' '}
                    {t('admin.concourse.items_label', 'items')}
                </span>
            </div>

            {/* Q-set Progress */}
            {concourse.items &&
                concourse.items.length > 0 &&
                (() => {
                    const totalCount = concourse.items.length;
                    const acceptedCt = concourse.items.filter(
                        (i) => i.status === 'accepted'
                    ).length;
                    const proposedCt = concourse.items.filter(
                        (i) => i.status === 'proposed'
                    ).length;
                    const rejectedCt = concourse.items.filter(
                        (i) => i.status === 'rejected'
                    ).length;
                    const progress =
                        totalCount > 0 ? ((acceptedCt + rejectedCt) / totalCount) * 100 : 0;

                    return (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-3">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <CheckSquare className="size-4 text-emerald-600 shrink-0" />
                                    <div>
                                        <p className="text-sm font-bold text-emerald-900">
                                            {t('admin.concourse.qset_title', 'Q-set')}
                                            <span className="ml-2 text-lg font-black">
                                                {acceptedCt}
                                            </span>
                                            <span className="text-emerald-600 font-normal text-xs ml-1">
                                                / {totalCount}{' '}
                                                {t('admin.concourse.items_label', 'items')}
                                            </span>
                                        </p>
                                        <p className="text-xs text-emerald-700 mt-0.5">
                                            {proposedCt > 0
                                                ? t(
                                                      'admin.concourse.qset_pending',
                                                      '{{count}} items still to review',
                                                      { count: proposedCt }
                                                  )
                                                : t(
                                                      'admin.concourse.qset_complete',
                                                      'All items reviewed'
                                                  )}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-2 text-xs">
                                        <span
                                            className={cn(
                                                'rounded-lg border px-2 py-0.5 font-bold',
                                                STATUS_COLORS.accepted
                                            )}
                                        >
                                            {acceptedCt}
                                        </span>
                                        <span
                                            className={cn(
                                                'rounded-lg border px-2 py-0.5 font-bold',
                                                STATUS_COLORS.proposed
                                            )}
                                        >
                                            {proposedCt}
                                        </span>
                                        <span
                                            className={cn(
                                                'rounded-lg border px-2 py-0.5 font-bold',
                                                STATUS_COLORS.rejected
                                            )}
                                        >
                                            {rejectedCt}
                                        </span>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className={cn(
                                            'h-7 rounded-lg text-2xs font-bold',
                                            filterStatus === 'accepted'
                                                ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
                                                : filterStatus === 'proposed'
                                                  ? 'bg-amber-100 border-amber-300 text-amber-800'
                                                  : ''
                                        )}
                                        onClick={() => {
                                            if (filterStatus === 'proposed') {
                                                setFilterStatus('all');
                                            } else {
                                                setFilterStatus('proposed');
                                            }
                                        }}
                                    >
                                        <Filter className="size-3 mr-1" />
                                        {filterStatus === 'proposed'
                                            ? t('common.all', 'All')
                                            : t('admin.concourse.show_pending', 'To review')}
                                    </Button>
                                </div>
                            </div>
                            {/* Progress bar */}
                            <div className="mt-2.5 h-1.5 rounded-full bg-emerald-100 overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        </div>
                    );
                })()}

            {/* Tag breakdown */}
            {tags && tags.length > 0 && concourse.items && concourse.items.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {tags.map((tag) => {
                        const count =
                            concourse.items?.filter((i) => i.tags?.some((t) => t.id === tag.id))
                                .length ?? 0;
                        return (
                            <div
                                key={tag.id}
                                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs"
                            >
                                <div
                                    className="size-2.5 rounded-full"
                                    style={{ backgroundColor: tag.color ?? '#94a3b8' }}
                                />
                                <span className="text-slate-600">{tag.name}</span>
                                <span className="font-bold text-slate-800">{count}</span>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Bulk Action Bar */}
            {canEdit && selectedItems.size > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl bg-indigo-50 border border-indigo-100 px-4 py-2.5">
                    <span className="text-xs font-bold text-indigo-700">
                        {t('admin.concourse.bulk_selected', '{{count}} selected', {
                            count: selectedItems.size,
                        })}
                    </span>
                    <div className="flex items-center gap-1.5 ml-auto">
                        <span className="text-xs text-indigo-600 mr-1">
                            {t('admin.concourse.bulk_set_status', 'Set status:')}
                        </span>
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-7 rounded-lg text-2xs font-bold bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100"
                            disabled={bulkActionPending}
                            onClick={() =>
                                handleBulkStatusChange('proposed' as ConcourseItemStatus)
                            }
                        >
                            {t('admin.concourse.status.proposed', 'Proposed')}
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-7 rounded-lg text-2xs font-bold bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100"
                            disabled={bulkActionPending}
                            onClick={() =>
                                handleBulkStatusChange('accepted' as ConcourseItemStatus)
                            }
                        >
                            {t('admin.concourse.status.accepted', 'Accepted')}
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-7 rounded-lg text-2xs font-bold bg-red-50 border-red-200 text-red-800 hover:bg-red-100"
                            disabled={bulkActionPending}
                            onClick={() =>
                                handleBulkStatusChange('rejected' as ConcourseItemStatus)
                            }
                        >
                            {t('admin.concourse.status.rejected', 'Rejected')}
                        </Button>
                        {bulkActionPending && (
                            <Loader2 className="size-4 animate-spin text-indigo-600 ml-1" />
                        )}
                    </div>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-indigo-500 hover:text-indigo-700"
                        onClick={() => setSelectedItems(new Set())}
                    >
                        {t('admin.concourse.bulk_clear', 'Clear')}
                    </Button>
                </div>
            )}

            {/* Item List */}
            <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                <CardContent className="p-0">
                    {filteredItems.length === 0 ? (
                        <div className="py-16 text-center text-slate-400 text-sm">
                            {(concourse.items?.length ?? 0) === 0
                                ? t(
                                      'admin.concourse.no_items',
                                      'No items yet. Add your first statement.'
                                  )
                                : t('admin.concourse.no_matches', 'No items match your filters.')}
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-50">
                            {canEdit && filteredItems.length > 0 && (
                                <div className="flex items-center gap-2 px-4 py-2 bg-slate-50/80 border-b border-slate-100">
                                    <Checkbox
                                        checked={
                                            filteredItems.length > 0 &&
                                            filteredItems.every((item) =>
                                                selectedItems.has(item.id)
                                            )
                                        }
                                        onCheckedChange={toggleSelectAll}
                                    />
                                    <span className="text-2xs font-bold text-slate-500">
                                        {t('admin.concourse.select_all', 'Select all')}
                                    </span>
                                </div>
                            )}
                            {filteredItems.map((item) => {
                                const text =
                                    item.translations?.find(
                                        (tr) => tr.language_code === activeLocale
                                    )?.text ??
                                    item.translations?.[0]?.text ??
                                    '';
                                const isEditing = editingItem === item.id;

                                return (
                                    <div
                                        key={item.id}
                                        className={cn(
                                            'flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3 px-4 py-3 hover:bg-slate-50/50 transition-colors group',
                                            selectedItems.has(item.id) && 'bg-indigo-50/50'
                                        )}
                                    >
                                        {/* Code + Status (mobile: same row) */}
                                        <div className="flex items-center gap-2 sm:contents">
                                            {/* Selection checkbox */}
                                            {canEdit && (
                                                <div className="flex-shrink-0 sm:pt-0.5">
                                                    <Checkbox
                                                        checked={selectedItems.has(item.id)}
                                                        onCheckedChange={() =>
                                                            toggleSelectItem(item.id)
                                                        }
                                                    />
                                                </div>
                                            )}
                                            {/* Code badge */}
                                            <div className="flex-shrink-0 sm:pt-0.5">
                                                {isEditing ? (
                                                    <Input
                                                        value={editCode}
                                                        onChange={(e) =>
                                                            setEditCode(e.target.value)
                                                        }
                                                        className="h-7 w-16 text-xs font-mono rounded-lg"
                                                    />
                                                ) : (
                                                    <Badge
                                                        variant="outline"
                                                        className="font-mono text-2xs bg-slate-50"
                                                    >
                                                        {item.code}
                                                    </Badge>
                                                )}
                                            </div>

                                            {/* Status (mobile: next to code) */}
                                            <div className="sm:hidden">
                                                {canEdit && !isEditing ? (
                                                    <Select
                                                        value={item.status}
                                                        onValueChange={(val) =>
                                                            changeStatus(
                                                                item,
                                                                val as ConcourseItemStatus
                                                            )
                                                        }
                                                    >
                                                        <SelectTrigger
                                                            className={cn(
                                                                'h-7 w-[100px] rounded-lg text-2xs font-bold border',
                                                                STATUS_COLORS[item.status] ?? ''
                                                            )}
                                                        >
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent className="rounded-xl">
                                                            <SelectItem value="proposed">
                                                                {t(
                                                                    'admin.concourse.status.proposed',
                                                                    'Proposed'
                                                                )}
                                                            </SelectItem>
                                                            <SelectItem value="accepted">
                                                                {t(
                                                                    'admin.concourse.status.accepted',
                                                                    'Accepted'
                                                                )}
                                                            </SelectItem>
                                                            <SelectItem value="rejected">
                                                                {t(
                                                                    'admin.concourse.status.rejected',
                                                                    'Rejected'
                                                                )}
                                                            </SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                ) : !isEditing ? (
                                                    <Badge
                                                        variant="outline"
                                                        className={cn(
                                                            'text-2xs font-bold',
                                                            STATUS_COLORS[item.status] ?? ''
                                                        )}
                                                    >
                                                        {item.status}
                                                    </Badge>
                                                ) : null}
                                            </div>

                                            {/* Actions (mobile: next to code+status) */}
                                            {canEdit && (
                                                <div className="flex items-center gap-1 flex-shrink-0 sm:hidden ml-auto">
                                                    {isEditing ? (
                                                        <>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                aria-label={t(
                                                                    'common.save',
                                                                    'Save'
                                                                )}
                                                                className="size-8 p-0 text-emerald-600 hover:bg-emerald-50"
                                                                onClick={() => saveEdit(item)}
                                                                disabled={
                                                                    updateItemMutation.isPending
                                                                }
                                                            >
                                                                {updateItemMutation.isPending ? (
                                                                    <Loader2 className="size-3.5 animate-spin" />
                                                                ) : (
                                                                    <Check className="size-3.5" />
                                                                )}
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                aria-label={t(
                                                                    'common.cancel',
                                                                    'Cancel'
                                                                )}
                                                                className="size-8 p-0 text-slate-400 hover:bg-slate-100"
                                                                onClick={() => setEditingItem(null)}
                                                            >
                                                                <X className="size-3.5" />
                                                            </Button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                aria-label={t(
                                                                    'admin.concourse.history',
                                                                    'History'
                                                                )}
                                                                className="size-8 p-0 text-slate-400 hover:text-slate-700"
                                                                onClick={() => {
                                                                    setSheetItemId(item.id);
                                                                    setSheetItemCode(item.code);
                                                                    setSheetTab('history');
                                                                }}
                                                            >
                                                                <Clock className="size-3.5" />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                aria-label={t(
                                                                    'admin.concourse.comments',
                                                                    'Comments'
                                                                )}
                                                                className="relative size-8 p-0 text-slate-400 hover:text-slate-700"
                                                                onClick={() => {
                                                                    setSheetItemId(item.id);
                                                                    setSheetItemCode(item.code);
                                                                    setSheetTab('comments');
                                                                }}
                                                            >
                                                                <MessageSquare className="size-3.5" />
                                                                {(item.comment_count ?? 0) > 0 && (
                                                                    <span className="absolute -top-1 -right-1 flex items-center justify-center size-4 rounded-full bg-indigo-600 text-white text-[9px] font-bold">
                                                                        {item.comment_count}
                                                                    </span>
                                                                )}
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                aria-label={t(
                                                                    'common.edit',
                                                                    'Edit'
                                                                )}
                                                                className="size-8 p-0 text-slate-400 hover:text-slate-700"
                                                                onClick={() => startEdit(item)}
                                                            >
                                                                <Pencil className="size-3.5" />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                aria-label={t(
                                                                    'common.delete',
                                                                    'Delete'
                                                                )}
                                                                className="size-8 p-0 text-slate-400 hover:text-red-500 hover:bg-red-50"
                                                                onClick={() =>
                                                                    setDeleteConfirmId(item.id)
                                                                }
                                                            >
                                                                <Trash2 className="size-3.5" />
                                                            </Button>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Text */}
                                        <div className="flex-1 min-w-0">
                                            {isEditing ? (
                                                <div className="space-y-2">
                                                    <Textarea
                                                        value={editText}
                                                        onChange={(e) =>
                                                            setEditText(e.target.value)
                                                        }
                                                        className="text-sm rounded-xl min-h-[60px]"
                                                    />
                                                    <Input
                                                        value={editSource}
                                                        onChange={(e) =>
                                                            setEditSource(e.target.value)
                                                        }
                                                        placeholder={t(
                                                            'admin.concourse.source_placeholder',
                                                            'Source (optional)'
                                                        )}
                                                        className="h-8 text-xs rounded-lg"
                                                    />
                                                    <Input
                                                        value={editChangeNote}
                                                        onChange={(e) =>
                                                            setEditChangeNote(e.target.value)
                                                        }
                                                        placeholder={t(
                                                            'admin.concourse.change_note_placeholder',
                                                            'Change note (optional)'
                                                        )}
                                                        className="h-8 text-xs rounded-lg"
                                                        maxLength={500}
                                                    />
                                                    {tags && tags.length > 0 && (
                                                        <div className="flex flex-wrap gap-2">
                                                            {tags.map((tag) => (
                                                                <div
                                                                    key={tag.id}
                                                                    className="flex items-center gap-1.5 cursor-pointer"
                                                                >
                                                                    <Checkbox
                                                                        checked={editTagIds.includes(
                                                                            tag.id
                                                                        )}
                                                                        onCheckedChange={(
                                                                            checked
                                                                        ) => {
                                                                            setEditTagIds((prev) =>
                                                                                checked
                                                                                    ? [
                                                                                          ...prev,
                                                                                          tag.id,
                                                                                      ]
                                                                                    : prev.filter(
                                                                                          (id) =>
                                                                                              id !==
                                                                                              tag.id
                                                                                      )
                                                                            );
                                                                        }}
                                                                    />
                                                                    <Badge
                                                                        variant="outline"
                                                                        className="text-2xs h-5 cursor-pointer"
                                                                        style={
                                                                            tag.color
                                                                                ? {
                                                                                      borderColor:
                                                                                          tag.color,
                                                                                      color: tag.color,
                                                                                  }
                                                                                : undefined
                                                                        }
                                                                    >
                                                                        {tag.name}
                                                                    </Badge>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <>
                                                    <p className="text-sm text-slate-800 leading-normal">
                                                        {text}
                                                    </p>
                                                    {item.source && (
                                                        <p className="text-xs text-slate-500 mt-1 italic">
                                                            {item.source}
                                                        </p>
                                                    )}
                                                    {item.tags && item.tags.length > 0 && (
                                                        <div className="flex gap-1 mt-2">
                                                            {item.tags.map((tag) => (
                                                                <Badge
                                                                    key={tag.id}
                                                                    variant="outline"
                                                                    className="text-2xs h-5"
                                                                    style={
                                                                        tag.color
                                                                            ? {
                                                                                  borderColor:
                                                                                      tag.color,
                                                                                  color: tag.color,
                                                                              }
                                                                            : undefined
                                                                    }
                                                                >
                                                                    {tag.name}
                                                                </Badge>
                                                            ))}
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>

                                        {/* Status (desktop only — mobile shown in top row) */}
                                        <div className="hidden sm:block">
                                            {canEdit && !isEditing ? (
                                                <Select
                                                    value={item.status}
                                                    onValueChange={(val) =>
                                                        changeStatus(
                                                            item,
                                                            val as ConcourseItemStatus
                                                        )
                                                    }
                                                >
                                                    <SelectTrigger
                                                        className={cn(
                                                            'h-7 w-[100px] rounded-lg text-2xs font-bold border',
                                                            STATUS_COLORS[item.status] ?? ''
                                                        )}
                                                    >
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="rounded-xl">
                                                        <SelectItem value="proposed">
                                                            {t(
                                                                'admin.concourse.status.proposed',
                                                                'Proposed'
                                                            )}
                                                        </SelectItem>
                                                        <SelectItem value="accepted">
                                                            {t(
                                                                'admin.concourse.status.accepted',
                                                                'Accepted'
                                                            )}
                                                        </SelectItem>
                                                        <SelectItem value="rejected">
                                                            {t(
                                                                'admin.concourse.status.rejected',
                                                                'Rejected'
                                                            )}
                                                        </SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            ) : !isEditing ? (
                                                <Badge
                                                    variant="outline"
                                                    className={cn(
                                                        'text-2xs font-bold',
                                                        STATUS_COLORS[item.status] ?? ''
                                                    )}
                                                >
                                                    {item.status}
                                                </Badge>
                                            ) : null}
                                        </div>

                                        {/* Actions (desktop only — mobile shown in top row) */}
                                        {canEdit && (
                                            <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
                                                {isEditing ? (
                                                    <>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            aria-label={t('common.save', 'Save')}
                                                            className="size-8 p-0 text-emerald-600 hover:bg-emerald-50"
                                                            onClick={() => saveEdit(item)}
                                                            disabled={updateItemMutation.isPending}
                                                        >
                                                            {updateItemMutation.isPending ? (
                                                                <Loader2 className="size-3.5 animate-spin" />
                                                            ) : (
                                                                <Check className="size-3.5" />
                                                            )}
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            aria-label={t(
                                                                'common.cancel',
                                                                'Cancel'
                                                            )}
                                                            className="size-8 p-0 text-slate-400 hover:bg-slate-100"
                                                            onClick={() => setEditingItem(null)}
                                                        >
                                                            <X className="size-3.5" />
                                                        </Button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            aria-label={t(
                                                                'admin.concourse.history',
                                                                'History'
                                                            )}
                                                            className="size-8 p-0 text-slate-400 hover:text-slate-700 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                                                            onClick={() => {
                                                                setSheetItemId(item.id);
                                                                setSheetItemCode(item.code);
                                                                setSheetTab('history');
                                                            }}
                                                        >
                                                            <Clock className="size-3.5" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            aria-label={t(
                                                                'admin.concourse.comments',
                                                                'Comments'
                                                            )}
                                                            className="relative size-8 p-0 text-slate-400 hover:text-slate-700 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                                                            onClick={() => {
                                                                setSheetItemId(item.id);
                                                                setSheetItemCode(item.code);
                                                                setSheetTab('comments');
                                                            }}
                                                        >
                                                            <MessageSquare className="size-3.5" />
                                                            {(item.comment_count ?? 0) > 0 && (
                                                                <span className="absolute -top-1 -right-1 flex items-center justify-center size-4 rounded-full bg-indigo-600 text-white text-[9px] font-bold">
                                                                    {item.comment_count}
                                                                </span>
                                                            )}
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            aria-label={t('common.edit', 'Edit')}
                                                            className="size-8 p-0 text-slate-400 hover:text-slate-700 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                                                            onClick={() => startEdit(item)}
                                                        >
                                                            <Pencil className="size-3.5" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            aria-label={t(
                                                                'common.delete',
                                                                'Delete'
                                                            )}
                                                            className="size-8 p-0 text-slate-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                                                            onClick={() =>
                                                                setDeleteConfirmId(item.id)
                                                            }
                                                        >
                                                            <Trash2 className="size-3.5" />
                                                        </Button>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Add Item Dialog */}
            <Dialog open={addItemOpen} onOpenChange={setAddItemOpen}>
                <DialogContent className="border-slate-200 bg-white shadow-lg max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-black text-slate-900">
                            {t('admin.concourse.add_item', 'Add Item')}
                        </DialogTitle>
                        <DialogDescription className="text-sm text-slate-500">
                            {t(
                                'admin.concourse.add_item_desc',
                                'Add a new candidate statement to this concourse.'
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <div className="space-y-1">
                            <Label className="text-2xs font-black text-slate-500">
                                {t('admin.concourse.field_code', 'Code')}
                            </Label>
                            <Input
                                value={newCode}
                                onChange={(e) => setNewCode(e.target.value)}
                                placeholder="C1"
                                className="h-10 rounded-xl"
                                autoFocus
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-2xs font-black text-slate-500">
                                {t('admin.concourse.field_text', 'Statement text')} (
                                {activeLocale.toUpperCase()})
                            </Label>
                            <Textarea
                                value={newText}
                                onChange={(e) => setNewText(e.target.value)}
                                placeholder={t(
                                    'admin.concourse.field_text_placeholder',
                                    'Enter the statement text...'
                                )}
                                className="rounded-xl min-h-[80px]"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-2xs font-black text-slate-500">
                                {t('admin.concourse.field_source', 'Source')}
                                <span className="text-slate-400 font-normal ml-1">
                                    ({t('common.optional', 'optional')})
                                </span>
                            </Label>
                            <Input
                                value={newSource}
                                onChange={(e) => setNewSource(e.target.value)}
                                placeholder={t(
                                    'admin.concourse.source_placeholder',
                                    'e.g. Interview #3, Literature review'
                                )}
                                className="h-10 rounded-xl"
                            />
                        </div>
                        {tags && tags.length > 0 && (
                            <TagCheckboxGroup
                                tags={tags}
                                selectedIds={newTagIds}
                                onChange={setNewTagIds}
                                label={t('admin.concourse.field_tags', 'Tags')}
                            />
                        )}
                    </div>
                    <DialogFooter>
                        <Button
                            onClick={handleAddItem}
                            disabled={
                                !newCode.trim() || !newText.trim() || createItemMutation.isPending
                            }
                            className="h-10 rounded-xl px-6 font-bold bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                            {createItemMutation.isPending ? (
                                <Loader2 className="size-4 animate-spin mr-2" />
                            ) : (
                                <Plus className="size-4 mr-2" />
                            )}
                            {t('common.add', 'Add')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Item Confirmation Dialog */}
            <Dialog
                open={deleteConfirmId !== null}
                onOpenChange={(open) => {
                    if (!open) setDeleteConfirmId(null);
                }}
            >
                <DialogContent className="border-slate-200 bg-white shadow-lg max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-black text-slate-900">
                            {t('admin.concourse.delete_item_title', 'Delete Item')}
                        </DialogTitle>
                        <DialogDescription className="text-sm text-slate-500">
                            {t(
                                'admin.concourse.delete_item_confirm',
                                'Are you sure you want to delete this item? This cannot be undone.'
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2">
                        <Button
                            variant="outline"
                            className="rounded-xl"
                            onClick={() => setDeleteConfirmId(null)}
                        >
                            {t('common.cancel', 'Cancel')}
                        </Button>
                        <Button
                            variant="destructive"
                            className="rounded-xl"
                            disabled={deleteItemMutation.isPending}
                            onClick={async () => {
                                if (deleteConfirmId !== null) {
                                    await handleDelete(deleteConfirmId);
                                    setDeleteConfirmId(null);
                                }
                            }}
                        >
                            {deleteItemMutation.isPending ? (
                                <Loader2 className="size-4 animate-spin mr-2" />
                            ) : (
                                <Trash2 className="size-4 mr-2" />
                            )}
                            {t('common.delete', 'Delete')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Bulk Import Dialog */}
            <Dialog open={importOpen} onOpenChange={setImportOpen}>
                <DialogContent className="border-slate-200 bg-white shadow-lg max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-black text-slate-900">
                            {t('admin.concourse.bulk_import', 'Bulk Import')}
                        </DialogTitle>
                        <DialogDescription className="text-sm text-slate-500">
                            {t(
                                'admin.concourse.import_desc',
                                'Paste statements separated by newlines. Each line becomes one item.'
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <div className="space-y-1">
                            <Label className="text-2xs font-black text-slate-500">
                                {t('admin.concourse.import_prefix', 'Code prefix')}
                            </Label>
                            <Input
                                value={importPrefix}
                                onChange={(e) => setImportPrefix(e.target.value)}
                                className="h-10 rounded-xl w-32"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-2xs font-black text-slate-500">
                                {t('admin.concourse.import_statements', 'Statements')} (
                                {activeLocale.toUpperCase()})
                            </Label>
                            <Textarea
                                value={importText}
                                onChange={(e) => setImportText(e.target.value)}
                                placeholder={t(
                                    'admin.concourse.import_placeholder',
                                    'One statement per line...'
                                )}
                                className="rounded-xl min-h-[200px] font-mono text-sm"
                            />
                        </div>
                        {importText.trim() && (
                            <p className="text-xs text-slate-400">
                                {importText.split('\n').filter((l) => l.trim()).length}{' '}
                                {t('admin.concourse.items_to_import', 'statements to import')}
                            </p>
                        )}
                    </div>
                    <DialogFooter>
                        <Button
                            onClick={handleImport}
                            disabled={!importText.trim() || importMutation.isPending}
                            className="h-10 rounded-xl px-6 font-bold bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                            {importMutation.isPending ? (
                                <Loader2 className="size-4 animate-spin mr-2" />
                            ) : (
                                <Upload className="size-4 mr-2" />
                            )}
                            {t('admin.concourse.import_button', 'Import')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Tag Manager Dialog */}
            <Dialog open={tagManagerOpen} onOpenChange={setTagManagerOpen}>
                <DialogContent className="border-slate-200 bg-white shadow-lg max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-black text-slate-900">
                            {t('admin.concourse.manage_tags', 'Tags')}
                        </DialogTitle>
                        <DialogDescription className="text-sm text-slate-500">
                            {t(
                                'admin.concourse.manage_tags_desc',
                                'Create and manage tags to categorize concourse items by theme or dimension.'
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="flex gap-2">
                            <Input
                                value={newTagName}
                                onChange={(e) => setNewTagName(e.target.value)}
                                placeholder={t('admin.concourse.tag_name_placeholder', 'Tag name')}
                                className="h-9 rounded-xl flex-1"
                                maxLength={100}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleCreateTag();
                                }}
                            />
                            <input
                                type="color"
                                value={newTagColor}
                                onChange={(e) => setNewTagColor(e.target.value)}
                                className="h-9 w-9 rounded-lg border border-slate-200 cursor-pointer p-0.5"
                                title={t('admin.concourse.tag_color', 'Tag color')}
                            />
                            <Button
                                size="sm"
                                className="h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white"
                                disabled={!newTagName.trim() || createTagMutation.isPending}
                                onClick={handleCreateTag}
                            >
                                {createTagMutation.isPending ? (
                                    <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                    <Plus className="size-3.5" />
                                )}
                            </Button>
                        </div>
                        {tags && tags.length > 0 ? (
                            <div className="space-y-1.5">
                                {tags.map((tag) => (
                                    <div
                                        key={tag.id}
                                        className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2"
                                    >
                                        <div className="flex items-center gap-2">
                                            <div
                                                className="size-3 rounded-full"
                                                style={{ backgroundColor: tag.color ?? '#94a3b8' }}
                                            />
                                            <span className="text-sm font-medium text-slate-700">
                                                {tag.name}
                                            </span>
                                        </div>
                                        {deleteTagId === tag.id ? (
                                            <div className="flex items-center gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 px-2 text-red-600 hover:bg-red-50 text-xs"
                                                    disabled={deleteTagMutation.isPending}
                                                    onClick={() => handleDeleteTag(tag.id)}
                                                >
                                                    {deleteTagMutation.isPending ? (
                                                        <Loader2 className="size-3 animate-spin" />
                                                    ) : (
                                                        t('common.confirm', 'Confirm')
                                                    )}
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 px-2 text-slate-400 text-xs"
                                                    onClick={() => setDeleteTagId(null)}
                                                >
                                                    <X className="size-3" />
                                                </Button>
                                            </div>
                                        ) : (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 w-7 p-0 text-slate-400 hover:text-red-500 hover:bg-red-50"
                                                onClick={() => setDeleteTagId(tag.id)}
                                            >
                                                <Trash2 className="size-3.5" />
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-center text-sm text-slate-400 py-4">
                                {t(
                                    'admin.concourse.no_tags',
                                    'No tags yet. Create your first tag above.'
                                )}
                            </p>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Item Detail Sheet (History & Comments) */}
            <ItemDetailSheet
                open={sheetItemId !== null}
                onOpenChange={(open) => {
                    if (!open) setSheetItemId(null);
                }}
                concourseId={id}
                itemId={sheetItemId}
                itemCode={sheetItemCode}
                defaultTab={sheetTab}
            />
        </div>
    );
}

function TagCheckboxGroup({
    tags,
    selectedIds,
    onChange,
    label,
}: {
    tags: ConcourseTagRead[];
    selectedIds: number[];
    onChange: (ids: number[]) => void;
    label: string;
}) {
    return (
        <div className="space-y-1">
            <Label className="text-2xs font-black text-slate-500">
                {label}
                <span className="text-slate-400 font-normal ml-1">
                    ({selectedIds.length}/{tags.length})
                </span>
            </Label>
            <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                    <div key={tag.id} className="flex items-center gap-1.5 cursor-pointer">
                        <Checkbox
                            checked={selectedIds.includes(tag.id)}
                            onCheckedChange={(checked) => {
                                onChange(
                                    checked
                                        ? [...selectedIds, tag.id]
                                        : selectedIds.filter((id) => id !== tag.id)
                                );
                            }}
                        />
                        <Badge
                            variant="outline"
                            className="text-2xs h-5 cursor-pointer"
                            style={
                                tag.color ? { borderColor: tag.color, color: tag.color } : undefined
                            }
                        >
                            {tag.name}
                        </Badge>
                    </div>
                ))}
            </div>
        </div>
    );
}
