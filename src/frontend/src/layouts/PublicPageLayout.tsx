/*
 * Qualis - Open-source platform for conducting Q-methodology research
 * Copyright (C) 2025 Julien Vastenekels
 * Licensed under the GNU Affero General Public License v3.0 or later.
 */

import type { ReactNode } from 'react';
import { Footer } from '@/components/Footer';

interface PublicPageLayoutProps {
    children: ReactNode;
}

export const PublicPageLayout = ({ children }: PublicPageLayoutProps) => (
    <div className="min-h-screen flex flex-col">
        <main className="flex-1 flex flex-col">{children}</main>
        <Footer />
    </div>
);
