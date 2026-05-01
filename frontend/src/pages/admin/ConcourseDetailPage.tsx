/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
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
    Globe,
    FileSpreadsheet,
    NotebookPen,
} from 'lucide-react';
import { parseConcourseCsv } from '@/utils/parseCsvTsv';
import { Card, CardContent } from '@/components/ui/card';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
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
import type { ConcourseItemStatus, ConcourseTagRead } from '@/api/model';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { ItemDetailSheet } from '@/components/admin/concourse/ItemDetailSheet';
import { useConcourseDetailPage } from '@/hooks/admin/useConcourseDetailPage';
import { MemoSection } from '@/components/admin/memo/MemoSection';
import { useMemoUnreadBadge } from '@/hooks/admin/useMemoUnreadBadge';
import { useAuthStore } from '@/store/useAuthStore';
import { usePermission } from '@/hooks/usePermission';
import { useAdminContext } from '@/hooks/useAdminContext';

const STATUS_COLORS: Record<string, string> = {
    proposed: 'bg-amber-100 text-amber-800 border-amber-200',
    accepted: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    rejected: 'bg-red-100 text-red-800 border-red-200',
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: declarative shell rendering many sections (filters, list, multiple dialogs); state-and-effect logic lives in useConcourseDetailPage
export default function ConcourseDetailPage() {
    const { t } = useTranslation();
    const api = useConcourseDetailPage();
    const { user: currentUser } = useAuthStore();
    const { role: projectRole } = usePermission();
    const { project } = useAdminContext();
    const projectMembers = (project?.members ?? []).map((m) => ({
        user_id: m.user_id,
        display_name: m.user.full_name ?? m.user.email,
    }));
    const {
        id,
        canEdit,
        memberNames,
        concourse,
        isLoading,
        tags,
        statusLabel,
        langDisplayName,
        filterStatus,
        setFilterStatus,
        filterTag,
        setFilterTag,
        searchQuery,
        setSearchQuery,
        activeLocale,
        setActiveLocale,
        languages,
        missingCountByLang,
        commonLanguages,
        addLangOpen,
        setAddLangOpen,
        newLangCode,
        setNewLangCode,
        confirmAddLanguage,
        filteredItems,
        selectedItems,
        setSelectedItems,
        toggleSelectItem,
        toggleSelectAll,
        bulkActionPending,
        bulkConfirm,
        setBulkConfirm,
        handleBulkStatusChange,
        addItemOpen,
        setAddItemOpen,
        openAddItemDialog,
        newCode,
        setNewCode,
        newText,
        setNewText,
        newSource,
        setNewSource,
        newTagIds,
        setNewTagIds,
        newItemLocale,
        setNewItemLocale,
        handleAddItem,
        isCreatingItem,
        editingItem,
        setEditingItem,
        editCode,
        setEditCode,
        editText,
        setEditText,
        editSource,
        setEditSource,
        editChangeNote,
        setEditChangeNote,
        editTagIds,
        setEditTagIds,
        startEdit,
        saveEdit,
        isUpdatingItem,
        changeStatus,
        deleteConfirmId,
        setDeleteConfirmId,
        handleDelete,
        isDeletingItem,
        importOpen,
        setImportOpen,
        openImportDialog,
        importText,
        setImportText,
        importPrefix,
        setImportPrefix,
        importLocale,
        setImportLocale,
        handleImport,
        isImporting,
        tagManagerOpen,
        setTagManagerOpen,
        newTagName,
        setNewTagName,
        newTagColor,
        setNewTagColor,
        deleteTagId,
        setDeleteTagId,
        handleCreateTag,
        handleDeleteTag,
        isCreatingTag,
        isDeletingTag,
        sheetItemId,
        sheetItemCode,
        sheetTab,
        openSheet,
        closeSheet,
        exportCsv,
    } = api;

    const memoUnreadCount = useMemoUnreadBadge(
        'concourse',
        concourse?.id ?? 0,
        currentUser?.id ?? 0
    );

    // ── Bulk-import file picker ─────────────────────────────────────
    // Researchers can also drop a CSV/TSV file into the bulk-import
    // dialog. We parse client-side, surface per-row errors, and feed the
    // text-only column into the existing textarea so the user can review
    // before clicking Importer (no backend contract change).
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [csvErrors, setCsvErrors] = useState<string[]>([]);
    const [csvSkippedLangs, setCsvSkippedLangs] = useState<string[]>([]);
    const [memoOpen, setMemoOpen] = useState(false);

    const handleCsvFile = async (file: File) => {
        const text = await file.text();
        const result = parseConcourseCsv(text);
        const targetLang = (importLocale || activeLocale).toLowerCase();
        const matchingRows = result.rows.filter((r) => r.language === targetLang);
        const skippedLangs = Array.from(
            new Set(result.rows.filter((r) => r.language !== targetLang).map((r) => r.language))
        );

        if (result.errors.length === 0 && matchingRows.length === 0 && result.rows.length > 0) {
            toast.error(
                t(
                    'admin.concourse.import_csv_no_match',
                    'No rows match the selected language ({{lang}}).',
                    { lang: targetLang.toUpperCase() }
                )
            );
        }

        setCsvErrors(result.errors);
        setCsvSkippedLangs(skippedLangs);
        if (matchingRows.length > 0) {
            setImportText(matchingRows.map((r) => r.text).join('\n'));
        }
    };

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

    return (
        <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6 pt-2">
            {/* Header */}
            <StudyPageHeader
                title={t('admin.concourse.title', 'Concourse')}
                icon={Library}
                actions={
                    <div className="flex items-center gap-2">
                        {canEdit && (
                            <Button
                                size="sm"
                                className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white"
                                onClick={openAddItemDialog}
                            >
                                <Plus className="size-4 sm:mr-1" />
                                <span className="hidden sm:inline">
                                    {t('admin.concourse.add_item', 'Add Item')}
                                </span>
                            </Button>
                        )}
                        {canEdit && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="rounded-xl"
                                onClick={openImportDialog}
                            >
                                <Upload className="size-4 sm:mr-1" />
                                <span className="hidden sm:inline">
                                    {t('admin.concourse.bulk_import', 'Bulk Import')}
                                </span>
                            </Button>
                        )}
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
                        <Button
                            variant="outline"
                            size="icon"
                            className="rounded-xl relative"
                            onClick={() => setMemoOpen(true)}
                            aria-label={t('admin.memo.title_concourse', 'Selection notes')}
                            title={t('admin.memo.title_concourse', 'Selection notes')}
                        >
                            <NotebookPen className="size-4" />
                            {memoUnreadCount > 0 && (
                                <span className="absolute -top-1 -right-1 rounded-full bg-amber-100 text-amber-800 text-[10px] leading-none px-1.5 py-0.5 font-medium border border-white">
                                    {memoUnreadCount}
                                </span>
                            )}
                        </Button>
                    </div>
                }
            />

            <Sheet open={memoOpen} onOpenChange={setMemoOpen}>
                <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
                    <SheetHeader>
                        <SheetTitle>
                            {t('admin.memo.title_concourse', 'Selection notes')}
                        </SheetTitle>
                        <SheetDescription>
                            {t(
                                'admin.memo.summary_empty_concourse',
                                'How and why you built this concourse'
                            )}
                        </SheetDescription>
                    </SheetHeader>
                    <div className="mt-4">
                        {concourse && currentUser && (
                            <MemoSection
                                parentType="concourse"
                                parentId={concourse.id}
                                currentUserId={currentUser.id}
                                isOwner={projectRole === 'owner'}
                                canEdit={projectRole === 'owner' || projectRole === 'researcher'}
                                members={projectMembers}
                            />
                        )}
                    </div>
                </SheetContent>
            </Sheet>

            {/* Filters */}
            <div className="flex flex-col gap-2">
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
                </div>
                <div className="flex flex-wrap items-center gap-3">
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
                    {/* Language: tabs when multiple, subtle add button when single */}
                    {languages.length > 1 ? (
                        <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-0.5">
                            {languages.map((lang) => (
                                <button
                                    key={lang}
                                    type="button"
                                    onClick={() => setActiveLocale(lang)}
                                    className={`relative h-8 px-3 rounded-lg text-xs font-bold transition-colors ${
                                        activeLocale === lang
                                            ? 'bg-white text-slate-900 shadow-sm'
                                            : 'text-slate-500 hover:text-slate-700'
                                    }`}
                                    title={langDisplayName(lang)}
                                >
                                    {lang.toUpperCase()}
                                    {missingCountByLang[lang] && (
                                        <span className="absolute -top-1 -right-1 size-4 rounded-full bg-amber-400 text-[10px] font-bold text-white flex items-center justify-center">
                                            {missingCountByLang[lang]}
                                        </span>
                                    )}
                                </button>
                            ))}
                            {canEdit && (
                                <button
                                    type="button"
                                    onClick={() => setAddLangOpen(true)}
                                    className="h-8 px-2 rounded-lg text-xs font-bold text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 transition-colors"
                                    title={t('admin.concourse.add_language', 'Add language')}
                                >
                                    +
                                </button>
                            )}
                        </div>
                    ) : (
                        <>
                            {languages.length === 1 && languages[0] && (
                                <span className="text-xs text-slate-400 flex items-center gap-1">
                                    <Globe className="size-3" />
                                    {langDisplayName(languages[0])}
                                </span>
                            )}
                            {canEdit && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-9 rounded-xl text-xs text-slate-400 hover:text-indigo-600"
                                    onClick={() => setAddLangOpen(true)}
                                    title={t(
                                        'admin.concourse.add_language_tooltip',
                                        'Add a translation language'
                                    )}
                                >
                                    + {t('admin.concourse.add_language', 'Add language')}
                                </Button>
                            )}
                        </>
                    )}
                    <span className="text-xs text-slate-400 ml-auto">
                        {filteredItems.length} / {concourse.items?.length ?? 0}{' '}
                        {t('admin.concourse.items_label', 'items')}
                    </span>
                </div>
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
                            onClick={() => setBulkConfirm('proposed' as ConcourseItemStatus)}
                        >
                            {t('admin.concourse.status.proposed', 'Proposed')}
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-7 rounded-lg text-2xs font-bold bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100"
                            disabled={bulkActionPending}
                            onClick={() => setBulkConfirm('accepted' as ConcourseItemStatus)}
                        >
                            {t('admin.concourse.status.accepted', 'Accepted')}
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-7 rounded-lg text-2xs font-bold bg-red-50 border-red-200 text-red-800 hover:bg-red-100"
                            disabled={bulkActionPending}
                            onClick={() => setBulkConfirm('rejected' as ConcourseItemStatus)}
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
                            {/* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: row rendering — many cooperating visual states (selection, edit mode, status, missing translation, mobile/desktop layouts, hover-only actions). Same shell-suppression precedent as the page-level biome-ignore on line 78 (CLAUDE.md). */}
                            {filteredItems.map((item) => {
                                const activeTranslation = item.translations?.find(
                                    (tr) => tr.language_code === activeLocale
                                );
                                const fallbackTranslation = activeTranslation
                                    ? null
                                    : (item.translations?.[0] ?? null);
                                const text =
                                    activeTranslation?.text ?? fallbackTranslation?.text ?? '';
                                const isMissingTranslation =
                                    !activeTranslation && !!fallbackTranslation;
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
                                                        {statusLabel(item.status)}
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
                                                                disabled={isUpdatingItem}
                                                            >
                                                                {isUpdatingItem ? (
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
                                                                onClick={() =>
                                                                    openSheet(item, 'history')
                                                                }
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
                                                                onClick={() =>
                                                                    openSheet(item, 'comments')
                                                                }
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
                                                                            setEditTagIds(
                                                                                checked
                                                                                    ? [
                                                                                          ...editTagIds,
                                                                                          tag.id,
                                                                                      ]
                                                                                    : editTagIds.filter(
                                                                                          (tid) =>
                                                                                              tid !==
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
                                                    <p
                                                        className={cn(
                                                            'text-sm leading-normal',
                                                            isMissingTranslation
                                                                ? 'text-slate-400 italic'
                                                                : 'text-slate-800'
                                                        )}
                                                    >
                                                        {isMissingTranslation && (
                                                            <span className="text-2xs font-bold text-amber-500 mr-1.5 not-italic">
                                                                {fallbackTranslation?.language_code?.toUpperCase()}
                                                            </span>
                                                        )}
                                                        {text || (
                                                            <span className="text-slate-300">
                                                                {t(
                                                                    'admin.concourse.no_translation',
                                                                    'No text'
                                                                )}
                                                            </span>
                                                        )}
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
                                                    {statusLabel(item.status)}
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
                                                            disabled={isUpdatingItem}
                                                        >
                                                            {isUpdatingItem ? (
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
                                                            className="size-8 p-0 text-slate-400 hover:text-slate-700 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                                                            onClick={() =>
                                                                openSheet(item, 'history')
                                                            }
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
                                                            className="relative size-8 p-0 text-slate-400 hover:text-slate-700 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                                                            onClick={() =>
                                                                openSheet(item, 'comments')
                                                            }
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
                                                            className="size-8 p-0 text-slate-300 hover:text-slate-700 transition-colors"
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
                                                            className="size-8 p-0 text-slate-400 hover:text-red-500 hover:bg-red-50 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
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
                        {!activeLocale && (
                            <div className="space-y-1">
                                <Label className="text-2xs font-black text-slate-500">
                                    {t('admin.concourse.field_language', 'Language')}
                                </Label>
                                <Select
                                    value={newItemLocale}
                                    onValueChange={(val) => setNewItemLocale(val)}
                                >
                                    <SelectTrigger className="h-10 rounded-xl">
                                        <SelectValue
                                            placeholder={t(
                                                'admin.concourse.select_language',
                                                'Select language'
                                            )}
                                        />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-xl max-h-60">
                                        {/* Study languages first — these are the languages the
                                            researcher actually configured for this study. */}
                                        {languages.map((lang) => (
                                            <SelectItem key={lang} value={lang}>
                                                {langDisplayName(lang)} ({lang})
                                            </SelectItem>
                                        ))}
                                        {/* Other ISO languages after, for the rare case where
                                            the researcher wants to add an item in a language
                                            not yet declared on the study. Mirrors the bulk-
                                            import dialog so behavior is consistent. */}
                                        {commonLanguages.map((lang) => (
                                            <SelectItem key={lang.code} value={lang.code}>
                                                {lang.name} ({lang.code})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                        <div className="space-y-1">
                            <Label className="text-2xs font-black text-slate-500">
                                {t('admin.concourse.field_text', 'Statement text')}{' '}
                                {(activeLocale || newItemLocale) &&
                                    `(${langDisplayName(activeLocale || newItemLocale)})`}
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
                                !newCode.trim() ||
                                !newText.trim() ||
                                (!activeLocale && !newItemLocale) ||
                                isCreatingItem
                            }
                            className="h-10 rounded-xl px-6 font-bold bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                            {isCreatingItem ? (
                                <Loader2 className="size-4 animate-spin mr-2" />
                            ) : (
                                <Plus className="size-4 mr-2" />
                            )}
                            {t('common.add', 'Add')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Bulk Status Confirmation Dialog */}
            <Dialog
                open={bulkConfirm !== null}
                onOpenChange={(open) => {
                    if (!open) setBulkConfirm(null);
                }}
            >
                <DialogContent className="border-slate-200 bg-white shadow-lg max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-black text-slate-900">
                            {t('admin.concourse.bulk_confirm_title', 'Confirm status change')}
                        </DialogTitle>
                        <DialogDescription className="text-sm text-slate-500">
                            {t(
                                'admin.concourse.bulk_confirm_desc',
                                'Set {{count}} items to "{{status}}"?',
                                {
                                    count: selectedItems.size,
                                    status: bulkConfirm ? statusLabel(bulkConfirm) : '',
                                }
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2">
                        <Button
                            variant="outline"
                            className="rounded-xl"
                            onClick={() => setBulkConfirm(null)}
                        >
                            {t('common.cancel', 'Cancel')}
                        </Button>
                        <Button
                            className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white"
                            disabled={bulkActionPending}
                            onClick={async () => {
                                if (bulkConfirm) {
                                    await handleBulkStatusChange(bulkConfirm);
                                    setBulkConfirm(null);
                                }
                            }}
                        >
                            {bulkActionPending ? (
                                <Loader2 className="size-4 animate-spin mr-2" />
                            ) : null}
                            {t('common.confirm', 'Confirm')}
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
                                'Delete this item? Cannot be undone.'
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
                            disabled={isDeletingItem}
                            onClick={async () => {
                                if (deleteConfirmId !== null) {
                                    await handleDelete(deleteConfirmId);
                                    setDeleteConfirmId(null);
                                }
                            }}
                        >
                            {isDeletingItem ? (
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
                                {t('admin.concourse.import_language', 'Language')}
                            </Label>
                            <Select
                                value={importLocale || activeLocale}
                                onValueChange={(val) => setImportLocale(val)}
                            >
                                <SelectTrigger className="h-10 rounded-xl w-48">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl max-h-60">
                                    {languages.map((lang) => (
                                        <SelectItem key={lang} value={lang}>
                                            {langDisplayName(lang)} ({lang})
                                        </SelectItem>
                                    ))}
                                    {commonLanguages.map((lang) => (
                                        <SelectItem key={lang.code} value={lang.code}>
                                            {lang.name} ({lang.code})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <div className="flex items-center justify-between gap-2">
                                <Label className="text-2xs font-black text-slate-500">
                                    {t('admin.concourse.import_statements', 'Statements')}
                                    {(importLocale || activeLocale) &&
                                        ` (${langDisplayName(importLocale || activeLocale)})`}
                                </Label>
                                <div className="flex items-center gap-1">
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".csv,.tsv,text/csv,text/tab-separated-values"
                                        className="hidden"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                void handleCsvFile(file);
                                            }
                                            // allow reselecting the same file later
                                            e.target.value = '';
                                        }}
                                    />
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="h-7 rounded-lg text-xs font-semibold gap-1.5"
                                    >
                                        <FileSpreadsheet className="size-3.5" />
                                        {t('admin.concourse.import_from_csv', 'Import CSV/TSV…')}
                                    </Button>
                                </div>
                            </div>
                            <Textarea
                                value={importText}
                                onChange={(e) => setImportText(e.target.value)}
                                placeholder={t(
                                    'admin.concourse.import_placeholder',
                                    'One statement per line...'
                                )}
                                className="rounded-xl min-h-[200px] font-mono text-sm"
                            />
                            <p className="text-xs text-slate-400">
                                {t(
                                    'admin.concourse.import_csv_hint',
                                    'CSV/TSV needs columns: code, language, text.'
                                )}
                            </p>
                            {csvErrors.length > 0 && (
                                <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2 space-y-0.5">
                                    {csvErrors.slice(0, 5).map((err) => (
                                        <p key={err}>• {err}</p>
                                    ))}
                                    {csvErrors.length > 5 && (
                                        <p>
                                            …{' '}
                                            {t(
                                                'admin.concourse.import_csv_more_errors',
                                                '{{count}} more issues',
                                                { count: csvErrors.length - 5 }
                                            )}
                                        </p>
                                    )}
                                </div>
                            )}
                            {csvSkippedLangs.length > 0 && (
                                <p className="text-xs text-amber-700">
                                    {t(
                                        'admin.concourse.import_csv_skipped',
                                        'Skipped {{count}} row(s) in other languages: {{langs}}.',
                                        {
                                            count: csvSkippedLangs.length,
                                            langs: csvSkippedLangs
                                                .map((l) => l.toUpperCase())
                                                .join(', '),
                                        }
                                    )}
                                </p>
                            )}
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
                            disabled={!importText.trim() || isImporting}
                            className="h-10 rounded-xl px-6 font-bold bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                            {isImporting ? (
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
                                disabled={!newTagName.trim() || isCreatingTag}
                                onClick={handleCreateTag}
                            >
                                {isCreatingTag ? (
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
                                                    disabled={isDeletingTag}
                                                    onClick={() => handleDeleteTag(tag.id)}
                                                >
                                                    {isDeletingTag ? (
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

            {/* Add Language Dialog */}
            <Dialog open={addLangOpen} onOpenChange={setAddLangOpen}>
                <DialogContent className="border-slate-200 bg-white shadow-lg max-w-xs">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-black text-slate-900">
                            {t('admin.concourse.add_language', 'Add language')}
                        </DialogTitle>
                        <DialogDescription className="text-sm text-slate-500">
                            {t(
                                'admin.concourse.add_language_desc_v2',
                                'Select a language for statement translations.'
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <Select value={newLangCode} onValueChange={(val) => setNewLangCode(val)}>
                        <SelectTrigger className="h-10 rounded-xl">
                            <SelectValue
                                placeholder={t(
                                    'admin.concourse.select_language',
                                    'Select language'
                                )}
                            />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl max-h-60">
                            {commonLanguages.map((lang) => (
                                <SelectItem key={lang.code} value={lang.code}>
                                    {lang.name} ({lang.code})
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <DialogFooter>
                        <Button
                            onClick={confirmAddLanguage}
                            disabled={!newLangCode}
                            className="h-10 rounded-xl px-6 font-bold bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                            {t('common.add', 'Add')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Item Detail Sheet (History & Comments) */}
            <ItemDetailSheet
                open={sheetItemId !== null}
                onOpenChange={(open) => {
                    if (!open) closeSheet();
                }}
                concourseId={id}
                itemId={sheetItemId}
                itemCode={sheetItemCode}
                defaultTab={sheetTab}
                memberNames={memberNames}
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
