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

import type { StatementRead, StatementTranslationRead, GridColumn } from '@/api/model';

// Define basic types for clarity
type Statement = StatementRead;
type Translation = StatementTranslationRead;

const QSortEditor = () => {
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
        toast.success(
            `Successfully ${importMode === 'append' ? 'appended' : 'imported'} ${parsedItems.length} statements`
        );
    };

    const handleClearAll = () => {
        if (confirm('Are you sure you want to delete ALL statements? This cannot be undone.')) {
            updateDraft((d: any) => {
                d.statements = [];
            });
            toast.info('All statements cleared');
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
                // biome-ignore lint/suspicious/noExplicitAny: complex types
                const translation = statement.translations?.find(
                    (t: any) => t.language_code === activeLocale
                );
                if (translation) {
                    translation.text = editingText;
                }
            }
        });
        setEditingIndex(null);
        toast.success('Statement updated');
    };

    return (
        <div className="space-y-6">
            <Tabs
                value={activeSubTab}
                onValueChange={(v) => setActiveSubTab(v as 'statements' | 'grid')}
            >
                <TabsList className="grid grid-cols-2 w-full max-w-[400px]">
                    <TabsTrigger value="statements" className="gap-2">
                        <Quote className="h-4 w-4" /> Statements
                    </TabsTrigger>
                    <TabsTrigger value="grid" className="gap-2">
                        <Grid3X3 className="h-4 w-4" /> Distribution
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="statements" className="space-y-6 pt-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm">Bulk editor (quick paste)</CardTitle>
                            <CardDescription className="text-xs">
                                One statement per line. Supports "Code: Text" format.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <RadioGroup
                                defaultValue="replace"
                                value={importMode}
                                onValueChange={(v) => setImportMode(v as 'replace' | 'append')}
                                className="flex gap-4"
                            >
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="replace" id="r1" />
                                    <Label htmlFor="r1">Replace all</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="append" id="r2" />
                                    <Label htmlFor="r2">Append to list</Label>
                                </div>
                            </RadioGroup>
                            <Textarea
                                placeholder="Paste your statements here...&#10;1. First statement&#10;2. Second statement"
                                className="min-h-[200px] font-serif text-base leading-relaxed"
                                value={bulkText}
                                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                                    setBulkText(e.target.value)
                                }
                            />
                            <div className="flex justify-between items-center">
                                <p className="text-xs text-muted-foreground">
                                    {bulkText.split('\n').filter((l) => l.trim() !== '').length}{' '}
                                    statements detected
                                </p>
                                <Button
                                    size="sm"
                                    onClick={handleBulkSave}
                                    disabled={!bulkText.trim()}
                                >
                                    {importMode === 'replace'
                                        ? 'Process & replace statements'
                                        : 'Process & append statements'}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                            <Quote className="h-4 w-4 text-muted-foreground" />
                            Statement set ({statements.length})
                        </h3>
                        {statements.length > 0 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleClearAll}
                                className="text-destructive hover:bg-destructive/5 h-8 gap-2"
                            >
                                <Trash2 className="h-4 w-4" />
                                Clear all
                            </Button>
                        )}
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                        {localizedStatements.map((item, idx) => {
                            const isEditing = editingIndex === idx;

                            return (
                                <div
                                    key={idx}
                                    className="flex items-center gap-3 p-3 bg-background border rounded-lg text-sm group"
                                >
                                    <span className="text-[10px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded min-w-[32px] text-center font-mono">
                                        {item.code}
                                    </span>

                                    {isEditing ? (
                                        <>
                                            <Input
                                                value={editingText}
                                                onChange={(e) => setEditingText(e.target.value)}
                                                className="flex-1"
                                                autoFocus
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        handleSaveStatement();
                                                    } else if (e.key === 'Escape') {
                                                        // Cancel on Escape
                                                        setEditingIndex(null);
                                                    }
                                                }}
                                            />
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={handleSaveStatement}
                                                className="h-6 w-6 text-green-600 hover:bg-green-50"
                                            >
                                                <CheckCircle2 className="h-3 w-3" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => setEditingIndex(null)}
                                                className="h-6 w-6"
                                            >
                                                <AlertCircle className="h-3 w-3" />
                                            </Button>
                                        </>
                                    ) : (
                                        <>
                                            <div
                                                role="button"
                                                tabIndex={0}
                                                className="flex-1 cursor-text hover:bg-muted/50 px-2 py-1 rounded transition-colors"
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
                                                title="Click to edit"
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
                                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <Trash2 className="h-3 w-3" />
                                            </Button>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Research Settings */}
                    <Card className="shadow-sm mt-8">
                        <CardHeader>
                            <CardTitle className="text-base font-bold">Research settings</CardTitle>
                            <CardDescription>
                                Configure how statements are presented to participants
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between py-2">
                                <div className="space-y-1">
                                    <Label
                                        htmlFor="randomize-statements"
                                        className="text-sm font-medium"
                                    >
                                        Randomize statement order
                                    </Label>
                                    <p className="text-xs text-muted-foreground max-w-md">
                                        Present statements in random order for each participant to
                                        prevent order effects.
                                    </p>
                                </div>
                                <Switch
                                    id="randomize-statements"
                                    checked={draft.randomize_statements ?? false}
                                    onCheckedChange={(checked: boolean) => {
                                        updateDraft((d) => {
                                            d.randomize_statements = checked;
                                        });
                                    }}
                                />
                            </div>

                            <div className="flex items-center justify-between py-2 border-t">
                                <div className="space-y-1">
                                    <Label htmlFor="show-codes" className="text-sm font-medium">
                                        Show statement codes
                                    </Label>
                                    <p className="text-xs text-muted-foreground max-w-md">
                                        Display statement codes (e.g., "S1", "S2") alongside the
                                        text.
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

                <TabsContent value="grid" className="space-y-6 pt-4">
                    {/* Methodological Context */}
                    <TooltipProvider>
                        <div className="flex items-center gap-4 p-4 bg-indigo-50/50 border border-indigo-100 rounded-lg">
                            <div className="flex-1">
                                <p className="text-sm font-medium text-indigo-900">
                                    Forced distribution grid
                                </p>
                                <p className="text-xs text-indigo-600 mt-1">
                                    The grid shape forces participants to discriminate between
                                    statements, approximating a normal distribution.
                                </p>
                            </div>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-indigo-400 hover:text-indigo-600"
                                    >
                                        <HelpCircle className="h-5 w-5" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs text-xs" side="left">
                                    <p>
                                        <strong>Why forced distribution?</strong>
                                    </p>
                                    <p className="mt-1">
                                        Q-methodology uses a quasi-normal distribution (kurtosis
                                        &gt; 0) to ensure participants make meaningful distinctions.
                                        The pyramid shape prevents central tendency bias.
                                    </p>
                                </TooltipContent>
                            </Tooltip>
                        </div>
                    </TooltipProvider>

                    {/* Visual Grid Representative */}
                    <div className="bg-muted/30 border border-dashed rounded-xl p-8 flex flex-col items-center">
                        <div className="flex items-end gap-1 mb-8 overflow-x-auto max-w-full pb-4 px-4 h-[250px]">
                            {grid.map((col, idx) => (
                                <div key={idx} className="flex flex-col items-center gap-2">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 hover:bg-primary/10 hover:text-primary rounded-full shadow-sm border bg-background"
                                        onClick={() => updateGridCapacity(idx, 1)}
                                        aria-label={`Increase capacity for column ${idx}`}
                                    >
                                        <Plus className="h-3 w-3" />
                                    </Button>

                                    <div className="flex flex-col-reverse gap-1">
                                        {Array.from({ length: col.capacity || 0 }).map((_, i) => (
                                            <div
                                                key={i}
                                                className={cn(
                                                    'w-8 h-4 rounded-sm border shadow-[0_1px_0_rgba(0,0,0,0.1)]',
                                                    isValid
                                                        ? 'bg-primary/20 border-primary/30'
                                                        : 'bg-muted-foreground/20 border-muted-foreground/30'
                                                )}
                                            />
                                        ))}
                                    </div>

                                    <div className="mt-2 text-[10px] font-black w-8 h-8 rounded-full border bg-background flex items-center justify-center shadow-inner">
                                        {col.score > 0 ? `+${col.score}` : col.score}
                                    </div>

                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 hover:bg-destructive/10 hover:text-destructive rounded-full shadow-sm border bg-background"
                                        onClick={() => updateGridCapacity(idx, -1)}
                                        disabled={(col.capacity || 0) <= 0}
                                        aria-label={`Decrease capacity for column ${idx}`}
                                    >
                                        <Minus className="h-3 w-3" />
                                    </Button>
                                </div>
                            ))}
                        </div>

                        {/* Validation Footer */}
                        <div
                            className={cn(
                                'flex items-center gap-4 px-6 py-3 rounded-full border shadow-sm transition-colors',
                                isValid
                                    ? 'bg-green-50 border-green-200'
                                    : 'bg-amber-50 border-amber-200'
                            )}
                        >
                            <div className="flex items-center gap-2">
                                <Quote className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-semibold">
                                    {totalStatements} statements
                                </span>
                            </div>
                            <div className="w-px h-4 bg-border" />
                            <div className="flex items-center gap-2">
                                <Grid3X3 className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-semibold">
                                    {totalSlots} grid slots
                                </span>
                            </div>
                            <div className="w-px h-4 bg-border" />
                            <div className="flex items-center gap-2">
                                {isValid ? (
                                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                                ) : (
                                    <AlertCircle className="h-4 w-4 text-amber-600" />
                                )}
                                <span
                                    className={cn(
                                        'text-sm font-bold',
                                        isValid ? 'text-green-600' : 'text-amber-600'
                                    )}
                                >
                                    {isValid
                                        ? 'Perfect match!'
                                        : `${Math.abs(totalStatements - totalSlots)} ${totalStatements > totalSlots ? 'too many statements' : 'empty slots'}`}
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
