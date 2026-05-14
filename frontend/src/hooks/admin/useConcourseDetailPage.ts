/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * useConcourseDetailPage hook
 *
 * Encapsulates the durable state-and-effect logic for the Concourse Detail
 * admin page. ConcourseDetailPage receives this hook's return value and
 * renders JSX from it.
 *
 * Logic that moves here:
 * - Route param parsing (concourseId)
 * - Concourse + tags react-query (with 15s polling refetchInterval)
 * - Filter / search / active-locale state + derived filtered items
 * - Add-item form fields, edit-item form fields, bulk-import form fields
 * - Tag manager state + create/delete tag mutations
 * - Multi-select state + bulk status change mutation
 * - Item-detail sheet open state + which tab to open it on
 * - Add/import/delete/edit dialog open state
 * - Add-language dialog state + auto-derived "common languages"
 * - All mutation handlers (toast + invalidate orchestration)
 * - CSV export of currently filtered items
 * - openAddItemDialog: pre-computes next code from the existing items
 *
 * Visual-only state that stays in the component:
 * - STATUS_COLORS constant (pure presentation)
 * - TagCheckboxGroup leaf component (pure presentation)
 *
 * Permission and project context (`canEdit`, `memberNames`) are derived in
 * the hook so the JSX consumes a single source of truth.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

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
import type {
    ConcourseDetailRead,
    ConcourseItemRead,
    ConcourseItemStatus,
    ConcourseTagRead,
} from '@/api/model';
import { parseApiErrorSync } from '@/lib/error-utils';
import { useAdminContext } from '@/hooks/useAdminContext';
import { usePermission } from '@/hooks/usePermission';
import { SUPPORTED_LANGUAGES } from '@/constants/languages';

// ────────────────────────────────────────────────────────────────
// Pure helpers (exported for unit tests)
// ────────────────────────────────────────────────────────────────

/**
 * Compute the next code for a new item by inspecting existing codes.
 * Matches purely-numeric or "<prefix><digits>" patterns; returns
 * "<prefix><max+1>".
 */
export function computeNextCode(items: readonly ConcourseItemRead[]): string {
    const maxNum = items.reduce((max, item) => {
        const match = item.code?.match(/^(\d+)$/);
        if (match) return Math.max(max, Number(match[1]));
        const prefixed = item.code?.match(/^([A-Za-z]+)(\d+)$/);
        if (prefixed) return Math.max(max, Number(prefixed[2]));
        return max;
    }, 0);
    const prefixes = items
        .map((item) => item.code?.match(/^([A-Za-z]+)\d+$/)?.[1])
        .filter((p): p is string => Boolean(p));
    const prefix = prefixes.length > 0 ? prefixes[prefixes.length - 1] : '';
    return `${prefix}${maxNum + 1}`;
}

/**
 * CSV-escape a value: wrap in quotes if it contains a comma, quote, or newline.
 */
