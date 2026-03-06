import { useState, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useStudyDesigner } from '@/store/useStudyDesigner';
import type { StudyTranslationCreate } from '@/api/model';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
    Plus,
    Minus,
    CheckCircle2,
    AlertCircle,
    Quote,
    Grid3X3,
    Trash2,
    HelpCircle,
    RotateCcw,
    Wand2,
    GripVertical,
    Library,
    RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { useTranslation } from 'react-i18next';
import { MultiLangFieldIcon } from './MultiLangFieldIcon';
import { ImportFromConcourseDialog } from './ImportFromConcourseDialog';
import {
    getGetStudyApiAdminStudiesSlugGetQueryKey,
    useCheckStaleStatementsApiAdminStudiesSlugStaleStatementsGet,
    useSyncStatementFromConcourseApiAdminStudiesSlugSyncStatementStatementIdPost,
} from '@/api/generated';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import type { StatementRead, StatementTranslationRead, GridColumn } from '@/api/model';

// Define basic types for clarity
type Statement = StatementRead;
type Translation = StatementTranslationRead;

interface StaleInfo {
    concourse_translations: { language_code: string; text: string }[];
    source_deleted: boolean;
}

interface SortableStatementItemProps {
    item: { code: string; text: string };
    idx: number;
    statement: Statement;
    isEditing: boolean;
    editingCode: string;
    editingText: string;
    setEditingIndex: (idx: number | null) => void;
    setEditingCode: (code: string) => void;
    setEditingText: (text: string) => void;
    handleSaveStatement: () => void;
    readOnly?: boolean;
    structureLocked?: boolean;
    activeLocale: string;
    // biome-ignore lint/suspicious/noExplicitAny: complex draft type
    updateDraft: (fn: (d: any) => void) => void;
    staleInfo?: StaleInfo;
    onSync?: () => void;
    isSyncing?: boolean;
}

function SortableStatementItem({
    item,
    idx,
    statement,
    isEditing,
    editingCode,
    editingText,
    setEditingIndex,
    setEditingCode,
    setEditingText,
    handleSaveStatement,
    readOnly,
    structureLocked,
    activeLocale,
    updateDraft,
    staleInfo,
    onSync,
    isSyncing,
}: SortableStatementItemProps) {
    const { t } = useTranslation();
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: item.code,
        disabled: readOnly || structureLocked || isEditing,
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                'flex flex-wrap sm:flex-nowrap items-center gap-3 p-3 bg-white border-none shadow-sm rounded-2xl text-sm group transition-all hover:shadow-md hover:ring-1 hover:ring-indigo-100',
                isDragging && 'opacity-50 z-50 shadow-xl ring-2 ring-indigo-500/20'
            )}
        >
            {!readOnly && !structureLocked && !isEditing && (
                <div
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-indigo-600 transition-colors p-1 hover:bg-indigo-50 rounded-lg"
                >
                    <GripVertical className="h-4 w-4" />
                </div>
            )}

            {isEditing && !readOnly && !structureLocked ? (
                <Input
                    value={editingCode}
                    onChange={(e) => setEditingCode(e.target.value)}
                    className="w-16 h-8 text-2xs font-black font-mono text-center p-0 rounded-lg border-indigo-200 focus:ring-indigo-500/20"
                />
            ) : (
                <div className="flex items-center gap-1">
                    <span className="text-2xs font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg min-w-[36px] text-center font-mono border border-indigo-100">
                        {item.code}
                    </span>
                    <MultiLangFieldIcon
                        activeLocale={activeLocale}
                        translations={statement.translations || []}
                    />
                </div>
            )}

            {isEditing ? (
                <>
                    <Input
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        className="flex-1 font-medium rounded-xl h-10"
                        autoFocus
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                handleSaveStatement();
                            } else if (e.key === 'Escape') {
                                setEditingIndex(null);
                            }
                        }}
                    />
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleSaveStatement}
                            className="h-9 w-9 text-green-600 hover:bg-green-50 rounded-xl"
                        >
                            <CheckCircle2 className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditingIndex(null)}
                            className="h-9 w-9 text-slate-400 hover:bg-slate-50 rounded-xl"
                        >
                            <AlertCircle className="h-4 w-4" />
                        </Button>
                    </div>
                </>
            ) : (
                <>
                    <div
                        role="button"
                        tabIndex={0}
                        className={cn(
                            'flex-1 px-3 py-2 rounded-xl transition-all font-medium text-slate-700 leading-relaxed',
                            !readOnly ? 'cursor-text hover:bg-slate-50' : 'cursor-default'
                        )}
                        onClick={() => {
                            if (readOnly) return;
                            setEditingIndex(idx);
                            setEditingText(item.text);
                            setEditingCode(item.code);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                setEditingIndex(idx);
                                setEditingText(item.text);
                                setEditingCode(item.code);
                                e.preventDefault();
                            }
                        }}
                        title={t('admin.components.click_to_edit')}
                    >
                        {item.text}
                    </div>
                    {staleInfo && !readOnly && !structureLocked && (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={onSync}
                                        disabled={isSyncing || staleInfo.source_deleted}
                                        className="h-8 px-2 gap-1.5 text-amber-700 hover:text-amber-800 hover:bg-amber-50 rounded-xl font-bold text-xs animate-in fade-in"
                                    >
                                        <RefreshCw
                                            className={cn(
                                                'h-3.5 w-3.5',
                                                isSyncing && 'animate-spin'
                                            )}
                                        />
                                        {staleInfo.source_deleted
                                            ? t(
                                                  'admin.concourse_sync.source_deleted',
                                                  'Source deleted'
                                              )
                                            : t('admin.concourse_sync.update_available', 'Update')}
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-sm p-3 rounded-xl">
                                    {staleInfo.source_deleted ? (
                                        <p className="text-xs text-slate-600">
                                            {t(
                                                'admin.concourse_sync.source_deleted_tip',
                                                'The source concourse item has been deleted.'
                                            )}
                                        </p>
                                    ) : (
                                        <div className="space-y-1">
                                            <p className="text-xs font-bold text-slate-700">
                                                {t(
                                                    'admin.concourse_sync.new_version',
                                                    'New version in concourse:'
                                                )}
                                            </p>
                                            <p className="text-xs text-slate-600">
                                                {staleInfo.concourse_translations.find(
                                                    (tr) => tr.language_code === activeLocale
                                                )?.text ??
                                                    staleInfo.concourse_translations[0]?.text ??
                                                    ''}
                                            </p>
                                        </div>
                                    )}
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                    {!readOnly && !structureLocked && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                                // biome-ignore lint/suspicious/noExplicitAny: complex draft type
                                updateDraft((d: any) => {
                                    if (d.statements) {
                                        d.statements.splice(idx, 1);
                                    }
                                });
                            }}
                            aria-label={t('common.delete', 'Delete')}
                            className="h-9 w-9 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all"
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    )}
                </>
            )}
        </div>
    );
}

