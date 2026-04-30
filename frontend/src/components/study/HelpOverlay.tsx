/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { HelpCircle, Info, Lightbulb } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogClose,
} from '@/components/ui/dialog';
import { useConfigStore } from '@/store/useConfigStore';
import { useSessionStore } from '@/store/useSessionStore';
import { mapPersistedStepToKey } from '@/utils/studySteps';

import { useLocation } from 'react-router-dom';

const HelpOverlay: React.FC = () => {
    const { t } = useTranslation();
    const { config } = useConfigStore();
    const { pathname } = useLocation();
    const currentStep = useSessionStore((state) => state.currentStep);

    // Hide on welcome and consent pages
    if (pathname.endsWith('/welcome') || pathname.endsWith('/consent')) {
        return null;
    }

    // Map currentStep to a semantic step key used in study.help.step_{key}.
    // mapPersistedStepToKey respects the study's rough_sort_enabled flag —
    // a stale currentStep=3 on a deck-mode study falls back to 'fine'.
    const roughEnabled = config?.rough_sort_enabled !== false;
    const stepKey =
        mapPersistedStepToKey(currentStep, { rough_sort_enabled: roughEnabled }) ?? 'rough';
    const customHelp = config?.step_help?.[stepKey];

    const what = customHelp?.what || t(`study.help.step_${stepKey}.what`);
    const why = customHelp?.why || t(`study.help.step_${stepKey}.why`);
    const stepTitle = t(`study.steps.${stepKey}`);

    return (
        <Dialog>
            <DialogTrigger asChild>
                <button
                    type="button"
                    className="p-3 min-w-[44px] min-h-[44px] rounded-full hover:bg-slate-100 text-slate-600 transition-colors touch-manipulation flex items-center justify-center"
                    aria-label={t('study.help.trigger')}
                >
                    <HelpCircle className="size-5" />
                </button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl bg-white border-slate-200 shadow-xl p-0 overflow-hidden">
                <DialogHeader className="p-6 pb-4 border-b border-slate-100">
                    <div className="space-y-2">
                        <DialogTitle className="text-xl font-semibold text-slate-900 flex items-center gap-2.5">
                            <HelpCircle className="size-5 text-slate-600" />
                            {t('study.help.title')}
                        </DialogTitle>
                        <p className="text-sm font-medium text-slate-500">{stepTitle}</p>
                    </div>
                </DialogHeader>

                <div className="p-6 space-y-6">
                    {/* What we ask */}
                    <div className="space-y-2.5">
                        <div className="flex items-center gap-2">
                            <Info className="size-4 text-slate-500" />
                            <h3 className="text-xs font-semibold text-slate-500">
                                {t('study.help.what')}
                            </h3>
                        </div>
                        <p className="text-sm text-slate-700 leading-relaxed">{what}</p>
                    </div>

                    {/* Why it matters */}
                    <div className="space-y-2.5">
                        <div className="flex items-center gap-2">
                            <Lightbulb className="size-4 text-slate-500" />
                            <h3 className="text-xs font-semibold text-slate-500">
                                {t('study.help.why')}
                            </h3>
                        </div>
                        <p className="text-sm text-slate-600 leading-relaxed">{why}</p>
                    </div>
                </div>

                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                    <DialogClose asChild>
                        <button
                            type="button"
                            className="px-4 py-2 bg-white border border-slate-200 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                        >
                            {t('common.close')}
                        </button>
                    </DialogClose>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default React.memo(HelpOverlay);
