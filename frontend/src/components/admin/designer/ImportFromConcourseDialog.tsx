import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Library, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    useListConcoursesApiAdminConcoursesGet,
    useGetConcourseApiAdminConcoursesConcourseIdGet,
    useImportFromConcourseApiAdminStudiesSlugImportConcoursePost,
} from '@/api/generated';
import type { ConcourseItemRead, ConcourseItemStatus } from '@/api/model';
import { parseApiErrorSync } from '@/lib/error-utils';
import { cn } from '@/lib/utils';

const STATUS_COLORS: Record<string, string> = {
    proposed: 'bg-amber-100 text-amber-800',
    accepted: 'bg-emerald-100 text-emerald-800',
    rejected: 'bg-red-100 text-red-800',
};

interface ImportFromConcourseDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    studySlug: string;
    activeLocale: string;
    onImported: () => void;
}

export function ImportFromConcourseDialog({
    open,
    onOpenChange,
    studySlug,
    activeLocale,
    onImported,
}: ImportFromConcourseDialogProps) {
    const { t } = useTranslation();

    const [selectedConcourseId, setSelectedConcourseId] = useState<string>('');
    const [selectedItemIds, setSelectedItemIds] = useState<Set<number>>(new Set());
    const [codePrefix, setCodePrefix] = useState('');
    const [replaceExisting, setReplaceExisting] = useState(false);
    const [showOnlyAccepted, setShowOnlyAccepted] = useState(true);

    const { data: concoursesData } = useListConcoursesApiAdminConcoursesGet(undefined, {
        query: { enabled: open },
    });
    const concourses = concoursesData?.items ?? [];

    const concourseId = selectedConcourseId ? Number(selectedConcourseId) : undefined;
    const { data: concourse, isLoading: isLoadingConcourse } =
        useGetConcourseApiAdminConcoursesConcourseIdGet(concourseId as number, {
            query: { enabled: !!concourseId },
        });

    const importMutation = useImportFromConcourseApiAdminStudiesSlugImportConcoursePost();

    const filteredItems = useMemo(() => {
        if (!concourse?.items) return [];
        return concourse.items.filter((item) => !showOnlyAccepted || item.status === 'accepted');
    }, [concourse?.items, showOnlyAccepted]);

    const toggleItem = (id: number) => {
        setSelectedItemIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const toggleAll = () => {
        if (selectedItemIds.size === filteredItems.length) {
            setSelectedItemIds(new Set());
        } else {
            setSelectedItemIds(new Set(filteredItems.map((i) => i.id)));
        }
    };

    const handleImport = async () => {
        if (!concourseId || selectedItemIds.size === 0) return;
        try {
            await importMutation.mutateAsync({
                slug: studySlug,
                data: {
                    concourse_id: concourseId,
                    item_ids: [...selectedItemIds],
                    code_prefix: codePrefix,
                    replace_existing: replaceExisting,
                },
            });
            toast.success(
                t('admin.concourse_import.success', '{{count}} statements imported', {
                    count: selectedItemIds.size,
                })
            );
            onOpenChange(false);
            resetState();
            onImported();
        } catch (err) {
            toast.error(parseApiErrorSync(err, t('admin.concourse_import.error', 'Import failed')));
        }
    };

    const resetState = () => {
        setSelectedConcourseId('');
        setSelectedItemIds(new Set());
        setCodePrefix('');
        setReplaceExisting(false);
    };

    const getItemText = (item: ConcourseItemRead) =>
        item.translations?.find((tr) => tr.language_code === activeLocale)?.text ??
        item.translations?.[0]?.text ??
        '';

    const STATUS_LABELS: Record<ConcourseItemStatus, string> = {
        proposed: t('admin.concourse.status.proposed', 'Proposed'),
        accepted: t('admin.concourse.status.accepted', 'Accepted'),
        rejected: t('admin.concourse.status.rejected', 'Rejected'),
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(v) => {
                onOpenChange(v);
                if (!v) resetState();
            }}
        >
            <DialogContent className="border-slate-200 bg-white shadow-2xl max-w-2xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="text-lg font-black text-slate-900 flex items-center gap-2">
                        <Library className="size-5 text-indigo-600" />
                        {t('admin.concourse_import.title', 'Import from Concourse')}
                    </DialogTitle>
                    <DialogDescription className="text-sm text-slate-500">
                        {t(
                            'admin.concourse_import.desc',
                            'Select items from a concourse to import as study statements. Items are copied — changes to the concourse will not affect the study.'
                        )}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2 flex-1 overflow-hidden flex flex-col">
                    {/* Concourse selector */}
                    <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                        <div className="flex-1 space-y-1">
                            <Label className="text-2xs font-black text-slate-500">
                                {t('admin.concourse_import.select_concourse', 'Concourse')}
                            </Label>
                            <Select
                                value={selectedConcourseId}
                                onValueChange={(v) => {
                                    setSelectedConcourseId(v);
                                    setSelectedItemIds(new Set());
                                }}
                            >
                                <SelectTrigger className="h-10 rounded-xl bg-white">
                                    <SelectValue
                                        placeholder={t(
                                            'admin.concourse_import.select_placeholder',
                                            'Choose a concourse...'
                                        )}
                                    />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl">
                                    {concourses.map((c) => (
                                        <SelectItem key={c.id} value={String(c.id)}>
                                            {c.title} ({c.item_count}{' '}
                                            {t('admin.concourse.items_label', 'items')})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-2xs font-black text-slate-500">
                                {t('admin.concourse_import.code_prefix', 'Code prefix')}
                            </Label>
                            <Input
                                value={codePrefix}
                                onChange={(e) => setCodePrefix(e.target.value)}
                                placeholder={t(
                                    'admin.concourse_import.code_prefix_placeholder',
                                    'e.g. S'
                                )}
                                className="h-10 rounded-xl w-full sm:w-24"
                            />
                        </div>
                    </div>

                    {/* Options */}
                    <div className="flex items-center gap-4">
                        <Label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer font-normal">
                            <Switch
                                checked={showOnlyAccepted}
                                onCheckedChange={(v) => {
                                    setShowOnlyAccepted(v);
                                    setSelectedItemIds(new Set());
                                }}
                            />
                            {t('admin.concourse_import.only_accepted', 'Only accepted')}
                        </Label>
                        <Label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer font-normal">
                            <Switch
                                checked={replaceExisting}
                                onCheckedChange={setReplaceExisting}
                            />
                            {t(
                                'admin.concourse_import.replace_existing',
                                'Replace existing statements'
                            )}
                        </Label>
                    </div>

                    {/* Item list */}
                    {concourseId && isLoadingConcourse && (
                        <div className="py-8 flex justify-center">
                            <Loader2 className="size-5 animate-spin text-slate-400" />
                        </div>
                    )}

                    {concourseId && !isLoadingConcourse && filteredItems.length > 0 && (
                        <div className="flex-1 overflow-auto border rounded-xl">
                            {/* Select all header */}
                            <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 border-b sticky top-0">
                                <Checkbox
                                    checked={
                                        selectedItemIds.size === filteredItems.length &&
                                        filteredItems.length > 0
                                    }
                                    onCheckedChange={toggleAll}
                                />
                                <span className="text-xs font-bold text-slate-500">
                                    {selectedItemIds.size > 0
                                        ? t(
                                              'admin.concourse_import.selected',
                                              '{{count}} selected',
                                              {
                                                  count: selectedItemIds.size,
                                              }
                                          )
                                        : t('admin.concourse_import.select_all', 'Select all')}
                                </span>
                            </div>
                            <div className="divide-y divide-slate-50">
                                {filteredItems.map((item) => (
                                    <div
                                        key={item.id}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => toggleItem(item.id)}
                                        onKeyDown={(e) => {
                                            if (e.key === ' ' || e.key === 'Enter') {
                                                e.preventDefault();
                                                toggleItem(item.id);
                                            }
                                        }}
                                        className={cn(
                                            'flex items-start gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-50/50 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-inset',
                                            selectedItemIds.has(item.id) && 'bg-indigo-50/30'
                                        )}
                                    >
                                        <Checkbox
                                            checked={selectedItemIds.has(item.id)}
                                            onCheckedChange={() => toggleItem(item.id)}
                                            className="mt-0.5"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <Badge
                                                    variant="outline"
                                                    className="font-mono text-xs bg-slate-50"
                                                >
                                                    {codePrefix}
                                                    {item.code}
                                                </Badge>
                                                <Badge
                                                    variant="outline"
                                                    className={cn(
                                                        'text-xs',
                                                        STATUS_COLORS[item.status] ?? ''
                                                    )}
                                                >
                                                    {STATUS_LABELS[item.status] ?? item.status}
                                                </Badge>
                                            </div>
                                            <p className="text-sm text-slate-700 leading-relaxed">
                                                {getItemText(item)}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {concourseId && !isLoadingConcourse && filteredItems.length === 0 && (
                        <div className="py-8 text-center text-slate-400 text-sm">
                            {showOnlyAccepted
                                ? t(
                                      'admin.concourse_import.no_accepted',
                                      'No accepted items in this concourse. Uncheck "Only accepted" to see all.'
                                  )
                                : t(
                                      'admin.concourse_import.no_items',
                                      'This concourse has no items.'
                                  )}
                        </div>
                    )}

                    {!concourseId && concourses.length === 0 && (
                        <div className="py-8 text-center text-slate-400 text-sm">
                            {t(
                                'admin.concourse_import.no_concourses',
                                'No concourses in this workspace. Create one first.'
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter className="border-t pt-4">
                    {replaceExisting && (
                        <p className="text-sm text-amber-700 font-semibold mr-auto border-l-2 border-amber-400 pl-2">
                            {t(
                                'admin.concourse_import.replace_warning',
                                'This will delete all existing statements in the study.'
                            )}
                        </p>
                    )}
                    <Button
                        onClick={handleImport}
                        disabled={selectedItemIds.size === 0 || importMutation.isPending}
                        className={cn(
                            'h-10 rounded-xl px-6 font-bold text-white',
                            replaceExisting
                                ? 'bg-amber-600 hover:bg-amber-700'
                                : 'bg-indigo-600 hover:bg-indigo-700'
                        )}
                    >
                        {importMutation.isPending ? (
                            <Loader2 className="size-4 animate-spin mr-2" />
                        ) : (
                            <Upload className="size-4 mr-2" />
                        )}
                        {t('admin.concourse_import.import_button', 'Import {{count}} statements', {
                            count: selectedItemIds.size,
                        })}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
