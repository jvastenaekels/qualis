/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Qualis Team
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

/**
 * useQSortEditor hook
 *
 * Owns the durable state-and-effect logic for the Q-sort statement/grid
 * editor: useStudyDesigner store slice, stale-statements query +
 * concourse-sync mutation, bulk-import + detected-format state, inline-edit
 * state, grid-capacity handlers, dnd sensors + drag-end. QSortEditor renders
 * JSX from this hook's return value (Phase-5-G; precedents
 * useInteractiveDataView W1, useAudioRecorder W3).
 *
 * `sensors` (useSensors) is returned and bound by the component as
 * <DndContext sensors={sensors}> — same pattern as W3's hook-returned
 * containerRef.
 *
 * The moved body keeps its verbatim `if (!draft) return null;` guard, so the
 * hook returns `UseQSortEditorResult | null`; the component re-applies the
 * null-guard before rendering JSX (behaviour-identical to the original
 * component-level early return).
 */

import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useStudyDesigner } from '@/store/useStudyDesigner';
import { parseCsvTsv } from '@/utils/parseCsvTsv';
import {
    getGetStudyApiAdminStudiesSlugGetQueryKey,
    useCheckStaleStatementsApiAdminStudiesSlugStaleStatementsGet,
    useSyncStatementFromConcourseApiAdminStudiesSlugSyncStatementStatementIdPost,
} from '@/api/generated';
import type {
    GridColumn,
    StatementRead,
    StatementTranslationRead,
    StudyRead,
    StudyUpdate,
} from '@/api/model';
import {
    applyCapacityDelta,
    computeAutoShapedCapacities,
    mergeParsedItemIntoStatements,
} from '@/components/admin/designer/QSortEditor.helpers';

// Define basic types for clarity (moved verbatim from QSortEditor.tsx ~66-72,
// the moved body references these — exported so the component can import back).
type Statement = StatementRead;
type Translation = StatementTranslationRead;

export interface StaleInfo {
    concourse_translations: { language_code: string; text: string }[];
    source_deleted: boolean;
}

export interface QSortEditorProps {
    readOnly?: boolean;
    structureLocked?: boolean;
}

type TFunc = ReturnType<typeof useTranslation>['t'];
type SyncMutation = ReturnType<
    typeof useSyncStatementFromConcourseApiAdminStudiesSlugSyncStatementStatementIdPost
>;
type DndSensors = ReturnType<typeof useSensors>;
type LocalizedStatement = { code: string; text: string };
type DetectedFormat = {
    type: 'excel' | 'list' | 'simple' | null;
    langs: string[];
    hasCode: boolean;
};

export interface UseQSortEditorResult {
    data: {
        t: TFunc;
        readOnly?: boolean;
        structureLocked?: boolean;
        draft: StudyUpdate;
        original: StudyRead | null;
        activeLocale: string;
        activeSubTab: 'statements' | 'grid';
        statements: Statement[];
        localizedStatements: LocalizedStatement[];
        staleByStatementId: Map<number, StaleInfo>;
        grid: GridColumn[];
        totalSlots: number;
        totalStatements: number;
        isValid: boolean;
        isSymmetric: boolean;
        isBellShaped: boolean;
    };
    bulk: {
        bulkText: string;
        setBulkText: (v: string) => void;
        importMode: 'replace' | 'append' | 'sync';
        setImportMode: (v: 'replace' | 'append' | 'sync') => void;
        detectedFormat: DetectedFormat;
        handleBulkSave: () => void;
    };
    editing: {
        editingIndex: number | null;
        editingText: string;
        editingCode: string;
        setEditingIndex: (idx: number | null) => void;
        setEditingText: (text: string) => void;
        setEditingCode: (code: string) => void;
        handleSaveStatement: () => void;
    };
    dialogs: {
        importDialogOpen: boolean;
        setImportDialogOpen: (v: boolean) => void;
    };
    actions: {
        setActiveSubTab: (v: 'statements' | 'grid') => void;
        updateDraft: (fn: (d: StudyUpdate) => void) => void;
        handleClearAll: () => void;
        handleSyncStatement: (statementId: number) => void;
        syncMutation: SyncMutation;
        updateGridCapacity: (idx: number, delta: number) => void;
        addExtremeColumns: () => void;
        removeExtremeColumns: () => void;
        autoShapeGrid: () => void;
        handleImported: () => void;
    };
    dnd: {
        sensors: DndSensors;
        handleStatementDragEnd: (event: DragEndEvent) => void;
    };
}

