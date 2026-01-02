import { useState } from 'react';
import { useStudyDesigner } from '@/store/useStudyDesigner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
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

// Define basic types for clarity

const QSortEditor = () => {
    const { draft, activeLocale, updateDraft } = useStudyDesigner();
    const [bulkText, setBulkText] = useState('');
    const [activeSubTab, setActiveSubTab] = useState<'statements' | 'grid'>('statements');

    if (!draft) return null;

    // --- Statements Logic ---
    const statements: Statement[] = draft.statements || [];
    const localizedStatements = statements
        .map((s: Statement) => {
            const t = (s.translations as Translation[])?.find(
                (st: Translation) => st.language_code === activeLocale
            );
            return t?.text || '';
        })
        .filter((text: string) => text.trim() !== '');

    const handleBulkSave = () => {
        const lines = bulkText
            .split('\n')
            .map((l: string) => l.trim())
            .filter((l: string) => l !== '');

        // Auto-cleanup: remove leading numbers like "1.", "1)", etc.
        const cleanedLines = lines.map((line: string) => line.replace(/^\d+[.)\-\s]+/, '').trim());

        // biome-ignore lint/suspicious/noExplicitAny: complex state update
        updateDraft((d: any) => {
            // Keep existing codes if possible, or generate new ones
            d.statements = cleanedLines.map((line: string, idx: number) => {
                const existing = d.statements?.[idx];
                const translations = (existing?.translations || []) as Translation[];
                // The user's provided diff included this line, but it seems unused in the context of this function.
                // const translation = (draft.translations as Translation[])?.find((t: Translation) => t.language_code === activeLocale);

                const tIdx = translations.findIndex(
                    (t: Translation) => t.language_code === activeLocale
                );

                const newTranslations = [...translations];
                if (tIdx > -1) {
                    newTranslations[tIdx] = { ...newTranslations[tIdx], text: line };
                } else {
                    newTranslations.push({ language_code: activeLocale, text: line });
                }

                return {
                    code: existing?.code || `s${idx + 1}`,
                    translations: newTranslations,
                };
            });
        });
        setBulkText('');
    };

    const grid = (draft.grid_config || []) as Record<string, unknown>[];
    // biome-ignore lint/suspicious/noExplicitAny: complex reduce
    const totalSlots = grid.reduce((acc: number, col: any) => acc + (col.capacity || 0), 0);
    const totalStatements = statements.length;
    const isValid = totalSlots === totalStatements;

    const updateGridCapacity = (idx: number, delta: number) => {
        updateDraft((d) => {
            if (!d.grid_config) return;
            const col = d.grid_config[idx];
            col.capacity = Math.max(0, (col.capacity || 0) + delta);
        });
    };

    return (
        <div className="space-y-6">
            <Tabs
                value={activeSubTab}
                onValueChange={(v: 'statements' | 'grid') => setActiveSubTab(v)}
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
                            <CardTitle className="text-sm">Bulk Editor (Quick Paste)</CardTitle>
                            <CardDescription className="text-xs">
                                One statement per line. Numbers will be cleaned automatically.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
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
                                    Process & Replace Statements
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="grid grid-cols-1 gap-2">
                        {localizedStatements.map((text, idx) => (
                            <div
                                key={idx}
                                className="flex items-center gap-3 p-3 bg-background border rounded-lg text-sm group"
                            >
                                <span className="text-[10px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded min-w-[24px] text-center">
                                    {idx + 1}
                                </span>
                                <span className="flex-1 truncate">{text}</span>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <Trash2 className="h-3 w-3" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </TabsContent>

                <TabsContent value="grid" className="space-y-6 pt-4">
                    {/* Methodological Context */}
                    <TooltipProvider>
                        <div className="flex items-center gap-4 p-4 bg-indigo-50/50 border border-indigo-100 rounded-lg">
                            <div className="flex-1">
                                <p className="text-sm font-medium text-indigo-900">
                                    Forced Distribution Grid
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
                                    {totalStatements} Statements
                                </span>
                            </div>
                            <div className="w-px h-4 bg-border" />
                            <div className="flex items-center gap-2">
                                <Grid3X3 className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-semibold">
                                    {totalSlots} Grid Slots
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
                                        ? 'Perfect Match!'
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