/**
 * Robust CSV/TSV parser that handles quoted fields and internal newlines.
 */
function parseCSVOrTSV(text: string, separator: string = '\t') {
    const result: string[][] = [];
    let row: string[] = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (inQuotes) {
            if (char === '"' && nextChar === '"') {
                currentField += '"';
                i++; // Skip next quote
            } else if (char === '"') {
                inQuotes = false;
            } else {
                currentField += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
            } else if (char === separator) {
                row.push(currentField.trim());
                currentField = '';
            } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
                if (char === '\r') i++;
                row.push(currentField.trim());
                result.push(row);
                row = [];
                currentField = '';
            } else if (char === '\r') {
                row.push(currentField.trim());
                result.push(row);
                row = [];
                currentField = '';
            } else {
                currentField += char;
            }
        }
    }
    if (row.length > 0 || currentField !== '') {
        row.push(currentField.trim());
        result.push(row);
    }
    return result.filter((r) => r.length > 0 && r.some((c) => c !== ''));
}

const QSortEditor = ({
    readOnly,
    structureLocked,
}: {
    readOnly?: boolean;
    structureLocked?: boolean;
}) => {
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
                    toast.error(t('admin.concourse_sync.error', 'Sync failed'));
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
            // biome-ignore lint/suspicious/noExplicitAny: complex draft type
            updateDraft((d: any) => {
                if (d.statements) {
                    d.statements = arrayMove(d.statements, oldIndex, newIndex);
                }
            });
        }
    };

    const handleBulkSave = () => {
        if (!bulkText.trim()) return;

        // biome-ignore lint/suspicious/noExplicitAny: dynamic parsed statement items
        let parsedItems: any[] = [];

        if (detectedFormat.type === 'excel') {
            const rows = parseCSVOrTSV(bulkText, '\t');
            if (rows.length === 0) return;

            const headers = rows[0].map((h) => h.toLowerCase());
            const hasCodeHeader = headers.includes('code');
            const langHeaders = headers.filter((h) =>
                draft.translations?.some((t) => t.language_code === h)
            );

            if (hasCodeHeader || langHeaders.length > 0) {
                // EXCEL HEADER MODE
                parsedItems = rows.slice(1).map((cells) => {
                    // biome-ignore lint/suspicious/noExplicitAny: dynamic parsed statement
                    const item: any = { translations: [] };
                    if (hasCodeHeader) {
                        item.code = cells[headers.indexOf('code')]?.trim();
                    }
                    langHeaders.forEach((lang) => {
                        const cellIdx = headers.indexOf(lang);
                        if (cellIdx !== -1 && cells[cellIdx] !== undefined) {
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
                if (match) {
                    return { code: match[1], text: match[2].trim() };
                }

                // Fallback: remove leading numbering "1. ", "1) "
                return { code: null, text: line.replace(/^\d+[.)\-\s]+/, '').trim() };
            });
        }

        // biome-ignore lint/suspicious/noExplicitAny: draft update with dynamic statement structure
        updateDraft((d: any) => {
            if (importMode === 'replace') {
                d.statements = [];
            }

            const currentStatements = d.statements || [];

            parsedItems.forEach((item) => {
                let existing = null;
                if (importMode === 'sync' && item.code) {
                    // biome-ignore lint/suspicious/noExplicitAny: statement search
                    existing = currentStatements.find((s: any) => s.code === item.code);
                }

                if (existing) {
                    // Sync Traductions
                    if (item.translations && item.translations.length > 0) {
                        item.translations.forEach(
                            (newT: { language_code: string; text: string }) => {
                                const tEntry = existing.translations.find(
                                    (t: Translation) => t.language_code === newT.language_code
                                );
                                if (tEntry) tEntry.text = newT.text;
                                else existing.translations.push(newT);
                            }
                        );
                    } else if (item.text) {
                        const tEntry = existing.translations.find(
                            (t: Translation) => t.language_code === activeLocale
                        );
                        if (tEntry) tEntry.text = item.text;
                        else
                            existing.translations.push({
                                language_code: activeLocale,
                                text: item.text,
                            });
                    }
                } else {
                    // Add New
                    const code = item.code || `s${currentStatements.length + 1}`;
                    const translations = (d.translations || []).map(
                        (t: { language_code: string }) => {
                            const headerT = item.translations?.find(
                                (ht: { language_code: string; text: string }) =>
                                    ht.language_code === t.language_code
                            );
                            return {
                                language_code: t.language_code,
                                text: headerT
                                    ? headerT.text
                                    : t.language_code === activeLocale
                                      ? item.text || ''
                                      : '',
                            };
                        }
                    );
                    currentStatements.push({ code, translations });
                }
            });
            d.statements = currentStatements;
        });

        setBulkText('');
        toast.success(t('admin.design.qsort.set.imported', { count: parsedItems.length }));
    };

    const handleClearAll = () => {
        if (confirm(t('admin.design.qsort.set.confirm_clear'))) {
            // biome-ignore lint/suspicious/noExplicitAny: complex types
            updateDraft((d: any) => {
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
            const oppositeIdx = grid.length - 1 - idx;
            return col.capacity === grid[oppositeIdx].capacity;
        });

    const isBellShaped =
        isSymmetric &&
        grid.length >= 5 &&
        (() => {
            const centerIdx = Math.floor(grid.length / 2);
            for (let i = 0; i < centerIdx; i++) {
                if ((grid[i].capacity || 0) > (grid[i + 1].capacity || 0)) return false;
            }
            return true;
        })();

    const updateGridCapacity = (idx: number, delta: number) => {
        updateDraft((d) => {
            if (!d.grid_config) return;
            const col = d.grid_config[idx];
            col.capacity = Math.max(0, (col.capacity || 0) + delta);

            // Symmetry Lock Logic
            if (d.symmetry_lock ?? true) {
                const oppositeIdx = d.grid_config.length - 1 - idx;
                if (oppositeIdx !== idx && d.grid_config[oppositeIdx]) {
                    d.grid_config[oppositeIdx].capacity = Math.max(
                        0,
                        (d.grid_config[oppositeIdx].capacity || 0) + delta
                    );
                }
            }
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

            const numColumns = d.grid_config.length;
            const N = totalStatements;
            const centerIdx = Math.floor(numColumns / 2);
            const isOddCols = numColumns % 2 !== 0;

            // 1. Generate Target Weights
            // Standard Q-sorts are "quasi-normal" but flatter than pure binomial.
            // We use a Power curve which produces a more professional forced-choice distribution.
            const weights = [];
            const maxDist = Math.max(centerIdx, numColumns - 1 - centerIdx);

            for (let i = 0; i < numColumns; i++) {
                const dist = Math.abs(i - centerIdx);
                // 1.4 is a sweet spot for reproducing common research tables
                weights.push((maxDist - dist + 1) ** 1.4);
            }

            const totalWeight = weights.reduce((a, b) => a + b, 0);
            const idealCapacities = weights.map((w) => (w / totalWeight) * N);

            // 2. Initial Distribution
            // Start with minimum: 2 per col if N is large, 1 if medium, 0 if small
            const minPerCol = N >= 40 ? 2 : N >= numColumns ? 1 : 0;
            const newCapacities: number[] = new Array(numColumns).fill(minPerCol);
            let currentTotal = newCapacities.reduce((a, b) => a + b, 0);

            // 3. Greedy distribution with symmetry
            while (currentTotal < N) {
                let bestIdx = -1;
                let maxDiff = -Infinity;

                const limit = isOddCols ? centerIdx : centerIdx - 1;

                for (let i = 0; i <= limit; i++) {
                    const diff = idealCapacities[i] - newCapacities[i];
                    if (diff > maxDiff) {
                        maxDiff = diff;
                        bestIdx = i;
                    }
                }

                if (bestIdx === -1) break;

                if (isOddCols && bestIdx === centerIdx) {
                    newCapacities[centerIdx]++;
                    currentTotal++;
                } else {
                    if (N - currentTotal >= 2) {
                        newCapacities[bestIdx]++;
                        newCapacities[numColumns - 1 - bestIdx]++;
                        currentTotal += 2;
                    } else if (isOddCols) {
                        newCapacities[centerIdx]++;
                        currentTotal++;
                    } else {
                        // Even columns parity break
                        newCapacities[bestIdx]++;
                        currentTotal++;
                    }
                }
            }

            // Apply to draft
            for (let i = 0; i < numColumns; i++) {
                if (d.grid_config?.[i]) {
                    d.grid_config[i].capacity = newCapacities[i];
                }
            }
        });
        toast.success(
            t('admin.design.qsort.grid.balanced', 'Grid balanced to standard distribution')
        );
    };

    const handleSaveStatement = () => {
        // biome-ignore lint/suspicious/noExplicitAny: complex state update
        updateDraft((d: any) => {
            if (d.statements?.[editingIndex as number]) {
                const statement = d.statements[editingIndex as number];

                // Update code
                statement.code = editingCode;

                const translation = statement.translations?.find(
                    // biome-ignore lint/suspicious/noExplicitAny: complex types
                    (t: any) => t.language_code === activeLocale
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

    return (
        <>
            <div className="space-y-6">
                <Tabs
                    value={activeSubTab}
                    onValueChange={(v) => setActiveSubTab(v as 'statements' | 'grid')}
                >
                    <TabsList className="grid grid-cols-2 w-full max-w-[400px]">
                        <TabsTrigger
                            value="statements"
                            className="gap-2"
                            data-testid="subtab-statements"
                        >
                            <Quote className="h-4 w-4" /> {t('admin.design.qsort.tabs.statements')}
                        </TabsTrigger>
                        <TabsTrigger value="grid" className="gap-2" data-testid="subtab-grid">
                            <Grid3X3 className="h-4 w-4" />{' '}
                            {t('admin.design.qsort.tabs.distribution')}
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="statements" className="space-y-8 pt-6">
                        {!readOnly && !structureLocked && (
                            <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                                <CardHeader className="pb-4">
                                    <div className="flex items-center gap-3 mb-1">
                                        <div className="bg-indigo-50 p-2 rounded-xl border border-indigo-100 shadow-sm">
                                            <Plus className="h-4 w-4 text-indigo-600" />
                                        </div>
                                        <CardTitle className="text-base font-black text-slate-900 tracking-tight">
                                            {t('admin.design.qsort.bulk.title')}
                                        </CardTitle>
                                    </div>
                                    <CardDescription className="text-sm font-medium text-slate-500">
                                        {t('admin.design.qsort.bulk.desc')}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <RadioGroup
                                        defaultValue="replace"
                                        value={importMode}
                                        onValueChange={(v) =>
                                            setImportMode(v as 'replace' | 'append' | 'sync')
                                        }
                                        className="flex flex-wrap gap-6"
                                    >
                                        <div className="flex items-center space-x-2.5">
                                            <RadioGroupItem
                                                value="replace"
                                                id="r1"
                                                className="text-indigo-600"
                                            />
                                            <Label
                                                htmlFor="r1"
                                                className="text-sm font-bold text-slate-700 cursor-pointer"
                                            >
                                                {t('admin.design.qsort.bulk.replace_all')}
                                            </Label>
                                        </div>
                                        <div className="flex items-center space-x-2.5">
                                            <RadioGroupItem
                                                value="append"
                                                id="r2"
                                                className="text-indigo-600"
                                            />
                                            <Label
                                                htmlFor="r2"
                                                className="text-sm font-bold text-slate-700 cursor-pointer"
                                            >
                                                {t('admin.design.qsort.bulk.append')}
                                            </Label>
                                        </div>
                                        <div className="flex items-center space-x-2.5">
                                            <RadioGroupItem
                                                value="sync"
                                                id="r3"
                                                className="text-indigo-600"
                                            />
                                            <Label
                                                htmlFor="r3"
                                                className="text-sm font-bold text-slate-700 cursor-pointer"
                                            >
                                                {t('admin.design.qsort.bulk.sync_by_code')}
                                            </Label>
                                        </div>
                                    </RadioGroup>
                                    <div className="space-y-3">
                                        <Textarea
                                            placeholder={t('admin.design.qsort.bulk.placeholder')}
                                            className="min-h-[200px] font-serif text-base leading-relaxed rounded-xl border-slate-200 focus:ring-indigo-500/20 transition-all bg-slate-50/30"
                                            value={bulkText}
                                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                                                setBulkText(e.target.value)
                                            }
                                        />
                                        {detectedFormat.type && (
                                            <div className="flex flex-wrap gap-2 px-1">
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-2xs font-black bg-indigo-50 text-indigo-700 border border-indigo-100 shadow-sm animate-in fade-in slide-in-from-top-1 duration-300">
                                                    <CheckCircle2 className="h-3 w-3" />
                                                    {t(
                                                        `admin.design.qsort.bulk.detected_format.${detectedFormat.type}`
                                                    )}
                                                </span>
                                                {detectedFormat.hasCode && (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-2xs font-black bg-emerald-50 text-emerald-700 border border-emerald-100 shadow-sm animate-in fade-in slide-in-from-top-1 duration-300">
                                                        <Wand2 className="h-3 w-3" />
                                                        {t(
                                                            'admin.design.qsort.bulk.detected_format.with_codes'
                                                        )}
                                                    </span>
                                                )}
                                                {detectedFormat.langs.length > 0 && (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-2xs font-black bg-blue-50 text-blue-700 border border-blue-100 shadow-sm animate-in fade-in slide-in-from-top-1 duration-300">
                                                        {t(
                                                            'admin.design.qsort.bulk.detected_format.multi_lang',
                                                            {
                                                                langs: detectedFormat.langs
                                                                    .join(', ')
                                                                    .toUpperCase(),
                                                            }
                                                        )}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
                                        <p className="text-xs font-black text-slate-400 px-1">
                                            {t('admin.design.qsort.bulk.detected', {
                                                count: bulkText
                                                    .split('\n')
                                                    .filter((l) => l.trim() !== '').length,
                                            })}
                                        </p>
                                        <Button
                                            size="sm"
                                            onClick={handleBulkSave}
                                            disabled={!bulkText.trim()}
                                            className="rounded-lg font-bold shadow-sm"
                                        >
                                            {importMode === 'replace'
                                                ? t('admin.design.qsort.bulk.process_replace')
                                                : importMode === 'append'
                                                  ? t('admin.design.qsort.bulk.process_append')
                                                  : t(
                                                        'admin.design.qsort.bulk.process_sync',
                                                        'Sync statements'
                                                    )}
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                            <h3 className="text-base font-bold text-slate-900 flex items-center gap-3 tracking-tight">
                                <div className="bg-slate-100 p-1.5 rounded-lg">
                                    <Quote className="h-4 w-4 text-slate-500" />
                                </div>
                                {t('admin.design.qsort.set.title')}
                                <span className="text-slate-400 font-medium ml-1">
                                    ({statements.length})
                                </span>
                            </h3>
                            <div className="flex items-center gap-2">
                                {!readOnly && !structureLocked && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            updateDraft((d) => {
                                                if (!d.statements) d.statements = [];
                                                const newIdx = d.statements.length + 1;
                                                d.statements.push({
                                                    code: `s${newIdx}`,
                                                    translations: (d.translations || []).map(
                                                        (t: StudyTranslationCreate) => ({
                                                            language_code: t.language_code,
                                                            text: '',
                                                        })
                                                    ),
                                                });
                                            });
                                            // Set editing state for the new statement
                                            // We use the current length as the index for the new element
                                            const newIdx = statements.length;
                                            setEditingIndex(newIdx);
                                            setEditingText('');
                                            setEditingCode(`s${newIdx + 1}`);
                                        }}
                                        className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 h-9 px-4 gap-2 rounded-xl font-bold transition-all"
                                    >
                                        <Plus className="h-4 w-4" />
                                        {t('common.add')}
                                    </Button>
                                )}
                                {!readOnly && !structureLocked && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setImportDialogOpen(true)}
                                        className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 h-9 px-4 gap-2 rounded-xl font-bold transition-all"
                                    >
                                        <Library className="h-4 w-4" />
                                        {t(
                                            'admin.concourse_import.button_label',
                                            'Import from Concourse'
                                        )}
                                    </Button>
                                )}

                                {statements.length > 0 && !readOnly && !structureLocked && (
                                    <>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                                if (
                                                    confirm(
                                                        t(
                                                            'admin.design.qsort.set.confirm_reset_codes',
                                                            'Are you sure you want to re-sequence all statement codes (s1, s2, s3...)?'
                                                        )
                                                    )
                                                ) {
                                                    updateDraft((d) => {
                                                        if (d.statements) {
                                                            d.statements.forEach(
                                                                // biome-ignore lint/suspicious/noExplicitAny: complex draft
                                                                (s: any, idx: number) => {
                                                                    s.code = `s${idx + 1}`;
                                                                }
                                                            );
                                                        }
                                                    });
                                                    toast.success(
                                                        t(
                                                            'admin.design.qsort.set.codes_reset',
                                                            'Statement codes re-sequenced'
                                                        )
                                                    );
                                                }
                                            }}
                                            className="text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 h-9 px-4 gap-2 rounded-xl font-bold transition-all"
                                        >
                                            <RotateCcw className="h-4 w-4" />
                                            {t('admin.design.qsort.set.reset_codes', 'Reset Codes')}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={handleClearAll}
                                            className="text-red-500 hover:text-red-600 hover:bg-red-50 h-9 px-4 gap-2 rounded-xl font-bold transition-all"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                            {t('admin.design.qsort.set.clear')}
                                        </Button>
                                    </>
                                )}
                            </div>
                        </div>

                        {staleByStatementId.size > 0 && !readOnly && (
                            <div
                                role="status"
                                aria-live="polite"
                                className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-2xl text-sm animate-in fade-in slide-in-from-top-1 duration-300"
                            >
                                <RefreshCw
                                    className="h-4 w-4 text-amber-600 flex-shrink-0"
                                    aria-hidden="true"
                                />
                                <span className="text-amber-800 font-semibold">
                                    {t(
                                        'admin.concourse_sync.stale_banner',
                                        '{{count}} statement(s) have updates available from the concourse.',
                                        { count: staleByStatementId.size }
                                    )}
                                </span>
                            </div>
                        )}

                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleStatementDragEnd}
                        >
                            <SortableContext
                                items={localizedStatements.map((s) => s.code)}
                                strategy={verticalListSortingStrategy}
                            >
                                <div className="grid grid-cols-1 gap-3">
                                    {localizedStatements.map((item, idx) => (
                                        <SortableStatementItem
                                            key={item.code}
                                            item={item}
                                            idx={idx}
                                            statement={statements[idx]}
                                            isEditing={editingIndex === idx}
                                            editingCode={editingCode}
                                            editingText={editingText}
                                            setEditingIndex={setEditingIndex}
                                            setEditingCode={setEditingCode}
                                            setEditingText={setEditingText}
                                            handleSaveStatement={handleSaveStatement}
                                            readOnly={readOnly}
                                            structureLocked={structureLocked}
                                            activeLocale={activeLocale}
                                            updateDraft={updateDraft}
                                            staleInfo={staleByStatementId.get(statements[idx]?.id)}
                                            onSync={() =>
                                                statements[idx]?.id &&
                                                handleSyncStatement(statements[idx].id)
                                            }
                                            isSyncing={
                                                syncMutation.isPending &&
                                                syncMutation.variables?.statementId ===
                                                    statements[idx]?.id
                                            }
                                        />
                                    ))}
                                </div>
                            </SortableContext>
                        </DndContext>

                        {/* Research Settings */}
                        <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden mt-10">
                            <CardHeader className="pb-4">
                                <CardTitle className="text-sm font-black text-slate-900 tracking-tight">
                                    {t('admin.design.qsort.settings.title')}
                                </CardTitle>
                                <CardDescription className="text-xs font-medium text-slate-500">
                                    {t('admin.design.qsort.settings.desc')}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center justify-between py-4 border-t border-slate-100">
                                    <div className="space-y-1">
                                        <Label
                                            htmlFor="show-codes"
                                            className="text-sm font-bold text-slate-700"
                                        >
                                            {t('admin.design.qsort.settings.show_codes')}
                                        </Label>
                                        <p className="text-xs font-medium text-slate-500 max-w-md leading-relaxed">
                                            {t('admin.design.qsort.settings.show_codes_desc')}
                                        </p>
                                    </div>
                                    <Switch
                                        id="show-codes"
                                        checked={draft.show_statement_codes ?? false}
                                        onCheckedChange={(checked: boolean) => {
                                            updateDraft((d) => {
                                                d.show_statement_codes = checked;
                                            });
                                        }}
                                        disabled={readOnly}
                                    />
                                </div>

                                <div className="flex items-center justify-between py-4 border-t border-slate-100">
                                    <div className="space-y-1">
                                        <Label
                                            htmlFor="randomize-stmts"
                                            className="text-sm font-bold text-slate-700"
                                        >
                                            {t('admin.design.qsort.settings.randomize')}
                                        </Label>
                                        <p className="text-xs font-medium text-slate-500 max-w-md leading-relaxed">
                                            {t('admin.design.qsort.settings.randomize_desc')}
                                        </p>
                                    </div>
                                    <Switch
                                        id="randomize-stmts"
                                        checked={draft.randomize_statement_order ?? false}
                                        onCheckedChange={(checked: boolean) => {
                                            updateDraft((d) => {
                                                d.randomize_statement_order = checked;
                                            });
                                        }}
                                        disabled={readOnly}
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="grid" className="space-y-8 pt-6">
                        {/* Comparison Header (Inspired by reference image) */}
                        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm overflow-hidden relative group">
                            <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
                                <div className="flex items-center gap-4">
                                    <div className="size-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shadow-sm">
                                        <Grid3X3 className="h-6 w-6 text-indigo-600" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                                            {t('admin.design.qsort.grid.title')}
                                        </h3>
                                        <p className="text-sm font-medium text-slate-500">
                                            {t('admin.design.qsort.grid.desc')}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-10 w-10 text-slate-400 hover:text-indigo-600 rounded-xl hover:bg-indigo-50 transition-all"
                                                >
                                                    <HelpCircle className="h-5 w-5" />
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent
                                                className="max-w-xs p-3 rounded-2xl shadow-2xl border-indigo-50 bg-white"
                                                side="left"
                                            >
                                                <p className="font-bold text-slate-900 mb-1">
                                                    {t('admin.design.qsort.grid.tooltip_title')}
                                                </p>
                                                <p className="text-xs text-slate-500 leading-relaxed">
                                                    {t('admin.design.qsort.grid.tooltip_desc')}
                                                </p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </div>
                            </div>

                            {/* Distribution Visualizer (Mini Chart) */}
                            <div className="mt-6 sm:mt-8 flex items-end justify-center gap-1 sm:gap-2 h-16 sm:h-20 px-2 sm:px-4">
                                {grid.map((col, idx) => {
                                    const maxCapacity = Math.max(
                                        ...grid.map((c) => c.capacity || 1)
                                    );
                                    const heightPercentage =
                                        ((col.capacity || 0) / maxCapacity) * 100;
                                    return (
                                        <div
                                            key={idx}
                                            className="group/bar relative flex-1 flex flex-col items-center justify-end h-full"
                                        >
                                            <div
                                                className={cn(
                                                    'w-full rounded-t-lg transition-all duration-700 ease-out shadow-sm',
                                                    isValid
                                                        ? 'bg-indigo-500 group-hover/bar:bg-indigo-600'
                                                        : 'bg-slate-300 group-hover/bar:bg-slate-400'
                                                )}
                                                style={{ height: `${heightPercentage}%` }}
                                            />
                                            <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover/bar:opacity-100 transition-all transform -translate-y-1 bg-slate-900 text-white text-2xs font-bold py-1 px-2 rounded-lg pointer-events-none whitespace-nowrap z-20 shadow-xl">
                                                {col.capacity} {t('common.slots')}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Status Pills */}
                            <div className="mt-6 sm:mt-8 flex flex-wrap items-center justify-center gap-2 sm:gap-4 py-3 border-t border-slate-100">
                                <div
                                    className={cn(
                                        'flex items-center gap-2 px-4 py-1.5 rounded-full border shadow-sm transition-all',
                                        isValid
                                            ? 'bg-green-50 border-green-100 text-green-700'
                                            : 'bg-amber-50 border-amber-100 text-amber-700'
                                    )}
                                >
                                    <div
                                        className={cn(
                                            'size-2 rounded-full',
                                            isValid ? 'bg-green-500' : 'bg-amber-500 animate-pulse'
                                        )}
                                    />
                                    <span className="text-xs font-black">
                                        {totalStatements} {t('admin.design.qsort.grid.statements')}{' '}
                                        vs {totalSlots} {t('common.slots')}
                                    </span>
                                </div>

                                {isBellShaped && (
                                    <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 shadow-sm animate-in zoom-in duration-300">
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                        <span className="text-xs font-black">
                                            {t('admin.design.qsort.grid.ideal_shape')}
                                        </span>
                                    </div>
                                )}

                                {isSymmetric && !isBellShaped && (
                                    <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-slate-500 shadow-sm">
                                        <span className="text-xs font-black">
                                            {t('admin.design.qsort.grid.symmetric')}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Visual Grid Representative */}
                        <div className="bg-slate-50/40 border border-slate-200 rounded-[32px] p-4 sm:p-6 md:p-10 flex flex-col items-center shadow-inner relative overflow-hidden group/grid transition-all">
                            {/* Interactive Grid Columns */}
                            <div className="flex items-end gap-1.5 sm:gap-2 md:gap-3 mb-8 md:mb-12 overflow-x-auto max-w-full pb-8 px-2 sm:px-4 md:px-8 min-h-[200px] sm:min-h-[300px]">
                                {grid.map((col, idx) => (
                                    <div
                                        key={idx}
                                        className="flex flex-col items-center gap-4 relative group/col"
                                    >
                                        {!readOnly && !structureLocked && (
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                className="h-8 w-8 hover:bg-slate-900 hover:text-white rounded-xl shadow-sm border-slate-200 bg-white transition-all transform active:scale-90"
                                                onClick={() => updateGridCapacity(idx, 1)}
                                                aria-label={`Increase capacity for column ${idx}`}
                                            >
                                                <Plus className="h-4 w-4" />
                                            </Button>
                                        )}

                                        <div
                                            className="flex flex-col-reverse gap-1.5 min-h-[40px] px-2 py-3 rounded-2xl transition-all group-hover/col:bg-indigo-50/50"
                                            data-testid={`grid-column-${idx}-slots`}
                                        >
                                            {Array.from({ length: col.capacity || 0 }).map(
                                                (_, i) => (
                                                    <div
                                                        key={i}
                                                        className={cn(
                                                            'w-8 sm:w-10 md:w-12 h-3 sm:h-4 rounded-md border shadow-sm transition-all duration-500',
                                                            isValid
                                                                ? 'bg-white border-indigo-200 group-hover/col:border-indigo-400 group-hover/col:shadow-indigo-100'
                                                                : 'bg-white border-slate-200'
                                                        )}
                                                    />
                                                )
                                            )}
                                        </div>

                                        <div
                                            className="mt-2 text-xs sm:text-[13px] font-black w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl border-2 bg-white flex items-center justify-center shadow-sm text-slate-700 tracking-tighter transition-all group-hover/col:border-indigo-600 group-hover/col:text-indigo-600"
                                            data-testid={`grid-column-${idx}-score`}
                                        >
                                            {col.score > 0 ? `+${col.score}` : col.score}
                                        </div>

                                        {!readOnly && !structureLocked && (
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                className="h-8 w-8 hover:bg-red-500 hover:text-white rounded-xl shadow-sm border-slate-200 bg-white transition-all transform active:scale-90"
                                                onClick={() => updateGridCapacity(idx, -1)}
                                                disabled={(col.capacity || 0) <= 0}
                                                aria-label={`Decrease capacity for column ${idx}`}
                                            >
                                                <Minus className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Main Grid Actions */}
                            <div className="flex flex-wrap items-center justify-center gap-4 mb-8">
                                {!readOnly && !structureLocked && (
                                    <div className="flex items-center gap-2 p-1 bg-white border border-slate-200 rounded-2xl shadow-sm">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={removeExtremeColumns}
                                            className="h-9 px-4 rounded-xl font-bold gap-2 text-slate-600 hover:text-red-600 hover:bg-red-50 transition-all"
                                            data-testid="reduce-grid-button"
                                        >
                                            <Minus className="h-4 w-4" /> {t('common.reduce')}
                                        </Button>
                                        <div className="w-px h-4 bg-slate-100" />
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={addExtremeColumns}
                                            className="h-9 px-4 rounded-xl font-bold gap-2 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                                            data-testid="expand-grid-button"
                                        >
                                            <Plus className="h-4 w-4" /> {t('common.expand')}
                                        </Button>
                                    </div>
                                )}

                                {!readOnly && !structureLocked && (
                                    <Button
                                        size="sm"
                                        onClick={autoShapeGrid}
                                        className="h-11 px-6 rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700 hover:shadow-indigo-300 transition-all font-bold gap-2"
                                    >
                                        <Wand2 className="h-4 w-4" />
                                        {t('admin.design.qsort.grid.auto_balance')}
                                    </Button>
                                )}

                                <div className="flex items-center gap-3 px-5 py-2.5 bg-white border border-slate-200 rounded-2xl shadow-sm">
                                    <Switch
                                        id="symmetry-lock"
                                        checked={draft.symmetry_lock ?? true}
                                        onCheckedChange={(checked) =>
                                            updateDraft((d) => {
                                                d.symmetry_lock = checked;
                                            })
                                        }
                                        disabled={readOnly}
                                    />
                                    <Label
                                        htmlFor="symmetry-lock"
                                        className="text-xs font-bold text-slate-600 cursor-pointer"
                                    >
                                        {t('admin.design.qsort.grid.symmetry_lock')}
                                    </Label>
                                </div>
                            </div>

                            {/* Validation Bottom Bar */}
                            <div
                                className={cn(
                                    'flex flex-col sm:flex-row items-center gap-4 sm:gap-8 px-4 sm:px-10 py-4 sm:py-5 rounded-2xl sm:rounded-[28px] border-2 shadow-2xl transition-all duration-500 transform',
                                    isValid
                                        ? 'bg-white border-green-500/20 ring-8 ring-green-500/5 rotate-0'
                                        : 'bg-white border-amber-500/20 ring-8 ring-amber-500/5'
                                )}
                            >
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                        <Quote className="h-5 w-5 text-slate-400" />
                                    </div>
                                    <div>
                                        <p className="text-2xs font-black text-slate-400">
                                            {t('admin.design.qsort.grid.statements')}
                                        </p>
                                        <p className="text-xl font-black text-slate-900">
                                            {totalStatements}
                                        </p>
                                    </div>
                                </div>

                                <div className="hidden sm:block w-px h-10 bg-slate-100" />

                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                        <Grid3X3 className="h-5 w-5 text-slate-400" />
                                    </div>
                                    <div>
                                        <p className="text-2xs font-black text-slate-400">
                                            {t('common.slots')}
                                        </p>
                                        <p className="text-xl font-black text-slate-900">
                                            {totalSlots}
                                        </p>
                                    </div>
                                </div>

                                <div className="hidden sm:block w-px h-10 bg-slate-100" />

                                <div className="flex items-center gap-4">
                                    {isValid ? (
                                        <div className="size-12 rounded-full bg-green-500 border-4 border-green-50 flex items-center justify-center shadow-lg shadow-green-200">
                                            <CheckCircle2 className="h-6 w-6 text-white" />
                                        </div>
                                    ) : (
                                        <div className="size-12 rounded-full bg-amber-500 border-4 border-amber-50 flex items-center justify-center shadow-lg shadow-amber-200">
                                            <AlertCircle className="h-6 w-6 text-white" />
                                        </div>
                                    )}
                                    <span
                                        className={cn(
                                            'text-base font-black tracking-tight',
                                            isValid ? 'text-green-600' : 'text-amber-600'
                                        )}
                                    >
                                        {isValid
                                            ? t('admin.design.qsort.grid.perfect')
                                            : totalStatements > totalSlots
                                              ? t('admin.design.qsort.grid.too_many', {
                                                    count: totalStatements - totalSlots,
                                                })
                                              : t('admin.design.qsort.grid.too_few', {
                                                    count: totalSlots - totalStatements,
                                                })}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
            {original?.slug && (
                <ImportFromConcourseDialog
                    open={importDialogOpen}
                    onOpenChange={setImportDialogOpen}
                    studySlug={original.slug}
                    activeLocale={activeLocale}
                    onImported={handleImported}
                />
            )}
        </>
    );
};

export default QSortEditor;
