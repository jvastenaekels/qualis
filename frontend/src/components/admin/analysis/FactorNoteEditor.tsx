import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Pencil, Check, X, NotebookText } from 'lucide-react';
import {
    useUpdateAnalysisRunApiAdminStudiesSlugAnalysisRunsRunIdPatch,
    getListAnalysisRunsApiAdminStudiesSlugAnalysisRunsGetQueryKey,
} from '@/api/generated';

interface FactorNoteEditorProps {
    slug: string;
    runId: number;
    /** 0-based factor index — sent to the API as `String(factorIndex + 1)`. */
    factorIndex: number;
    /** The narrative currently saved on the server, or `''`. */
    currentNote: string;
}

const MAX_LENGTH = 4000;

export function FactorNoteEditor({ slug, runId, factorIndex, currentNote }: FactorNoteEditorProps) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const factorKey = String(factorIndex + 1);

    const [isEditing, setIsEditing] = useState(false);
    const [draft, setDraft] = useState(currentNote);

    // Reset the draft whenever the source of truth (currentNote) changes —
    // e.g. when the user navigates between runs.
    useEffect(() => {
        setDraft(currentNote);
    }, [currentNote]);

    const mutation = useUpdateAnalysisRunApiAdminStudiesSlugAnalysisRunsRunIdPatch();

    const handleStart = () => {
        setDraft(currentNote);
        setIsEditing(true);
    };

    const handleCancel = () => {
        setDraft(currentNote);
        setIsEditing(false);
    };

    const handleSave = () => {
        if (draft.length > MAX_LENGTH) return;
        mutation.mutate(
            {
                slug,
                runId,
                data: { factor_notes: { [factorKey]: draft } },
            },
            {
                onSuccess: () => {
                    queryClient.invalidateQueries({
                        queryKey:
                            getListAnalysisRunsApiAdminStudiesSlugAnalysisRunsGetQueryKey(slug),
                    });
                    setIsEditing(false);
                    toast.success(t('admin.analysis.factor_note.saved', 'Factor narrative saved.'));
                },
                onError: () => {
                    toast.error(
                        t(
                            'admin.analysis.factor_note.error',
                            'Failed to save the factor narrative.'
                        )
                    );
                },
            }
        );
    };

    const charCount = draft.length;
    const isOverLimit = charCount > MAX_LENGTH;

    if (isEditing) {
        return (
            <div className="mt-2 space-y-1.5">
                <div className="flex items-center gap-1.5 text-2xs text-slate-500 font-medium">
                    <NotebookText className="size-3" aria-hidden="true" />
                    {t('admin.analysis.factor_note.label', 'Factor narrative')}
                </div>
                <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') handleCancel();
                    }}
                    rows={4}
                    placeholder={t(
                        'admin.analysis.factor_note.placeholder',
                        'Write the interpretive narrative for this factor — the discourse, voices, and tensions it foregrounds.'
                    )}
                    className="w-full text-xs border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 leading-snug"
                    aria-label={t(
                        'admin.analysis.factor_note.aria',
                        'Edit factor {{n}} narrative',
                        { n: factorIndex + 1 }
                    )}
                    // biome-ignore lint/a11y/noAutofocus: intentional inline-edit UX
                    autoFocus
                />
                <div className="flex items-center justify-between gap-2">
                    <span
                        className={`text-2xs ${
                            isOverLimit ? 'text-rose-600 font-semibold' : 'text-slate-400'
                        }`}
                    >
                        {t('admin.analysis.factor_note.char_count', '{{n}}/{{max}}', {
                            n: charCount,
                            max: MAX_LENGTH,
                        })}
                    </span>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={mutation.isPending || isOverLimit}
                            className="text-green-600 hover:text-green-700 disabled:opacity-50 p-1"
                            aria-label={t(
                                'admin.analysis.factor_note.save_aria',
                                'Save factor narrative'
                            )}
                        >
                            <Check className="size-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={handleCancel}
                            className="text-slate-400 hover:text-slate-600 p-1"
                            aria-label={t(
                                'admin.analysis.factor_note.cancel_aria',
                                'Cancel editing'
                            )}
                        >
                            <X className="size-3.5" />
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="mt-2">
            {currentNote ? (
                <button
                    type="button"
                    onClick={handleStart}
                    className="group w-full text-left flex items-start gap-2 p-2 -mx-2 rounded hover:bg-slate-50 transition-colors"
                    aria-label={t(
                        'admin.analysis.factor_note.edit_aria',
                        'Edit factor {{n}} narrative',
                        { n: factorIndex + 1 }
                    )}
                >
                    <NotebookText
                        className="size-3 text-slate-400 mt-0.5 shrink-0"
                        aria-hidden="true"
                    />
                    <p className="flex-1 min-w-0 text-xs text-slate-600 leading-snug">
                        {currentNote}
                    </p>
                    <Pencil
                        className="size-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        aria-hidden="true"
                    />
                </button>
            ) : (
                <button
                    type="button"
                    onClick={handleStart}
                    className="text-2xs text-slate-400 hover:text-slate-600 italic flex items-center gap-1.5 transition-colors"
                >
                    <NotebookText className="size-3" aria-hidden="true" />
                    {t(
                        'admin.analysis.factor_note.empty_hint',
                        'Add an interpretive narrative for this factor'
                    )}
                </button>
            )}
        </div>
    );
}