export function useQSortEditor(props: QSortEditorProps): UseQSortEditorResult | null {
    const { readOnly, structureLocked } = props;
    const { t } = useTranslation();
    const { draft, original, activeLocale, updateDraft, activeSubStep, setActiveSubStep } =
        useStudyDesigner();
    const [importDialogOpen, setImportDialogOpen] = useState(false);
    const queryClient = useQueryClient();

    // Concourse traceability: check for stale statements
    const hasLinkedStatements = original?.statements?.some(
        (s) => s.source_concourse_item_id != null
    );
    const { data: staleData } = useCheckStaleStatementsApiAdminStudiesSlugStaleStatementsGet(
        original?.slug ?? '',
        {
            query: {
                enabled: !!original?.slug && !!hasLinkedStatements,
                refetchInterval: 30_000,
            },
        }
    );
    const staleByStatementId = useMemo(
        () =>
            new Map<number, StaleInfo>(
                staleData?.map((s) => [
                    s.statement_id,
                    {
                        concourse_translations: s.concourse_translations,
                        source_deleted: s.source_deleted,
                    },
                ]) ?? []
            ),
        [staleData]
    );

    const syncMutation =
        useSyncStatementFromConcourseApiAdminStudiesSlugSyncStatementStatementIdPost();

    const handleSyncStatement = (statementId: number) => {
        if (!original?.slug) return;
        syncMutation.mutate(
            { slug: original.slug, statementId },
            {
                onSuccess: () => {
                    queryClient.invalidateQueries({
                        queryKey: getGetStudyApiAdminStudiesSlugGetQueryKey(original.slug),
                    });
                    toast.success(
                        t('admin.concourse_sync.synced', 'Statement updated from concourse')
                    );
                },
                onError: () => {
                    toast.error(
                        t(
                            'admin.concourse_sync.error',
                            'Could not sync from the concourse. Try again.'
                        )
                    );
                },
            }
        );
    };

    const [bulkText, setBulkText] = useState('');
    const [detectedFormat, setDetectedFormat] = useState<{
        type: 'excel' | 'list' | 'simple' | null;
        langs: string[];
        hasCode: boolean;
    }>({ type: null, langs: [], hasCode: false });

    // Alias to keep existing logic working
    const activeSubTab = (activeSubStep as 'statements' | 'grid') || 'statements';

    // Helper to update store
    const setActiveSubTab = (v: 'statements' | 'grid') => setActiveSubStep(v);

    // Auto-detect format on change
    useEffect(() => {
        if (!bulkText.trim()) {
            setDetectedFormat({ type: null, langs: [], hasCode: false });
            return;
        }

        const lines = bulkText.split('\n').filter((l) => l.trim() !== '');
        const firstLine = lines[0];
        if (!firstLine) {
            setDetectedFormat({ type: null, langs: [], hasCode: false });
            return;
        }

        if (firstLine.includes('\t')) {
            const cells = firstLine.split('\t').map((c) => c.trim().toLowerCase());
            const langs = cells.filter((c) =>
                draft?.translations?.some((tr) => tr.language_code === c)
            );
            setDetectedFormat({
                type: 'excel',
                langs,
                hasCode: cells.includes('code'),
            });
        } else if (lines.some((l) => /^([a-zA-Z0-9_-]{1,15})\s*[:,-]\s+/.test(l))) {
            setDetectedFormat({ type: 'list', langs: [], hasCode: true });
        } else {
            setDetectedFormat({ type: 'simple', langs: [], hasCode: false });
        }
    }, [bulkText, draft?.translations]);

    // Auto-initialize grid if empty (-4 to +4) with bell curve (total 34)
    useEffect(() => {
        if (draft && (!draft.grid_config || draft.grid_config.length === 0)) {
            updateDraft((d) => {
                d.grid_config = [
                    { score: -4, capacity: 2 },
                    { score: -3, capacity: 3 },
                    { score: -2, capacity: 4 },
                    { score: -1, capacity: 5 },
                    { score: 0, capacity: 6 },
                    { score: 1, capacity: 5 },
                    { score: 2, capacity: 4 },
                    { score: 3, capacity: 3 },
                    { score: 4, capacity: 2 },
                ];
            });
        }
    }, [draft, updateDraft]);

    const [importMode, setImportMode] = useState<'replace' | 'append' | 'sync'>('replace');
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editingText, setEditingText] = useState('');
    const [editingCode, setEditingCode] = useState('');

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    if (!draft) return null;

    // --- Statements Logic ---
    const statements: Statement[] = (draft.statements || []) as Statement[];
    const localizedStatements = statements.map((s: Statement) => {
        const t = (s.translations as Translation[])?.find(
            (st: Translation) => st.language_code === activeLocale
        );
        return { code: s.code, text: t?.text || '' };
    });

    const handleStatementDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = localizedStatements.findIndex((s) => s.code === active.id);
            const newIndex = localizedStatements.findIndex((s) => s.code === over.id);
            updateDraft((d) => {
                if (d.statements) {
                    d.statements = arrayMove(d.statements, oldIndex, newIndex);
                }
            });
        }
    };

    const handleBulkSave = () => {
        if (!bulkText.trim()) return;

        type ParsedItem = {
            code?: string | null;
            text?: string;
            translations?: { language_code: string; text: string }[];
        };
        let parsedItems: ParsedItem[] = [];

        if (detectedFormat.type === 'excel') {
            const rows = parseCsvTsv(bulkText, '\t');
            const headerRow = rows[0];
            if (!headerRow) return;

            const headers = headerRow.map((h) => h.toLowerCase());
            const hasCodeHeader = headers.includes('code');
            const langHeaders = headers.filter((h) =>
                draft.translations?.some((t) => t.language_code === h)
            );

            if (hasCodeHeader || langHeaders.length > 0) {
                // EXCEL HEADER MODE
                parsedItems = rows.slice(1).map((cells) => {
                    const item: ParsedItem = { translations: [] };
                    if (hasCodeHeader) {
                        item.code = cells[headers.indexOf('code')]?.trim();
                    }
                    langHeaders.forEach((lang) => {
                        const cellIdx = headers.indexOf(lang);
                        if (cellIdx !== -1 && cells[cellIdx] !== undefined && item.translations) {
                            item.translations.push({ language_code: lang, text: cells[cellIdx] });
                        }
                    });
                    return item;
                });
            } else {
                // EXCEL SIMPLE MODE (No headers but has tabs)
                parsedItems = rows.map((cells) => {
                    return {
                        code: cells[0]?.trim(),
                        text: cells.slice(1).join(' ').trim(),
                    };
                });
            }
        } else {
            // CLASSIC MODE (One per line)
            const lines = bulkText
                .split('\n')
                .map((l) => l.trim())
                .filter((l) => l !== '');
            parsedItems = lines.map((line) => {
                // Check for CSV-like with quotes: "Code","Text"
                const csvMatch = line.match(/^"([^"]+)"\s*,\s*"(.+)"$/);
                if (csvMatch) {
                    return { code: csvMatch[1], text: csvMatch[2] };
                }

                // Regex for common separators: "Code: Text" or "Code, Text" or "Code - Text"
                const match = line.match(/^([a-zA-Z0-9_-]{1,15})\s*[:,-]\s+(.+)$/);
                if (match?.[1] && match[2]) {
                    return { code: match[1], text: match[2].trim() };
                }

                // Fallback: remove leading numbering "1. ", "1) "
                return { code: null, text: line.replace(/^\d+[.)\-\s]+/, '').trim() };
            });
        }

        updateDraft((d) => {
            if (importMode === 'replace') {
                d.statements = [];
            }
            const currentStatements = d.statements || [];
            const draftLangs = (d.translations || []) as { language_code: string }[];
            for (const item of parsedItems) {
                mergeParsedItemIntoStatements(
                    item,
                    currentStatements,
                    draftLangs,
                    importMode,
                    activeLocale
                );
            }
            d.statements = currentStatements;
        });

        setBulkText('');
        toast.success(t('admin.design.qsort.set.imported', { count: parsedItems.length }));
    };

    const handleClearAll = () => {
        if (confirm(t('admin.design.qsort.set.confirm_clear'))) {
            updateDraft((d) => {
                d.statements = [];
            });
            toast.info(t('admin.design.qsort.set.cleared'));
        }
    };

    const grid = (draft.grid_config || []) as GridColumn[];
    const totalSlots = grid.reduce((acc: number, col: GridColumn) => acc + (col.capacity || 0), 0);
    const totalStatements = statements.length;
    const isValid = totalSlots === totalStatements;

    const isSymmetric =
        grid.length > 0 &&
        grid.every((col, idx) => {
            const opposite = grid[grid.length - 1 - idx];
            return col.capacity === opposite?.capacity;
        });

    const isBellShaped =
        isSymmetric &&
        grid.length >= 5 &&
        (() => {
            const centerIdx = Math.floor(grid.length / 2);
            for (let i = 0; i < centerIdx; i++) {
                if ((grid[i]?.capacity || 0) > (grid[i + 1]?.capacity || 0)) return false;
            }
            return true;
        })();

    const updateGridCapacity = (idx: number, delta: number) => {
        updateDraft((d) => {
            if (!d.grid_config) return;
            applyCapacityDelta(d.grid_config, idx, delta, d.symmetry_lock ?? true);
        });
    };

    const addExtremeColumns = () => {
        updateDraft((d) => {
            if (!d.grid_config || d.grid_config.length === 0) {
                // Default -4 to +4 if empty
                d.grid_config = [
                    { score: -4, capacity: 2 },
                    { score: -3, capacity: 3 },
                    { score: -2, capacity: 4 },
                    { score: -1, capacity: 5 },
                    { score: 0, capacity: 6 },
                    { score: 1, capacity: 5 },
                    { score: 2, capacity: 4 },
                    { score: 3, capacity: 3 },
                    { score: 4, capacity: 2 },
                ];
                return;
            }
            const scores = d.grid_config.map((c: GridColumn) => c.score);
            const minScore = Math.min(...scores);
            const maxScore = Math.max(...scores);

            if (minScore <= -6 || maxScore >= 6) {
                toast.error(t('admin.design.qsort.grid.max_reached', 'Maximum range reached (±6)'));
                return;
            }

            d.grid_config.unshift({ score: minScore - 1, capacity: 1 });
            d.grid_config.push({ score: maxScore + 1, capacity: 1 });
        });
    };

    const removeExtremeColumns = () => {
        updateDraft((d) => {
            if (!d.grid_config || d.grid_config.length <= 5) {
                toast.error(t('admin.design.qsort.grid.min_reached', 'Minimum range reached (±2)'));
                return;
            }
            d.grid_config.shift();
            d.grid_config.pop();
        });
    };

    const autoShapeGrid = () => {
        if (totalStatements === 0) {
            toast.error(
                t(
                    'admin.design.qsort.grid.no_statements',
                    'Add statements first to auto-shape the grid'
                )
            );
            return;
        }

        updateDraft((d) => {
            if (!d.grid_config || d.grid_config.length === 0) return;

            const newCapacities = computeAutoShapedCapacities(
                totalStatements,
                d.grid_config.length
            );

            for (let i = 0; i < newCapacities.length; i++) {
                const col = d.grid_config[i];
                const cap = newCapacities[i];
                if (col && cap !== undefined) {
                    col.capacity = cap;
                }
            }
        });
        toast.success(
            t('admin.design.qsort.grid.balanced', 'Grid balanced to standard distribution')
        );
    };

    const handleSaveStatement = () => {
        updateDraft((d) => {
            const statement = d.statements?.[editingIndex as number];
            if (statement) {
                // Update code
                statement.code = editingCode;

                const translation = statement.translations?.find(
                    (t) => t.language_code === activeLocale
                );
                if (translation) {
                    translation.text = editingText;
                }
            }
        });
        setEditingIndex(null);
        toast.success(t('admin.design.qsort.set.updated'));
    };

    const handleImported = () => {
        // Invalidate study query so the design page re-fetches with new statements
        if (original?.slug) {
            queryClient.invalidateQueries({
                queryKey: getGetStudyApiAdminStudiesSlugGetQueryKey(original.slug),
            });
        }
    };

    return {
        data: {
            t,
            readOnly,
            structureLocked,
            draft,
            original,
            activeLocale,
            activeSubTab,
            statements,
            localizedStatements,
            staleByStatementId,
            grid,
            totalSlots,
            totalStatements,
            isValid,
            isSymmetric,
            isBellShaped,
        },
        bulk: {
            bulkText,
            setBulkText,
            importMode,
            setImportMode,
            detectedFormat,
            handleBulkSave,
        },
        editing: {
            editingIndex,
            editingText,
            editingCode,
            setEditingIndex,
            setEditingText,
            setEditingCode,
            handleSaveStatement,
        },
        dialogs: {
            importDialogOpen,
            setImportDialogOpen,
        },
        actions: {
            setActiveSubTab,
            updateDraft,
            handleClearAll,
            handleSyncStatement,
            syncMutation,
            updateGridCapacity,
            addExtremeColumns,
            removeExtremeColumns,
            autoShapeGrid,
            handleImported,
        },
        dnd: {
            sensors,
            handleStatementDragEnd,
        },
    };
}
