import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { useTranslation } from 'react-i18next';

import type { StatementRead, StatementTranslationRead, GridColumn } from '@/api/model';

// Define basic types for clarity
type Statement = StatementRead;
type Translation = StatementTranslationRead;

const QSortEditor = () => {
    const { t } = useTranslation();
    const { draft, activeLocale, updateDraft, activeSubStep, setActiveSubStep } =
        useStudyDesigner();
    const [bulkText, setBulkText] = useState('');
    // Alias to keep existing logic working
    const activeSubTab = (activeSubStep as 'statements' | 'grid') || 'statements';

    // Helper to update store
    const setActiveSubTab = (v: 'statements' | 'grid') => setActiveSubStep(v);

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

    const [importMode, setImportMode] = useState<'replace' | 'append'>('replace');
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editingText, setEditingText] = useState('');
    const [editingCode, setEditingCode] = useState('');

    if (!draft) return null;

    // --- Statements Logic ---
    const statements: Statement[] = (draft.statements || []) as Statement[];
    const localizedStatements = statements.map((s: Statement) => {
        const t = (s.translations as Translation[])?.find(
            (st: Translation) => st.language_code === activeLocale
        );
        return { code: s.code, text: t?.text || '' };
    });

    const handleBulkSave = () => {
        const lines = bulkText
            .split('\n')
            .map((l: string) => l.trim())
            .filter((l: string) => l !== '');

        const parsedItems = lines.map((line: string) => {
            // Check for TSV (Tab separated): "Code\tText"
            if (line.includes('\t')) {
                const parts = line.split('\t');
                return {
                    code: parts[0].trim(),
                    text: parts.slice(1).join('\t').trim(),
                };
            }

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

        // biome-ignore lint/suspicious/noExplicitAny: complex state update
        updateDraft((d: any) => {
            const currentStatements = importMode === 'append' ? d.statements || [] : [];
            const startingIndex = currentStatements.length;

            const newStatements = parsedItems.map((item, idx) => {
                const code = item.code || `s${startingIndex + idx + 1}`;

                return {
                    code,
                    // biome-ignore lint/suspicious/noExplicitAny: complex types
                    translations: (d.translations || []).map((t: any) => ({
                        language_code: t.language_code,
                        text: t.language_code === activeLocale ? item.text : '',
                    })),
                };
            });

            d.statements = [...currentStatements, ...newStatements];
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

            // Binomial coefficient helper
            const getBinomial = (n: number, k: number): number => {
                if (k < 0 || k > n) return 0;
                if (k === 0 || k === n) return 1;
                if (k > n / 2) k = n - k;
                let res = 1;
                for (let i = 1; i <= k; i++) res = (res * (n - i + 1)) / i;
                return res;
            };

            const weights = [];
            for (let i = 0; i < numColumns; i++) {
                weights.push(getBinomial(numColumns - 1, i));
            }

            const totalWeight = weights.reduce((a, b) => a + b, 0);
            const idealCapacities = weights.map((w) => (w / totalWeight) * N);

            const newCapacities = new Array(numColumns).fill(0);
            let currentTotal = 0;

            // Maintain horizontal symmetry
            const half = Math.floor(numColumns / 2);
            for (let i = 0; i < half; i++) {
                const pairAvg = idealCapacities[i];
                const cap = Math.max(1, Math.floor(pairAvg));
                newCapacities[i] = cap;
                newCapacities[numColumns - 1 - i] = cap;
                currentTotal += cap * 2;
            }

            // Center column if exists
            if (numColumns % 2 !== 0) {
                const centerIdx = half;
                const cap = Math.max(1, N - currentTotal);
                newCapacities[centerIdx] = cap;
                currentTotal += cap;
            }

            // Final bridge: if currentTotal !== N, adjust from center outwards to keep symmetry
            const diff = N - currentTotal;
            if (diff !== 0) {
                // If diff is odd and we have no center, we must break symmetry slightly or adjust N
                // But N is fixed. If K is even and diff is odd, one side will have +1.

                const centerIdx = Math.floor(numColumns / 2);
                if (numColumns % 2 !== 0) {
                    // Symmetric adjustment possible at center
                    newCapacities[centerIdx] += diff;
                } else {
                    // Even columns, must adjust a pair or break symmetry
                    if (diff % 2 === 0) {
                        const left = centerIdx - 1;
                        const right = centerIdx;
                        newCapacities[left] += diff / 2;
                        newCapacities[right] += diff / 2;
                    } else {
                        // Break symmetry by 1 at the center
                        newCapacities[centerIdx] += diff;
                    }
                }
            }

            // Ensure no capacity is below 1 if N >= K
            for (let i = 0; i < numColumns; i++) {
                if (newCapacities[i] <= 0 && N >= numColumns) newCapacities[i] = 1;
                if (d.grid_config?.[i]) {
                    d.grid_config[i].capacity = newCapacities[i];
                }
            }
        });
        toast.success(
            t('admin.design.qsort.grid.reshaped', 'Grid reshaped to a balanced distribution')
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

    return (
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
                        <Grid3X3 className="h-4 w-4" /> {t('admin.design.qsort.tabs.distribution')}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="statements" className="space-y-8 pt-6">
                    <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden">
                        <CardHeader className="pb-4">
                            <div className="flex items-center gap-3 mb-1">
                                <div className="bg-indigo-50 p-2 rounded-xl border border-indigo-100 shadow-sm">
                                    <Plus className="h-4 w-4 text-indigo-600" />
                                </div>
                                <CardTitle className="text-base font-bold text-slate-900 tracking-tight">
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
                                onValueChange={(v) => setImportMode(v as 'replace' | 'append')}
                                className="flex gap-6"
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
                            </RadioGroup>
                            <Textarea
                                placeholder={t('admin.design.qsort.bulk.placeholder')}
                                className="min-h-[200px] font-serif text-base leading-relaxed rounded-xl border-slate-200 focus:ring-indigo-500/20 transition-all bg-slate-50/30"
                                value={bulkText}
                                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                                    setBulkText(e.target.value)
                                }
                            />
                            <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
                                <p className="text-xs font-black uppercase tracking-widest text-slate-400 px-1">
                                    {t('admin.design.qsort.bulk.detected', {
                                        count: bulkText.split('\n').filter((l) => l.trim() !== '')
                                            .length,
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
                                        : t('admin.design.qsort.bulk.process_append')}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

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
                        {statements.length > 0 && (
                            <div className="flex items-center gap-2">
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
                                    {t('common.add', 'Add')}
                                </Button>
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
                                                    // biome-ignore lint/suspicious/noExplicitAny: complex draft
                                                    d.statements.forEach((s: any, idx: number) => {
                                                        s.code = `s${idx + 1}`;
                                                    });
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
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                        {localizedStatements.map((item, idx) => {
                            const isEditing = editingIndex === idx;

                            return (
                                <div
                                    key={idx}
                                    className="flex items-center gap-4 p-4 bg-white border-none shadow-sm rounded-2xl text-sm group transition-all hover:shadow-md hover:ring-1 hover:ring-indigo-100"
                                >
                                    {isEditing ? (
                                        <Input
                                            value={editingCode}
                                            onChange={(e) => setEditingCode(e.target.value)}
                                            className="w-16 h-8 text-[10px] font-black font-mono text-center p-0 rounded-lg border-indigo-200 focus:ring-indigo-500/20"
                                        />
                                    ) : (
                                        <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg min-w-[36px] text-center font-mono border border-indigo-100">
                                            {item.code}
                                        </span>
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
                                                    className="h-8 w-8 text-green-600 hover:bg-green-50 rounded-lg"
                                                >
                                                    <CheckCircle2 className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => setEditingIndex(null)}
                                                    className="h-8 w-8 text-slate-400 hover:bg-slate-50 rounded-lg"
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
                                                className="flex-1 cursor-text hover:bg-slate-50 px-3 py-2 rounded-xl transition-all font-medium text-slate-700 leading-relaxed"
                                                onClick={() => {
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
                                                className="h-9 w-9 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl opacity-0 group-hover:opacity-100 transition-all"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Research Settings */}
                    <Card className="border-none shadow-sm bg-white rounded-2xl overflow-hidden mt-10">
                        <CardHeader className="pb-4">
                            <CardTitle className="text-sm font-bold text-slate-900 tracking-tight">
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
                                />
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="grid" className="space-y-8 pt-6">
                    {/* Methodological Context */}
                    <TooltipProvider>
                        <div className="flex items-center gap-4 p-5 bg-indigo-50/50 border border-indigo-100/60 rounded-2xl shadow-sm">
                            <div className="size-10 rounded-xl bg-white border border-indigo-100 flex items-center justify-center shadow-sm">
                                <Grid3X3 className="h-5 w-5 text-indigo-600" />
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-bold text-indigo-950 tracking-tight">
                                    {t('admin.design.qsort.grid.title')}
                                </p>
                                <p className="text-[13px] font-medium text-indigo-600 mt-0.5 leading-relaxed">
                                    {t('admin.design.qsort.grid.desc')}
                                </p>
                            </div>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-9 w-9 text-indigo-400 hover:text-indigo-600 border-indigo-200/50 bg-white rounded-xl shadow-sm hover:bg-indigo-50"
                                    >
                                        <HelpCircle className="h-5 w-5" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent
                                    className="max-w-xs text-xs p-3 rounded-xl border-indigo-100 shadow-xl"
                                    side="left"
                                >
                                    <p className="font-bold text-indigo-950">
                                        {t('admin.design.qsort.grid.tooltip_title')}
                                    </p>
                                    <p className="mt-1.5 text-indigo-800/80 leading-relaxed font-medium">
                                        {t('admin.design.qsort.grid.tooltip_desc')}
                                    </p>
                                </TooltipContent>
                            </Tooltip>
                        </div>
                    </TooltipProvider>

                    {/* Distribution Visualizer (Mini Chart) */}
                    <div className="flex items-end justify-center gap-1.5 h-16 mb-2 px-10">
                        {grid.map((col, idx) => {
                            const maxCapacity = Math.max(...grid.map((c) => c.capacity || 1));
                            const heightPercentage = ((col.capacity || 0) / maxCapacity) * 100;
                            return (
                                <div
                                    key={idx}
                                    className="group/bar relative flex-1 flex flex-col items-center justify-end h-full"
                                >
                                    <div
                                        className={cn(
                                            'w-full rounded-t-sm transition-all duration-500 ease-out',
                                            isValid
                                                ? 'bg-indigo-400 group-hover/bar:bg-indigo-500'
                                                : 'bg-slate-300 group-hover/bar:bg-slate-400'
                                        )}
                                        style={{ height: `${heightPercentage}%` }}
                                    >
                                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover/bar:opacity-100 transition-opacity bg-slate-900 text-white text-[10px] font-bold py-0.5 px-1.5 rounded pointer-events-none whitespace-nowrap z-10">
                                            {col.capacity} {t('common.slots', 'slots')}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Shape Indicators */}
                    <div className="flex items-center justify-center gap-6 py-2 px-6 bg-slate-50 border border-slate-100 rounded-2xl mb-8 mx-10">
                        <div className="flex items-center gap-2">
                            {isValid ? (
                                <div className="size-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
                            ) : (
                                <div className="size-2 rounded-full bg-amber-500 animate-pulse" />
                            )}
                            <span className="text-[11px] font-black uppercase tracking-widest text-slate-600">
                                {totalStatements} {t('admin.design.qsort.grid.statements')} vs{' '}
                                {totalSlots} {t('common.slots')}
                            </span>
                        </div>
                        <div className="w-px h-3 bg-slate-200" />
                        <div className="flex items-center gap-2">
                            {isBellShaped ? (
                                <span className="text-[11px] font-black uppercase tracking-widest text-indigo-600 flex items-center gap-1.5">
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    {t('admin.design.qsort.grid.ideal_shape')}
                                </span>
                            ) : isSymmetric ? (
                                <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                                    {t('admin.design.qsort.grid.symmetric')}
                                </span>
                            ) : (
                                <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                                    {t('admin.design.qsort.grid.asymmetric')}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Visual Grid Representative */}
                    <div className="bg-slate-50/50 border-2 border-dashed border-slate-200 rounded-3xl p-10 flex flex-col items-center shadow-inner group/grid transition-all hover:bg-slate-50/80">
                        <div className="flex items-end gap-2 mb-10 overflow-x-auto max-w-full pb-6 px-6 h-[280px]">
                            {grid.map((col, idx) => (
                                <div
                                    key={idx}
                                    className="flex flex-col items-center gap-3 relative group/col"
                                >
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-7 w-7 hover:bg-indigo-600 hover:text-white rounded-lg shadow-sm border-slate-200 bg-white transition-all transform active:scale-95"
                                        onClick={() => updateGridCapacity(idx, 1)}
                                        aria-label={`Increase capacity for column ${idx}`}
                                    >
                                        <Plus className="h-3.5 w-3.5" />
                                    </Button>

                                    <div
                                        className="flex flex-col-reverse gap-1.5 min-h-[40px]"
                                        data-testid={`grid-column-${idx}-slots`}
                                    >
                                        {Array.from({ length: col.capacity || 0 }).map((_, i) => (
                                            <div
                                                key={i}
                                                className={cn(
                                                    'w-10 h-3.5 rounded-sm border shadow-[0_1px_0_rgba(0,0,0,0.05)] transition-all',
                                                    isValid
                                                        ? 'bg-indigo-500/20 border-indigo-500/30'
                                                        : 'bg-slate-300 border-slate-400/30'
                                                )}
                                            />
                                        ))}
                                    </div>

                                    <div
                                        className="mt-2 text-[11px] font-black w-9 h-9 rounded-xl border-2 bg-white flex items-center justify-center shadow-sm text-slate-700 tracking-tighter"
                                        data-testid={`grid-column-${idx}-score`}
                                    >
                                        {col.score === Infinity || col.score === -Infinity
                                            ? '?'
                                            : col.score > 0
                                              ? `+${col.score}`
                                              : col.score}
                                    </div>

                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-7 w-7 hover:bg-red-500 hover:text-white rounded-lg shadow-sm border-slate-200 bg-white transition-all transform active:scale-95"
                                        onClick={() => updateGridCapacity(idx, -1)}
                                        disabled={(col.capacity || 0) <= 0}
                                        aria-label={`Decrease capacity for column ${idx}`}
                                    >
                                        <Minus className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            ))}
                        </div>

                        {/* Symmetric Column Management Buttons */}
                        <div className="flex items-center gap-6 mb-8">
                            <div className="flex items-center gap-4">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={removeExtremeColumns}
                                    className="h-10 px-6 rounded-2xl bg-white border-slate-200 shadow-sm hover:bg-red-50 hover:text-red-600 hover:border-red-100 transition-all font-bold gap-2"
                                    title={t(
                                        'admin.design.qsort.grid.remove_extreme_columns',
                                        'Remove extreme columns'
                                    )}
                                    data-testid="reduce-grid-button"
                                >
                                    <Minus className="h-4 w-4" />
                                    {t('common.reduce', 'Reduce')}
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={addExtremeColumns}
                                    className="h-10 px-6 rounded-2xl bg-white border-slate-200 shadow-sm hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-100 transition-all font-bold gap-2"
                                    title={t(
                                        'admin.design.qsort.grid.add_extreme_columns',
                                        'Add extreme columns'
                                    )}
                                    data-testid="expand-grid-button"
                                >
                                    <Plus className="h-4 w-4" />
                                    {t('common.expand', 'Expand')}
                                </Button>
                            </div>

                            <div className="w-px h-8 bg-slate-200" />

                            <Button
                                variant="outline"
                                size="sm"
                                onClick={autoShapeGrid}
                                className="h-10 px-6 rounded-2xl bg-indigo-50 text-indigo-600 border-indigo-100 shadow-sm hover:bg-indigo-100 transition-all font-bold gap-2"
                                title={t(
                                    'admin.design.qsort.grid.auto_balance_desc',
                                    'Reshape grid to a balanced semi-normal distribution'
                                )}
                                data-testid="auto-balance-button"
                            >
                                <Wand2 className="h-4 w-4" />
                                {t('admin.design.qsort.grid.auto_balance', 'Auto-Balance')}
                            </Button>

                            <div className="w-px h-8 bg-slate-200" />

                            <div className="flex items-center gap-3">
                                <Switch
                                    id="symmetry-lock"
                                    checked={draft.symmetry_lock ?? true}
                                    onCheckedChange={(checked) => {
                                        updateDraft((d) => {
                                            d.symmetry_lock = checked;
                                        });
                                    }}
                                />
                                <Label
                                    htmlFor="symmetry-lock"
                                    className="text-xs font-bold text-slate-600 cursor-pointer"
                                >
                                    {t('admin.design.qsort.grid.symmetry_lock', 'Symmetry Lock')}
                                </Label>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <HelpCircle className="h-3.5 w-3.5 text-slate-400" />
                                        </TooltipTrigger>
                                        <TooltipContent className="text-[10px] max-w-[200px]">
                                            {t(
                                                'admin.design.qsort.grid.symmetry_lock_desc',
                                                'Automatically apply changes to opposite columns to maintain a balanced distribution.'
                                            )}
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>
                        </div>

                        {/* Validation Footer */}
                        <div
                            className={cn(
                                'flex items-center gap-6 px-8 py-4 rounded-3xl border shadow-xl transition-all duration-300 transform',
                                isValid
                                    ? 'bg-white border-green-200 ring-4 ring-green-500/5'
                                    : 'bg-white border-amber-200 ring-4 ring-amber-500/5'
                            )}
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
                                    <Quote className="h-4 w-4 text-slate-500" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        Statements
                                    </span>
                                    <span className="text-sm font-bold text-slate-900">
                                        {totalStatements}
                                    </span>
                                </div>
                            </div>
                            <div className="w-px h-8 bg-slate-100" />
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">
                                    <Grid3X3 className="h-4 w-4 text-slate-500" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        Grid slots
                                    </span>
                                    <span className="text-sm font-bold text-slate-900">
                                        {totalSlots}
                                    </span>
                                </div>
                            </div>
                            <div className="w-px h-8 bg-slate-100" />
                            <div className="flex items-center gap-4">
                                {isValid ? (
                                    <div className="size-9 rounded-full bg-green-50 border border-green-100 flex items-center justify-center">
                                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                                    </div>
                                ) : (
                                    <div className="size-9 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center">
                                        <AlertCircle className="h-5 w-5 text-amber-600" />
                                    </div>
                                )}
                                <span
                                    className={cn(
                                        'text-sm font-bold tracking-tight',
                                        isValid ? 'text-green-600' : 'text-amber-600'
                                    )}
                                >
                                    {isValid
                                        ? t('admin.design.qsort.grid.perfect')
                                        : totalStatements > totalSlots
                                          ? t('admin.design.qsort.grid.too_many', {
                                                count: Math.abs(totalStatements - totalSlots),
                                            })
                                          : t('admin.design.qsort.grid.too_few', {
                                                count: Math.abs(totalStatements - totalSlots),
                                            })}
                                </span>
                            </div>
                        </div>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
};

export default QSortEditor;
