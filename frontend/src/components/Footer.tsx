/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import { useTranslation } from 'react-i18next';

const REPO_URL = 'https://github.com/jvastenaekels/qualis';
const LICENSE_URL = 'https://github.com/jvastenaekels/qualis/blob/main/LICENSE';

export const Footer = () => {
    const { t } = useTranslation();

    return (
        <footer className="shrink-0 border-t border-slate-100 bg-white/70 backdrop-blur">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 py-3 text-center text-xs text-slate-400">
                <a
                    href={REPO_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 hover:text-slate-600 transition-colors"
                >
                    <img src="/qualis-logo.svg" alt="" className="h-4 w-4" />
                    <span>{t('footer.powered_by', 'Powered by Qualis')}</span>
                </a>
                <span aria-hidden="true">·</span>
                <a
                    href={LICENSE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-slate-600 transition-colors"
                >
                    {t('footer.license', 'AGPLv3')}
                </a>
            </div>
        </footer>
    );
};