export function csvEscape(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

interface CommonLanguage {
    code: string;
    name: string;
}

// ────────────────────────────────────────────────────────────────
// Public API surface
// ────────────────────────────────────────────────────────────────

export interface ConcourseDetailPageApi {
    // Route + permissions
    id: number;
    canEdit: boolean;
    memberNames: Record<number, string>;

    // Queries
    concourse: ConcourseDetailRead | undefined;
    isLoading: boolean;
    tags: ConcourseTagRead[] | undefined;

    // i18n helpers
    statusLabel: (status: string) => string;
    langDisplayName: (code: string) => string;

    // Filters / search
    filterStatus: string;
    setFilterStatus: (value: string) => void;
    filterTag: string;
    setFilterTag: (value: string) => void;
    searchQuery: string;
    setSearchQuery: (value: string) => void;

    // Locale state
    activeLocale: string;
    setActiveLocale: (value: string) => void;
    languages: string[];
    missingCountByLang: Record<string, number>;
    commonLanguages: CommonLanguage[];
    addLangOpen: boolean;
    setAddLangOpen: (open: boolean) => void;
    newLangCode: string;
    setNewLangCode: (value: string) => void;
    confirmAddLanguage: () => void;

    // Derived data
    filteredItems: ConcourseItemRead[];

    // Multi-select + bulk actions
    selectedItems: Set<number>;
    setSelectedItems: (next: Set<number>) => void;
    toggleSelectItem: (itemId: number) => void;
    toggleSelectAll: () => void;
    bulkActionPending: boolean;
    bulkConfirm: ConcourseItemStatus | null;
    setBulkConfirm: (value: ConcourseItemStatus | null) => void;
    handleBulkStatusChange: (status: ConcourseItemStatus) => Promise<void>;

    // Add-item dialog
    addItemOpen: boolean;
    setAddItemOpen: (open: boolean) => void;
    openAddItemDialog: () => void;
    newCode: string;
    setNewCode: (value: string) => void;
    newText: string;
    setNewText: (value: string) => void;
    newSource: string;
    setNewSource: (value: string) => void;
    newTagIds: number[];
    setNewTagIds: (ids: number[]) => void;
    newItemLocale: string;
    setNewItemLocale: (value: string) => void;
    handleAddItem: () => Promise<void>;
    isCreatingItem: boolean;

    // Edit-item state
    editingItem: number | null;
    setEditingItem: (id: number | null) => void;
    editCode: string;
    setEditCode: (value: string) => void;
    editText: string;
    setEditText: (value: string) => void;
    editSource: string;
    setEditSource: (value: string) => void;
    editChangeNote: string;
    setEditChangeNote: (value: string) => void;
    editTagIds: number[];
    setEditTagIds: (ids: number[]) => void;
    startEdit: (item: ConcourseItemRead) => void;
    saveEdit: (item: ConcourseItemRead) => Promise<void>;
    isUpdatingItem: boolean;

    // Inline status change
    changeStatus: (item: ConcourseItemRead, status: ConcourseItemStatus) => Promise<void>;

    // Delete-item state
    deleteConfirmId: number | null;
    setDeleteConfirmId: (id: number | null) => void;
    handleDelete: (itemId: number) => Promise<void>;
    isDeletingItem: boolean;

    // Bulk import
    importOpen: boolean;
    setImportOpen: (open: boolean) => void;
    openImportDialog: () => void;
    importText: string;
    setImportText: (value: string) => void;
    importPrefix: string;
    setImportPrefix: (value: string) => void;
    importLocale: string;
    setImportLocale: (value: string) => void;
    handleImport: () => Promise<void>;
    isImporting: boolean;

    // Tag manager
    tagManagerOpen: boolean;
    setTagManagerOpen: (open: boolean) => void;
    newTagName: string;
    setNewTagName: (value: string) => void;
    newTagColor: string;
    setNewTagColor: (value: string) => void;
    deleteTagId: number | null;
    setDeleteTagId: (id: number | null) => void;
    handleCreateTag: () => Promise<void>;
    handleDeleteTag: (tagId: number) => Promise<void>;
    isCreatingTag: boolean;
    isDeletingTag: boolean;

    // Item-detail sheet
    sheetItemId: number | null;
    sheetItemCode: string;
    sheetTab: 'history' | 'comments';
    openSheet: (item: ConcourseItemRead, tab: 'history' | 'comments') => void;
    closeSheet: () => void;

    // Export
    exportCsv: () => void;
}

// ────────────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────────────

export function useConcourseDetailPage(): ConcourseDetailPageApi {
    const { t, i18n } = useTranslation();
    const { can } = usePermission();
    const { project } = useAdminContext();
    const { concourseId } = useParams<{ concourseId: string }>();
    const queryClient = useQueryClient();
    const id = Number(concourseId);

    const canEdit = can('study:edit_design');

    const memberNames = useMemo(() => {
        const map: Record<number, string> = {};
        for (const m of project?.members ?? []) {
            map[m.user_id] = m.user.full_name ?? m.user.email;
        }
        return map;
    }, [project?.members]);

    // ── Queries ──────────────────────────────────────────────────
    const { data: concourse, isLoading } = useGetConcourseApiAdminConcoursesConcourseIdGet(id, {
        query: {
            enabled: !!id,
            refetchInterval: 15_000,
        },
    });
    const { data: tags } = useListTagsApiAdminConcoursesTagsGet();

    // ── Mutations ────────────────────────────────────────────────
    const createItemMutation = useCreateItemApiAdminConcoursesConcourseIdItemsPost();
    const updateItemMutation = useUpdateItemApiAdminConcoursesConcourseIdItemsItemIdPatch();
    const deleteItemMutation = useDeleteItemApiAdminConcoursesConcourseIdItemsItemIdDelete();
    const importMutation = useImportItemsFromTextApiAdminConcoursesConcourseIdItemsImportPost();
    const createTagMutation = useCreateTagApiAdminConcoursesTagsPost();
    const deleteTagMutation = useDeleteTagApiAdminConcoursesTagsTagIdDelete();

    const invalidate = useCallback(
        () =>
            queryClient.invalidateQueries({
                queryKey: getGetConcourseApiAdminConcoursesConcourseIdGetQueryKey(id),
            }),
        [queryClient, id]
    );

    const invalidateTags = useCallback(
        () =>
            queryClient.invalidateQueries({
                queryKey: getListTagsApiAdminConcoursesTagsGetQueryKey(),
            }),
        [queryClient]
    );

    // ── i18n helpers ─────────────────────────────────────────────
    const statusLabel = useCallback(
        (status: string) =>
            ({
                proposed: t('admin.concourse.status.proposed', 'Proposed'),
                accepted: t('admin.concourse.status.accepted', 'Accepted'),
                rejected: t('admin.concourse.status.rejected', 'Rejected'),
            })[status] ?? status,
        [t]
    );

    const langDisplayName = useCallback(
        (code: string) => {
            try {
                const dn = new Intl.DisplayNames([i18n.language], { type: 'language' });
                const name = dn.of(code);
                return name ? name.charAt(0).toUpperCase() + name.slice(1) : code.toUpperCase();
            } catch {
                return code.toUpperCase();
            }
        },
        [i18n.language]
    );

    // ── Filter / search / locale state ──────────────────────────
    const [activeLocale, setActiveLocale] = useState('');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [filterTag, setFilterTag] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');

    // ── Add-language dialog ─────────────────────────────────────
    const [addLangOpen, setAddLangOpen] = useState(false);
    const [newLangCode, setNewLangCode] = useState('');

    // ── Add-item dialog ─────────────────────────────────────────
    const [addItemOpen, setAddItemOpen] = useState(false);
    const [newCode, setNewCode] = useState('');
    const [newText, setNewText] = useState('');
    const [newSource, setNewSource] = useState('');
    const [newTagIds, setNewTagIds] = useState<number[]>([]);
    const [newItemLocale, setNewItemLocale] = useState('');

    // ── Edit-item state ─────────────────────────────────────────
    const [editingItem, setEditingItem] = useState<number | null>(null);
    const [editCode, setEditCode] = useState('');
    const [editText, setEditText] = useState('');
    const [editSource, setEditSource] = useState('');
    const [editChangeNote, setEditChangeNote] = useState('');
    const [editTagIds, setEditTagIds] = useState<number[]>([]);

    // ── Bulk-import dialog ──────────────────────────────────────
    const [importOpen, setImportOpen] = useState(false);
    const [importText, setImportText] = useState('');
    const [importPrefix, setImportPrefix] = useState('C');
    const [importLocale, setImportLocale] = useState('');

    // ── Item-detail sheet ───────────────────────────────────────
    const [sheetItemId, setSheetItemId] = useState<number | null>(null);
    const [sheetItemCode, setSheetItemCode] = useState('');
    const [sheetTab, setSheetTab] = useState<'history' | 'comments'>('history');

    // ── Tag manager ─────────────────────────────────────────────
    const [tagManagerOpen, setTagManagerOpen] = useState(false);
    const [newTagName, setNewTagName] = useState('');
    const [newTagColor, setNewTagColor] = useState('#6366f1');
    const [deleteTagId, setDeleteTagId] = useState<number | null>(null);

    // ── Multi-select + bulk actions ─────────────────────────────
    const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
    const [bulkActionPending, setBulkActionPending] = useState(false);
    const [bulkConfirm, setBulkConfirm] = useState<ConcourseItemStatus | null>(null);

    // ── Delete-item confirm state ───────────────────────────────
    const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

    // ── Derived: filtered items ─────────────────────────────────
    const filteredItems = useMemo(() => {
        if (!concourse?.items) return [];

        const matchesStatus = (item: ConcourseItemRead) =>
            filterStatus === 'all' || item.status === filterStatus;

        const matchesTag = (item: ConcourseItemRead) =>
            filterTag === 'all' ||
            (item.tags?.some((tag) => String(tag.id) === filterTag) ?? false);

        const matchesSearch = (item: ConcourseItemRead) => {
            if (!searchQuery) return true;
            const text =
                item.translations?.find((tr) => tr.language_code === activeLocale)?.text ??
                item.translations?.[0]?.text ??
                '';
            const q = searchQuery.toLowerCase();
            return (
                item.code.toLowerCase().includes(q) ||
                text.toLowerCase().includes(q) ||
                (item.source ?? '').toLowerCase().includes(q)
            );
        };

        return concourse.items
            .filter((item) => matchesStatus(item) && matchesTag(item) && matchesSearch(item))
            .sort((a, b) => a.display_order - b.display_order);
    }, [concourse?.items, filterStatus, filterTag, searchQuery, activeLocale]);

    // ── Derived: language metadata ──────────────────────────────
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

    const missingCountByLang = useMemo(() => {
        if (languages.length <= 1) return {};
        const counts: Record<string, number> = {};
        const items = concourse?.items ?? [];
        for (const lang of languages) {
            let missing = 0;
            for (const item of items) {
                if (!item.translations?.some((tr) => tr.language_code === lang)) {
                    missing++;
                }
            }
            if (missing > 0) counts[lang] = missing;
        }
        return counts;
    }, [languages, concourse?.items]);

    // Concourse statement languages are restricted to the same set as
    // SUPPORTED_LANGUAGES (the participant-domain locales). A statement
    // language outside that set would not be selectable when creating a
    // study, so allowing wider codes here is a dead-end. Existing items in
    // other codes remain visible (`languages` is derived from data) — the
    // picker simply does not offer to add more.
    const commonLanguages = useMemo(
        () =>
            SUPPORTED_LANGUAGES.filter((l) => !languages.includes(l.code))
                .map((l) => ({ code: l.code, name: langDisplayName(l.code) }))
                .sort((a, b) => a.name.localeCompare(b.name)),
        [languages, langDisplayName]
    );

    // ── Effect: pick first locale once languages arrive ────────
    useEffect(() => {
        const firstLang = languages[0];
        if (firstLang && !languages.includes(activeLocale)) {
            setActiveLocale(firstLang);
        }
    }, [languages, activeLocale]);

    // ── Multi-select helpers ────────────────────────────────────
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
            const allSelected = filteredIds.length > 0 && filteredIds.every((fid) => prev.has(fid));
            if (allSelected) return new Set();
            return new Set(filteredIds);
        });
    }, [filteredItems]);

    // ── Tag mutations ───────────────────────────────────────────
    const handleCreateTag = useCallback(async () => {
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
    }, [newTagName, newTagColor, createTagMutation, invalidateTags, t]);

    const handleDeleteTag = useCallback(
        async (tagId: number) => {
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
        },
        [deleteTagMutation, invalidateTags, invalidate, t]
    );

    // ── Bulk status mutation ────────────────────────────────────
    const handleBulkStatusChange = useCallback(
        async (status: ConcourseItemStatus) => {
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
        },
        [selectedItems, concourse?.items, updateItemMutation, id, invalidate, t]
    );

    // ── Add-item ────────────────────────────────────────────────
    const openAddItemDialog = useCallback(() => {
        const items = concourse?.items ?? [];
        setNewCode(computeNextCode(items));
        setAddItemOpen(true);
    }, [concourse?.items]);

    const handleAddItem = useCallback(async () => {
        const itemLocale = activeLocale || newItemLocale;
        if (!newCode.trim() || !newText.trim() || !itemLocale) return;
        try {
            await createItemMutation.mutateAsync({
                concourseId: id,
                data: {
                    code: newCode.trim(),
                    source: newSource.trim() || null,
                    translations: [{ language_code: itemLocale, text: newText.trim() }],
                    tag_ids: newTagIds,
                },
            });
            await invalidate();
            setAddItemOpen(false);
            setNewCode('');
            setNewText('');
            setNewSource('');
            setNewTagIds([]);
            setNewItemLocale('');
            toast.success(t('admin.concourse.item_created', 'Item added'));
        } catch (err) {
            toast.error(
                parseApiErrorSync(err, t('admin.concourse.item_create_error', 'Failed to add item'))
            );
        }
    }, [
        activeLocale,
        newItemLocale,
        newCode,
        newText,
        newSource,
        newTagIds,
        createItemMutation,
        id,
        invalidate,
        t,
    ]);

    // ── Edit-item ───────────────────────────────────────────────
    const startEdit = useCallback(
        (item: ConcourseItemRead) => {
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
        },
        [activeLocale]
    );

    const saveEdit = useCallback(
        async (item: ConcourseItemRead) => {
            try {
                const mergedTranslations = [
                    ...(item.translations ?? [])
                        .filter((tr) => tr.language_code !== activeLocale)
                        .map((tr) => ({ language_code: tr.language_code, text: tr.text })),
                    { language_code: activeLocale, text: editText.trim() },
                ];
                await updateItemMutation.mutateAsync({
                    concourseId: id,
                    itemId: item.id,
                    data: {
                        version: item.version,
                        code: editCode.trim() || undefined,
                        source: editSource.trim() || undefined,
                        translations: mergedTranslations,
                        tag_ids: editTagIds,
                        change_comment: editChangeNote.trim() || undefined,
                    },
                });
                await invalidate();
                setEditingItem(null);
                setEditChangeNote('');
                toast.success(t('admin.concourse.item_updated', 'Item updated'));
            } catch (err) {
                const msg = parseApiErrorSync(
                    err,
                    t('admin.concourse.item_update_error', 'Failed to update item')
                );
                toast.error(msg);
                if (msg.includes('modified')) {
                    await invalidate();
                    setEditingItem(null);
                }
            }
        },
        [
            activeLocale,
            editText,
            editCode,
            editSource,
            editChangeNote,
            editTagIds,
            updateItemMutation,
            id,
            invalidate,
            t,
        ]
    );

    // ── Inline status change ────────────────────────────────────
    const changeStatus = useCallback(
        async (item: ConcourseItemRead, status: ConcourseItemStatus) => {
            try {
                await updateItemMutation.mutateAsync({
                    concourseId: id,
                    itemId: item.id,
                    data: { version: item.version, status },
                });
                await invalidate();
            } catch (err) {
                toast.error(
                    parseApiErrorSync(
                        err,
                        t('admin.concourse.status_error', 'Failed to change status')
                    )
                );
            }
        },
        [updateItemMutation, id, invalidate, t]
    );

    // ── Delete-item ─────────────────────────────────────────────
    const handleDelete = useCallback(
        async (itemId: number) => {
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
        },
        [deleteItemMutation, id, invalidate, t]
    );

    // ── Bulk import ─────────────────────────────────────────────
    const openImportDialog = useCallback(() => {
        setImportLocale(activeLocale || languages[0] || 'en');
        setImportOpen(true);
    }, [activeLocale, languages]);

    const handleImport = useCallback(async () => {
        if (!importText.trim()) return;
        try {
            const result = await importMutation.mutateAsync({
                concourseId: id,
                data: {
                    text_block: importText,
                    language_code: importLocale || activeLocale || 'en',
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
    }, [importText, importMutation, id, importLocale, activeLocale, importPrefix, invalidate, t]);

    // ── Add-language confirm ────────────────────────────────────
    const confirmAddLanguage = useCallback(() => {
        if (!newLangCode) return;
        setActiveLocale(newLangCode);
        setAddLangOpen(false);
        setNewLangCode('');
    }, [newLangCode]);

    // ── Item-detail sheet ───────────────────────────────────────
    const openSheet = useCallback((item: ConcourseItemRead, tab: 'history' | 'comments') => {
        setSheetItemId(item.id);
        setSheetItemCode(item.code);
        setSheetTab(tab);
    }, []);

    const closeSheet = useCallback(() => {
        setSheetItemId(null);
    }, []);

    // ── CSV export ──────────────────────────────────────────────
    const exportCsv = useCallback(() => {
        if (!concourse?.items?.length) return;
        const items = filteredItems.length > 0 ? filteredItems : (concourse.items ?? []);
        const allLangs = [
            ...new Set(items.flatMap((i) => i.translations?.map((tr) => tr.language_code) ?? [])),
        ].sort();

        const headers = ['code', 'status', 'source', ...allLangs.map((l) => `text_${l}`), 'tags'];
        const rows = items.map((item) => {
            const texts = allLangs.map((lang) => {
                const tr = item.translations?.find((trr) => trr.language_code === lang);
                return tr?.text ?? '';
            });
            const tagNames = item.tags?.map((tag) => tag.name).join('; ') ?? '';
            return [item.code, statusLabel(item.status), item.source ?? '', ...texts, tagNames];
        });

        const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
        const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${project?.title?.replace(/[^a-zA-Z0-9-_ ]/g, '').trim() ?? 'project'}_concourse.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }, [concourse, filteredItems, statusLabel, project?.title]);

    return {
        // Route + permissions
        id,
        canEdit,
        memberNames,

        // Queries
        concourse,
        isLoading,
        tags,

        // i18n helpers
        statusLabel,
        langDisplayName,

        // Filters / search
        filterStatus,
        setFilterStatus,
        filterTag,
        setFilterTag,
        searchQuery,
        setSearchQuery,

        // Locale
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

        // Derived data
        filteredItems,

        // Multi-select
        selectedItems,
        setSelectedItems,
        toggleSelectItem,
        toggleSelectAll,
        bulkActionPending,
        bulkConfirm,
        setBulkConfirm,
        handleBulkStatusChange,

        // Add-item
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
        isCreatingItem: createItemMutation.isPending,

        // Edit-item
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
        isUpdatingItem: updateItemMutation.isPending,

        // Inline status change
        changeStatus,

        // Delete-item
        deleteConfirmId,
        setDeleteConfirmId,
        handleDelete,
        isDeletingItem: deleteItemMutation.isPending,

        // Bulk import
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
        isImporting: importMutation.isPending,

        // Tag manager
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
        isCreatingTag: createTagMutation.isPending,
        isDeletingTag: deleteTagMutation.isPending,

        // Item-detail sheet
        sheetItemId,
        sheetItemCode,
        sheetTab,
        openSheet,
        closeSheet,

        // Export
        exportCsv,
    };
}
