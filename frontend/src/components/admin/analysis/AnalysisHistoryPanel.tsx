import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ClipboardList, Pencil, Trash2, Check, X, ChevronDown, ChevronUp } from 'lucide-react';
import {
    useListAnalysisRunsApiAdminStudiesSlugAnalysisRunsGet,
    useUpdateAnalysisRunApiAdminStudiesSlugAnalysisRunsRunIdPatch,
    useDeleteAnalysisRunApiAdminStudiesSlugAnalysisRunsRunIdDelete,
    getAnalysisRunApiAdminStudiesSlugAnalysisRunsRunIdGet,
    getListAnalysisRunsApiAdminStudiesSlugAnalysisRunsGetQueryKey,
} from '@/api/generated';
import type { AnalysisRunSummary, AnalysisResult } from '@/api/model';
import { useQueryClient } from '@tanstack/react-query';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { EmptyState } from '@/components/ui/empty-state';

interface AnalysisHistoryPanelProps {
    slug: string;
    currentRunId: number | null;
    onLoadRun: (result: AnalysisResult, run: AnalysisRunSummary) => void;
}

function formatDateTime(iso: string): string {
    try {
        return new Date(iso).toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return iso;
    }
}

function truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) return str;
    return `${str.slice(0, maxLen)}…`;
}

