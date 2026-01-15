import { AppSidebar } from '@/components/admin/AppSidebar';
import { CommandMenu } from '@/components/admin/CommandMenu';
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { useAdminStore } from '@/store/useAdminStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useGetStudyApiAdminStudiesSlugGet } from '@/api/generated';
import { Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export default function AdminLayout() {
    const location = useLocation();
    const { activeStudyId, setActiveStudy } = useAdminStore();
    const { currentWorkspace } = useAuthStore();
    const { t } = useTranslation();

    // Fetch study data to get the actual title
    const { data: study } = useGetStudyApiAdminStudiesSlugGet(activeStudyId ?? '', {
        query: {
            enabled: !!activeStudyId,
        },
    });

    useEffect(() => {
        const match = location.pathname.match(/\/admin\/studies\/([^/]+)/);
        if (match && match[1] !== activeStudyId) {
            setActiveStudy(match[1]);
        }
    }, [location.pathname, activeStudyId, setActiveStudy]);

    // Determine the current page name
    const getCurrentPageName = () => {
        const segments = location.pathname.split('/').filter(Boolean);
        const last = segments[segments.length - 1];

        // Map common segments to i18n keys
        const mapping: Record<string, string> = {
            design: t('admin.breadcrumbs.design'),
            recruitment: t('admin.breadcrumbs.recruitment'),
            exports: t('admin.breadcrumbs.exports'),
            settings: t('admin.breadcrumbs.settings'),
            participants: t('admin.breadcrumbs.participants'),
        };

        // Special cases
        if (last === 'admin') return t('admin.breadcrumbs.dashboard');
        if (last === activeStudyId) return t('admin.breadcrumbs.study_dashboard');
        if (last === 'new') return t('admin.workspace.create.title');

        return mapping[last] || last.charAt(0).toUpperCase() + last.slice(1);
    };

    return (
        <SidebarProvider>
            <CommandMenu />
            <AppSidebar />

            <SidebarInset
                className={cn(location.pathname.includes('/design') && '!m-0 !rounded-none')}
            >
                <header className="flex h-16 shrink-0 items-center justify-between border-b px-4 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
                    <div className="flex items-center gap-2 px-4">
                        <SidebarTrigger className="-ml-1" />
                        <Separator orientation="vertical" className="mr-2 h-4" />
                        <Breadcrumb>
                            <BreadcrumbList>
                                {/* Workspace Context (if available) */}
                                {currentWorkspace && (
                                    <>
                                        <BreadcrumbItem className="hidden md:block">
                                            <BreadcrumbLink
                                                href="/admin"
                                                className="text-xs font-medium text-slate-500 hover:text-indigo-600 transition-colors"
                                            >
                                                {currentWorkspace.title}
                                            </BreadcrumbLink>
                                        </BreadcrumbItem>
                                        <BreadcrumbSeparator className="hidden md:block" />
                                    </>
                                )}

                                {/* Study Context (if on study page) */}
                                {activeStudyId && study && (
                                    <>
                                        <BreadcrumbItem className="hidden md:block">
                                            <BreadcrumbLink
                                                href={`/admin/studies/${activeStudyId}`}
                                                className="text-sm font-semibold text-slate-700 hover:text-indigo-600 transition-colors"
                                            >
                                                {study.translations?.[0]?.title || activeStudyId}
                                            </BreadcrumbLink>
                                        </BreadcrumbItem>
                                        <BreadcrumbSeparator className="hidden md:block" />
                                    </>
                                )}

                                {/* Current Page */}
                                <BreadcrumbItem>
                                    <BreadcrumbPage className="text-sm font-bold text-slate-900">
                                        {getCurrentPageName()}
                                    </BreadcrumbPage>
                                </BreadcrumbItem>
                            </BreadcrumbList>
                        </Breadcrumb>
                    </div>
                    <div className="flex items-center gap-4 px-4">
                        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 shadow-sm animate-pulse-slow">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                            </span>
                            <span className="text-[10px] font-bold uppercase tracking-wider">
                                {t('admin.layout.beta')}
                            </span>
                        </div>
                    </div>
                </header>
                <div
                    className={cn(
                        'flex flex-1 flex-col transition-all duration-300 min-w-0',
                        !location.pathname.includes('/design')
                            ? 'gap-4 p-4 pt-0'
                            : 'overflow-hidden'
                    )}
                >
                    <Outlet />
                </div>
            </SidebarInset>
        </SidebarProvider>
    );
}
