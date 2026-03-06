import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    Library,
    Plus,
    Upload,
    Trash2,
    Loader2,
    ArrowLeft,
    Check,
    X,
    Tag,
    Pencil,
    Clock,
    MessageSquare,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useAdminContext } from '@/hooks/useAdminContext';
import { usePermission } from '@/hooks/usePermission';
import {
    useGetConcourseApiAdminConcoursesConcourseIdGet,
    useCreateItemApiAdminConcoursesConcourseIdItemsPost,
    useUpdateItemApiAdminConcoursesConcourseIdItemsItemIdPatch,
    useDeleteItemApiAdminConcoursesConcourseIdItemsItemIdDelete,
    useImportItemsFromTextApiAdminConcoursesConcourseIdItemsImportPost,
    useListTagsApiAdminConcoursesTagsGet,
    useDeleteConcourseApiAdminConcoursesConcourseIdDelete,
    getGetConcourseApiAdminConcoursesConcourseIdGetQueryKey,
    getListConcoursesApiAdminConcoursesGetQueryKey,
} from '@/api/generated';
import type { ConcourseItemRead, ConcourseItemStatus } from '@/api/model';
import { useQueryClient } from '@tanstack/react-query';
import { parseApiErrorSync } from '@/lib/error-utils';
import { cn } from '@/lib/utils';
import { ItemDetailSheet } from '@/components/admin/concourse/ItemDetailSheet';

const STATUS_COLORS: Record<string, string> = {
    proposed: 'bg-amber-100 text-amber-800 border-amber-200',
    accepted: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    rejected: 'bg-red-100 text-red-800 border-red-200',
};

export default function ConcourseDetailPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { workspace } = useAdminContext();
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

    // Mutations
    const createItemMutation = useCreateItemApiAdminConcoursesConcourseIdItemsPost();
    const updateItemMutation = useUpdateItemApiAdminConcoursesConcourseIdItemsItemIdPatch();
    const deleteItemMutation = useDeleteItemApiAdminConcoursesConcourseIdItemsItemIdDelete();
    const importMutation = useImportItemsFromTextApiAdminConcoursesConcourseIdItemsImportPost();
    const deleteConcourseMutation = useDeleteConcourseApiAdminConcoursesConcourseIdDelete();

    const invalidate = () =>
        queryClient.invalidateQueries({
            queryKey: getGetConcourseApiAdminConcoursesConcourseIdGetQueryKey(id),
        });

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

    // Add item
    const [newCode, setNewCode] = useState('');
    const [newText, setNewText] = useState('');
    const [newSource, setNewSource] = useState('');

    const handleAddItem = async () => {
        if (!newCode.trim() || !newText.trim()) return;
        try {
            await createItemMutation.mutateAsync({
                concourseId: id,
                data: {
                    code: newCode.trim(),
                    source: newSource.trim() || null,
                    translations: [{ language_code: activeLocale, text: newText.trim() }],
                    tag_ids: [],
                },
            });
            await invalidate();
            setAddItemOpen(false);
            setNewCode('');
            setNewText('');
            setNewSource('');
            toast.success(t('admin.concourse.item_created', 'Item added'));
        } catch (err) {
            toast.error(
                parseApiErrorSync(err, t('admin.concourse.item_create_error', 'Failed to add item'))
            );
        }
    };

    // Edit item
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

    // Delete concourse
    const [deleteConcourseOpen, setDeleteConcourseOpen] = useState(false);
    const handleDeleteConcourse = async () => {
        try {
            await deleteConcourseMutation.mutateAsync({ concourseId: id });
            await queryClient.invalidateQueries({
                queryKey: getListConcoursesApiAdminConcoursesGetQueryKey(),
            });
            toast.success(t('admin.concourse.deleted', 'Concourse deleted'));
            navigate(`/app/${workspace?.slug}/concourses`);
        } catch (err) {
            toast.error(
                parseApiErrorSync(
                    err,
                    t('admin.concourse.delete_error', 'Failed to delete concourse')
                )
            );
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
                            onClick={() => navigate(`/app/${workspace?.slug}/concourses`)}
                        >
                            <ArrowLeft className="size-4 sm:mr-1" />
                            <span className="hidden sm:inline">{t('common.back', 'Back')}</span>
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
                                        className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3 px-4 py-3 hover:bg-slate-50/50 transition-colors group"
                                    >
                                        {/* Code + Status (mobile: same row) */}
                                        <div className="flex items-center gap-2 sm:contents">
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

            {/* Danger Zone */}
            {can('workspace:delete') && (
                <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden border-l-4 border-l-red-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-black text-red-700">
                            {t('admin.concourse.danger_zone', 'Danger Zone')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Button
                            variant="outline"
                            size="sm"
                            className="border-red-200 text-red-600 hover:bg-red-50 rounded-xl"
                            onClick={() => setDeleteConcourseOpen(true)}
                        >
                            <Trash2 className="size-4 mr-1" />
                            {t('admin.concourse.delete', 'Delete Concourse')}
                        </Button>
                    </CardContent>
                </Card>
            )}

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

            {/* Delete Concourse Confirmation Dialog */}
            <Dialog open={deleteConcourseOpen} onOpenChange={setDeleteConcourseOpen}>
                <DialogContent className="border-slate-200 bg-white shadow-lg max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-black text-slate-900">
                            {t('admin.concourse.delete', 'Delete Concourse')}
                        </DialogTitle>
                        <DialogDescription className="text-sm text-slate-500">
                            {t(
                                'admin.concourse.delete_confirm',
                                'Are you sure you want to delete this concourse and all its items?'
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2">
                        <Button
                            variant="outline"
                            className="rounded-xl"
                            onClick={() => setDeleteConcourseOpen(false)}
                        >
                            {t('common.cancel', 'Cancel')}
                        </Button>
                        <Button
                            variant="destructive"
                            className="rounded-xl"
                            disabled={deleteConcourseMutation.isPending}
                            onClick={async () => {
                                await handleDeleteConcourse();
                                setDeleteConcourseOpen(false);
                            }}
                        >
                            {deleteConcourseMutation.isPending ? (
                                <Loader2 className="size-4 animate-spin mr-2" />
                            ) : (
                                <Trash2 className="size-4 mr-2" />
                            )}
                            {t('admin.concourse.delete', 'Delete Concourse')}
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
