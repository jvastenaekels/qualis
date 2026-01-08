import { useState } from 'react';
import { useStudyDesigner } from '@/store/useStudyDesigner';
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

    const [importMode, setImportMode] = useState<'replace' | 'append'>('replace');
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editingText, setEditingText] = useState('');

    if (!draft) return null;

    // --- Statements Logic ---
    const statements: Statement[] = (draft.statements || []) as Statement[];
    const localizedStatements = statements
        .map((s: Statement) => {
            const t = (s.translations as Translation[])?.find(
                (st: Translation) => st.language_code === activeLocale
            );
            return { code: s.code, text: t?.text || '' };
        })
        .filter((item) => item.text.trim() !== '');

    const handleBulkSave = () => {
        const lines = bulkText
            .split('\n')
            .map((l: string) => l.trim())
            .filter((l: string) => l !== '');

        const parsedItems = lines.map((line: string) => {
            // Check for TSV (Tab separated): "Code\tText"
            if (line.includes('\t')) {
                const parts = line.split('\t');
                return { code: parts[0].trim(), text: parts.slice(1).join('\t').trim() };
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
                    translations: [{ language_code: activeLocale, text: item.text }],
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

    const updateGridCapacity = (idx: number, delta: number) => {
        updateDraft((d) => {
            if (!d.grid_config) return;
            const col = d.grid_config[idx];
            col.capacity = Math.max(0, (col.capacity || 0) + delta);
        });
    };

    const handleSaveStatement = () => {
        // biome-ignore lint/suspicious/noExplicitAny: complex state update
        updateDraft((d: any) => {
            if (d.statements?.[editingIndex as number]) {
                const statement = d.statements[editingIndex as number];

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
                    <TabsTrigger value="statements" className="gap-2">
                        <Quote className="h-4 w-4" /> {t('admin.design.qsort.tabs.statements')}
                    </TabsTrigger>
                    <TabsTrigger value="grid" className="gap-2">
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
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleClearAll}
                                className="text-red-500 hover:text-red-600 hover:bg-red-50 h-9 px-4 gap-2 rounded-xl font-bold transition-all"
                            >
                                <Trash2 className="h-4 w-4" />
                                {t('admin.design.qsort.set.clear')}
                            </Button>
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
                                    <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg min-w-[36px] text-center font-mono border border-indigo-100">
                                        {item.code}
                                    </span>

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
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        setEditingIndex(idx);
                                                        setEditingText(item.text);
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

                    {/* Visual Grid Representative */}
                    <div className="bg-slate-50/50 border-2 border-dashed border-slate-200 rounded-3xl p-10 flex flex-col items-center shadow-inner group/grid transition-all hover:bg-slate-50/80">
                        <div className="flex items-end gap-2 mb-10 overflow-x-auto max-w-full pb-6 px-6 h-[280px]">
                            {grid.map((col, idx) => (
                                <div key={idx} className="flex flex-col items-center gap-3">
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-7 w-7 hover:bg-indigo-600 hover:text-white rounded-lg shadow-sm border-slate-200 bg-white transition-all transform active:scale-95"
                                        onClick={() => updateGridCapacity(idx, 1)}
                                        aria-label={`Increase capacity for column ${idx}`}
                                    >
                                        <Plus className="h-3.5 w-3.5" />
                                    </Button>

                                    <div className="flex flex-col-reverse gap-1.5 group/col">
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

                                    <div className="mt-2 text-[11px] font-black w-9 h-9 rounded-xl border-2 bg-white flex items-center justify-center shadow-sm text-slate-700 tracking-tighter">
                                        {col.score > 0 ? `+${col.score}` : col.score}
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
