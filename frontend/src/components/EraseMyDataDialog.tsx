/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { ShieldAlert, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useParticipantSelfErasePersonalDataApiStudySlugPersonalDataDelete } from '@/api/generated';

interface Props {
    /** Study slug — the participant is acting under this study's scope. */
    slug: string;
    /** Session token from the participant's session store; required to authorise erasure. */
    sessionToken: string | null;
}

/**
 * GDPR Art. 17 self-erasure trigger for participants.
 *
 * Renders a discreet "Right to erasure" link/button. On click, opens a
 * confirmation dialog explaining what will be erased and what will be
 * preserved (Q-sort rankings as anonymous research data). On confirm,
 * calls the backend self-erasure endpoint with the session token.
 *
 * Disabled when no session token is available (e.g. localStorage cleared).
 */
export function EraseMyDataDialog({ slug, sessionToken }: Props) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [erased, setErased] = useState(false);

    const mutation = useParticipantSelfErasePersonalDataApiStudySlugPersonalDataDelete({
        mutation: {
            onSuccess: () => {
                setErased(true);
                setOpen(false);
                toast.success(
                    t(
                        'erasure.success',
                        'Your personal data has been removed. Your anonymous Q-sort rankings remain in the study.'
                    )
                );
            },
            onError: () => {
                toast.error(
                    t(
                        'erasure.error',
                        'We could not process your request. Please try again or contact the researcher.'
                    )
                );
            },
        },
    });

    if (!sessionToken) return null;

    if (erased) {
        return (
            <p className="text-sm text-slate-500 italic mt-6">
                {t(
                    'erasure.already_erased',
                    'Your personal data has been removed for this session.'
                )}
            </p>
        );
    }

    return (
        <div className="mt-10 pt-6 border-t border-slate-200 text-left">
            <h2 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                <ShieldAlert size={16} className="text-slate-500" />
                {t('erasure.section_title', 'Your right to erasure (GDPR Art. 17)')}
            </h2>
            <p className="text-sm text-slate-500 leading-relaxed mb-3">
                {t(
                    'erasure.section_intro',
                    'You can request the removal of your personal data at any time. Your anonymous statement rankings will be kept as research data; everything that could identify you will be removed.'
                )}
            </p>
            <AlertDialog open={open} onOpenChange={setOpen}>
                <AlertDialogTrigger asChild>
                    <button
                        type="button"
                        className="inline-flex items-center gap-2 text-sm font-medium text-rose-700 hover:text-rose-800 underline-offset-4 hover:underline transition-colors"
                    >
                        <Trash2 size={14} />
                        {t('erasure.button', 'Request my data deletion')}
                    </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t('erasure.confirm_title', 'Erase your personal data?')}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="space-y-2 text-left">
                            <span className="block">
                                {t(
                                    'erasure.confirm_what_erased',
                                    'The following will be permanently removed: any IP address logged with your session, your browser identifier, your written answers (pre- and post-sort), and any audio recording you provided.'
                                )}
                            </span>
                            <span className="block">
                                {t(
                                    'erasure.confirm_what_kept',
                                    'Your statement rankings will be preserved as anonymous research data — they no longer link to you.'
                                )}
                            </span>
                            <span className="block font-medium text-slate-700">
                                {t(
                                    'erasure.confirm_irreversible',
                                    'This action is immediate and cannot be undone.'
                                )}
                            </span>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={mutation.isPending}>
                            {t('common.cancel', 'Cancel')}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            disabled={mutation.isPending}
                            onClick={() =>
                                mutation.mutate({
                                    slug,
                                    params: { session_token: sessionToken },
                                })
                            }
                            className="bg-rose-700 hover:bg-rose-800"
                        >
                            {mutation.isPending
                                ? t('erasure.confirm_in_progress', 'Erasing…')
                                : t('erasure.confirm_action', 'Yes, erase my data')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
