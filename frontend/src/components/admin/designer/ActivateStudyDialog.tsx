/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Circle, Loader2, Rocket, ShieldAlert } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { ChecklistItem, LanguageReadiness } from '@/hooks/admin/useStudyDesignPage';

interface ActivateStudyDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    checklist: ChecklistItem[];
    languageReadiness: LanguageReadiness[];
    /** Triggered only when every checklist item is complete and the
     *  attestation checkbox is ticked. Should perform the actual
     *  state transition (Brouillon → Active). */
    onConfirm: () => Promise<void> | void;
    isActivating?: boolean;
}

/**
 * Confirmation dialog before flipping a study from Brouillon to Active.
 *
 * Brouillon → Active is a meaningful state change: recruitment opens,
 * public links unlock, real participants can submit. Surface the
 * existing Vérification checklist inside the dialog and require an
 * explicit attestation that the researcher has reviewed consent text
 * and retention policy before allowing the action.
 */
export function ActivateStudyDialog({
    open,
    onOpenChange,
    checklist,
    languageReadiness,
    onConfirm,
    isActivating = false,
}: ActivateStudyDialogProps) {
    const { t } = useTranslation();
    const [attested, setAttested] = useState(false);

    const requiredItems = checklist.filter((c) => c.required);
    const allRequiredComplete = requiredItems.every((c) => c.isComplete);
    const allLangsReady =
        languageReadiness.length === 0 || languageReadiness.every((l) => l.isReady);
    const canConfirm = allRequiredComplete && allLangsReady && attested && !isActivating;

    const handleConfirm = async () => {
        if (!canConfirm) return;
        await onConfirm();
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next) setAttested(false);
                onOpenChange(next);
            }}
        >
            <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-lg font-black">
                        <Rocket className="h-5 w-5 text-indigo-600" />
                        {t('admin.design.activate_dialog.title', 'Activate this study?')}
                    </DialogTitle>
                    <DialogDescription>
                        {t(
                            'admin.design.activate_dialog.description',
                            'Activating opens recruitment and unlocks public links. Real participants can begin submitting.'
                        )}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Verification checklist */}
                    <div>
                        <h3 className="text-xs font-black text-slate-500 uppercase tracking-wide mb-2">
                            {t('admin.design.activate_dialog.checklist_title', 'Pre-flight checks')}
                        </h3>
                        <ul className="space-y-1.5">
                            {checklist.map((item) => (
                                <li key={item.label} className="flex items-start gap-2 text-sm">
                                    {item.isComplete ? (
                                        <CheckCircle2
                                            className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0"
                                            aria-hidden="true"
                                        />
                                    ) : (
                                        <Circle
                                            className="h-4 w-4 text-slate-300 mt-0.5 flex-shrink-0"
                                            aria-hidden="true"
                                        />
                                    )}
                                    <span
                                        className={
                                            item.isComplete ? 'text-slate-700' : 'text-slate-500'
                                        }
                                    >
                                        {item.label}
                                        {item.required && !item.isComplete && (
                                            <span className="ml-1 text-amber-600 text-xs font-semibold">
                                                {t(
                                                    'admin.design.activate_dialog.required',
                                                    '(required)'
                                                )}
                                            </span>
                                        )}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Per-language readiness */}
                    {languageReadiness.length > 0 && (
                        <div>
                            <h3 className="text-xs font-black text-slate-500 uppercase tracking-wide mb-2">
                                {t('admin.design.activate_dialog.languages_title', 'Languages')}
                            </h3>
                            <ul className="flex flex-wrap gap-2 text-xs">
                                {languageReadiness.map((lang) => (
                                    <li
                                        key={lang.code}
                                        className={`px-2 py-1 rounded-full font-semibold border ${
                                            lang.isReady
                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                : 'bg-amber-50 text-amber-700 border-amber-200'
                                        }`}
                                    >
                                        {lang.code.toUpperCase()}
                                        {' — '}
                                        {lang.isReady
                                            ? t('admin.design.activate_dialog.lang_ready', 'Ready')
                                            : t(
                                                  'admin.design.activate_dialog.lang_incomplete',
                                                  'Incomplete'
                                              )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Attestation */}
                    <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-3 flex items-start gap-3">
                        <ShieldAlert className="h-4 w-4 text-amber-700 mt-0.5 flex-shrink-0" />
                        <div className="flex items-start gap-2">
                            <Checkbox
                                id="activate-attestation"
                                checked={attested}
                                onCheckedChange={(c) => setAttested(c === true)}
                                className="mt-0.5"
                            />
                            <Label
                                htmlFor="activate-attestation"
                                className="text-xs font-medium text-amber-900 leading-relaxed cursor-pointer"
                            >
                                {t(
                                    'admin.design.activate_dialog.attestation',
                                    'I have reviewed the consent text, the retention policy, and confirm this study is ready to receive real participants.'
                                )}
                            </Label>
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={isActivating}
                    >
                        {t('common.cancel', 'Cancel')}
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={!canConfirm}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white"
                    >
                        {isActivating ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                            <Rocket className="h-4 w-4 mr-2" />
                        )}
                        {t('admin.design.activate_dialog.confirm', 'Activate study')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