export function AnalysisHistoryPanel({ slug, currentRunId, onLoadRun }: AnalysisHistoryPanelProps) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();

    const [collapsed, setCollapsed] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editNotes, setEditNotes] = useState('');
    const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
    const [loadingRunId, setLoadingRunId] = useState<number | null>(null);

    const runsQuery = useListAnalysisRunsApiAdminStudiesSlugAnalysisRunsGet(slug, {
        query: { enabled: !!slug },
    });

    const updateMutation = useUpdateAnalysisRunApiAdminStudiesSlugAnalysisRunsRunIdPatch();
    const deleteMutation = useDeleteAnalysisRunApiAdminStudiesSlugAnalysisRunsRunIdDelete();

    const runs: AnalysisRunSummary[] = runsQuery.data
        ? [...runsQuery.data].sort(
              (a, b) => new Date(b.ran_at).getTime() - new Date(a.ran_at).getTime()
          )
        : [];

    const listQueryKey = getListAnalysisRunsApiAdminStudiesSlugAnalysisRunsGetQueryKey(slug);

    const handleLoadRun = async (run: AnalysisRunSummary) => {
        setLoadingRunId(run.id);
        try {
            const full = await getAnalysisRunApiAdminStudiesSlugAnalysisRunsRunIdGet(slug, run.id);
            onLoadRun(full.result as unknown as AnalysisResult, run);
        } catch {
            toast.error(t('admin.analysis.history.load_error', 'Failed to load the analysis run.'));
        } finally {
            setLoadingRunId(null);
        }
    };

    const handleStartEdit = (run: AnalysisRunSummary) => {
        setEditingId(run.id);
        setEditNotes(run.notes ?? '');
    };

    const handleSaveNotes = (runId: number) => {
        updateMutation.mutate(
            { slug, runId, data: { notes: editNotes || null } },
            {
                onSuccess: () => {
                    toast.success(t('admin.analysis.history.notes_saved', 'Notes saved.'));
                    setEditingId(null);
                    queryClient.invalidateQueries({ queryKey: listQueryKey });
                },
                onError: () => {
                    toast.error(t('admin.analysis.history.notes_error', 'Failed to save notes.'));
                },
            }
        );
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setEditNotes('');
    };

    const handleConfirmDelete = () => {
        if (deleteTargetId === null) return;
        const targetId = deleteTargetId;
        deleteMutation.mutate(
            { slug, runId: targetId },
            {
                onSuccess: () => {
                    toast.success(t('admin.analysis.history.deleted', 'Analysis run deleted.'));
                    setDeleteTargetId(null);
                    queryClient.invalidateQueries({ queryKey: listQueryKey });
                    // If the deleted run is the one currently displayed,
                    // the parent is notified via currentRunId becoming stale —
                    // the caller clears the banner when currentRunId no longer exists.
                    if (currentRunId === targetId) {
                        onLoadRun(
                            null as unknown as AnalysisResult,
                            null as unknown as AnalysisRunSummary
                        );
                    }
                },
                onError: () => {
                    toast.error(
                        t('admin.analysis.history.delete_error', 'Failed to delete the run.')
                    );
                    setDeleteTargetId(null);
                },
            }
        );
    };

    return (
        <div className="border border-slate-200 rounded-2xl bg-white shadow-sm overflow-hidden">
            {/* Header */}
            <button
                type="button"
                onClick={() => setCollapsed((c) => !c)}
                className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors"
                aria-expanded={!collapsed}
            >
                <div className="flex items-center gap-2">
                    <ClipboardList className="size-4 text-slate-500" aria-hidden="true" />
                    <span className="font-black text-sm text-slate-800">
                        {t('admin.analysis.history.title', 'Analysis history')}
                    </span>
                    {runs.length > 0 && (
                        <span className="ml-1 bg-slate-100 text-slate-600 text-xs font-semibold rounded-full px-2 py-0.5">
                            {runs.length}
                        </span>
                    )}
                </div>
                {collapsed ? (
                    <ChevronDown className="size-4 text-slate-400" aria-hidden="true" />
                ) : (
                    <ChevronUp className="size-4 text-slate-400" aria-hidden="true" />
                )}
            </button>

            {!collapsed && (
                <div className="px-5 pb-5">
                    {runsQuery.isLoading && (
                        <p className="text-xs text-slate-400 py-3">
                            {t('admin.analysis.history.loading', 'Loading history…')}
                        </p>
                    )}

                    {runsQuery.isError && (
                        <p className="text-xs text-red-500 py-3">
                            {t(
                                'admin.analysis.history.fetch_error',
                                'Could not load analysis history.'
                            )}
                        </p>
                    )}

                    {runsQuery.isSuccess && runs.length === 0 && (
                        // Wave E.4 (E2 cleanup): migrated to <EmptyState>.
                        // Inline variant, no icon (the panel already has the
                        // ClipboardList in its header). The pedagogical
                        // body (Watts & Stenner / Sneegas citations) is
                        // preserved verbatim.
                        <EmptyState
                            title={t(
                                'admin.analysis.history.empty',
                                'No previous analyses for this study yet — run one to start the audit trail.'
                            )}
                            body={t(
                                'admin.analysis.history.empty_explainer',
                                'Documenting analytical choices supports reproducibility — a core requirement of careful Q-methodological practice (Watts & Stenner 2012; Sneegas 2020). Each run is logged here so you can document and revisit every decision.'
                            )}
                            variant="inline"
                            headingLevel={3}
                        />
                    )}

                    {runsQuery.isSuccess && runs.length > 0 && (
                        <div className="mt-1 divide-y divide-slate-100">
                            {runs.map((run) => (
                                <div key={run.id} className="py-3 flex items-start gap-3">
                                    {/* Main info — clickable row */}
                                    <button
                                        type="button"
                                        onClick={() => handleLoadRun(run)}
                                        disabled={loadingRunId !== null}
                                        className="flex-1 text-left min-w-0 hover:bg-slate-50 rounded-lg px-2 py-1 -mx-2 transition-colors disabled:opacity-50"
                                        aria-label={t(
                                            'admin.analysis.history.load_run_aria',
                                            'Load analysis run from {{date}}',
                                            { date: formatDateTime(run.ran_at) }
                                        )}
                                    >
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-xs font-semibold text-slate-700">
                                                {formatDateTime(run.ran_at)}
                                            </span>
                                            {currentRunId === run.id && (
                                                <span className="text-2xs bg-indigo-100 text-indigo-700 font-black rounded-full px-1.5 py-0.5 uppercase tracking-wide">
                                                    {t(
                                                        'admin.analysis.history.current_tag',
                                                        'current'
                                                    )}
                                                </span>
                                            )}
                                            {loadingRunId === run.id && (
                                                <span className="text-xs text-slate-400">
                                                    {t(
                                                        'admin.analysis.history.loading_run',
                                                        'Loading…'
                                                    )}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                            <span className="text-xs text-slate-500">
                                                {run.extraction_method.toUpperCase()}
                                            </span>
                                            <span className="text-slate-300 text-xs">·</span>
                                            <span className="text-xs text-slate-500">
                                                {t(
                                                    'admin.analysis.history.n_factors_label',
                                                    '{{n}}F',
                                                    { n: run.n_factors }
                                                )}
                                            </span>
                                            <span className="text-slate-300 text-xs">·</span>
                                            <span className="text-xs text-slate-500">
                                                {run.rotation_method}
                                            </span>
                                            <span className="text-slate-300 text-xs">·</span>
                                            <span className="text-xs text-slate-500">
                                                {run.flagging_mode}
                                            </span>
                                            {run.ran_by_email && (
                                                <>
                                                    <span className="text-slate-300 text-xs">
                                                        ·
                                                    </span>
                                                    <span className="text-xs text-slate-400 italic">
                                                        {run.ran_by_email}
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                        {run.notes && editingId !== run.id && (
                                            <p className="mt-1 text-xs text-slate-400 italic">
                                                {truncate(run.notes, 40)}
                                            </p>
                                        )}
                                    </button>

                                    {/* Inline notes editor */}
                                    {editingId === run.id && (
                                        <div className="flex-1 min-w-0 flex items-center gap-1.5">
                                            <input
                                                type="text"
                                                value={editNotes}
                                                onChange={(e) => setEditNotes(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleSaveNotes(run.id);
                                                    if (e.key === 'Escape') handleCancelEdit();
                                                }}
                                                placeholder={t(
                                                    'admin.analysis.history.notes_placeholder',
                                                    'Add a note about this run…'
                                                )}
                                                className="flex-1 min-w-0 text-xs border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                                aria-label={t(
                                                    'admin.analysis.history.notes_aria',
                                                    'Edit notes for this run'
                                                )}
                                                // biome-ignore lint/a11y/noAutofocus: intentional for inline edit UX
                                                autoFocus
                                            />
                                            <button
                                                type="button"
                                                onClick={() => handleSaveNotes(run.id)}
                                                className="shrink-0 text-green-600 hover:text-green-700"
                                                aria-label={t(
                                                    'admin.analysis.history.save_notes_aria',
                                                    'Save notes'
                                                )}
                                            >
                                                <Check className="size-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleCancelEdit}
                                                className="shrink-0 text-slate-400 hover:text-slate-600"
                                                aria-label={t(
                                                    'admin.analysis.history.cancel_edit_aria',
                                                    'Cancel editing'
                                                )}
                                            >
                                                <X className="size-3.5" />
                                            </button>
                                        </div>
                                    )}

                                    {/* Action buttons */}
                                    {editingId !== run.id && (
                                        <div className="flex items-center gap-1 shrink-0 mt-1">
                                            <button
                                                type="button"
                                                onClick={() => handleStartEdit(run)}
                                                className="text-slate-400 hover:text-slate-600 p-1 rounded transition-colors"
                                                title={t(
                                                    'admin.analysis.history.edit_notes',
                                                    'Edit notes'
                                                )}
                                                aria-label={t(
                                                    'admin.analysis.history.edit_notes_aria',
                                                    'Edit notes for this run'
                                                )}
                                            >
                                                <Pencil className="size-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDeleteTargetId(run.id)}
                                                className="text-slate-400 hover:text-red-500 p-1 rounded transition-colors"
                                                title={t(
                                                    'admin.analysis.history.delete_run',
                                                    'Delete run'
                                                )}
                                                aria-label={t(
                                                    'admin.analysis.history.delete_run_aria',
                                                    'Delete this analysis run'
                                                )}
                                            >
                                                <Trash2 className="size-3.5" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Delete confirmation dialog */}
            <AlertDialog
                open={deleteTargetId !== null}
                onOpenChange={(open) => {
                    if (!open) setDeleteTargetId(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t(
                                'admin.analysis.history.delete_dialog_title',
                                'Delete analysis run?'
                            )}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t(
                                'admin.analysis.history.delete_dialog_description',
                                'Deleting an analysis run removes evidence of an analytical choice from the audit trail. Are you sure?'
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>
                            {t('admin.analysis.history.cancel', 'Cancel')}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirmDelete}
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >
                            {t('admin.analysis.history.delete_confirm', 'Delete')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
