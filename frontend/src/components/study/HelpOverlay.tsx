/*
 * Open-Q - Open-source platform for conducting Q-methodology research
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

    // Map currentStep to ID-based keys (welcome=1, consent=ignored, presort=2, rough=3, fine=4, review/post=5)
    // We use semantic keys in study.help.step_{id}
    const stepIdMap: Record<number, string> = {
        1: 'welcome',
        2: 'presort',
        3: 'rough',
        4: 'fine',
        5: 'post',
    };

    const stepKey = stepIdMap[currentStep] || 'rough';
    const customHelp = config?.step_help?.[currentStep.toString()];

    const what = customHelp?.what || t(`study.help.step_${stepKey}.what`);
    const why = customHelp?.why || t(`study.help.step_${stepKey}.why`);
    const stepTitle = t(`study.steps.${stepKey}`);

    return (
        <Dialog>
            <DialogTrigger asChild>
                <button
                    type="button"
                    className="fixed top-20 left-6 z-40 size-10 rounded-full bg-white border border-slate-300 shadow-md flex items-center justify-center text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition-colors duration-200"
                    aria-label={t('study.help.trigger')}
                >
                    <HelpCircle className="size-4" />
                </button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl bg-white border-slate-200 shadow-xl rounded-lg p-0 overflow-hidden">
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
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                {t('study.help.what')}
                            </h3>
                        </div>
                        <p className="text-sm text-slate-700 leading-relaxed">{what}</p>
                    </div>

                    {/* Why it matters */}
                    <div className="space-y-2.5">
                        <div className="flex items-center gap-2">
                            <Lightbulb className="size-4 text-slate-500" />
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
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
