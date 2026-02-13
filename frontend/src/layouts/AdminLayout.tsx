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
import { useAdminContext } from '@/hooks/useAdminContext';
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
        const match = location.pathname.match(/\/app\/[^/]+\/studies\/([^/]+)/);
        if (match) {
            if (match[1] !== activeStudyId) {
                setActiveStudy(match[1]);
            }
        } else if (activeStudyId && !location.pathname.includes('/studies/')) {
            setActiveStudy(null);
        }
    }, [location.pathname, activeStudyId, setActiveStudy]);

    // Determine the current page name
    const getCurrentPageName = () => {
        const segments = location.pathname.split('/').filter(Boolean);
        const last = segments[segments.length - 1];

        // Map common segments to i18n keys
        const mapping: Record<string, string> = {
            dashboard: t('admin.breadcrumbs.dashboard'),
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

    const { workspace: adminWorkspace, study: adminStudy } = useAdminContext();

    return (
        <SidebarProvider>
            <CommandMenu />
            <AppSidebar />

            <SidebarInset
                className={cn(
                    'min-w-0 overflow-hidden',
                    location.pathname.includes('/design') && '!m-0 !rounded-none'
                )}
            >
                <header className="flex h-16 shrink-0 items-center justify-between border-b px-4 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12 min-w-0 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 min-w-0 flex-1">
                        <SidebarTrigger className="-ml-1" />
                        <Separator orientation="vertical" className="mr-2 h-4" />
                        <Breadcrumb className="min-w-0 flex-1 overflow-hidden">
                            <BreadcrumbList className="flex-nowrap min-w-0">
                                {/* Workspace Context (if available) */}
                                {currentWorkspace && (
                                    <>
                                        <BreadcrumbItem className="hidden md:block min-w-0 max-w-[120px] lg:max-w-[180px]">
                                            <BreadcrumbLink
                                                href={`/app/${currentWorkspace.slug}/dashboard`}
                                                className="text-xs font-medium text-slate-500 hover:text-indigo-600 transition-colors truncate block"
                                                title={currentWorkspace.title}
                                            >
                                                {currentWorkspace.title}
                                            </BreadcrumbLink>
                                        </BreadcrumbItem>
                                        <BreadcrumbSeparator className="hidden md:block shrink-0" />
                                    </>
                                )}

                                {/* Study Context (if on study page) */}
                                {activeStudyId && study && (
                                    <>
                                        <BreadcrumbItem className="hidden md:block min-w-0 max-w-[160px] lg:max-w-[280px]">
                                            <BreadcrumbLink
                                                href={`/app/${currentWorkspace?.slug}/studies/${activeStudyId}`}
                                                className="text-sm font-semibold text-slate-700 hover:text-indigo-600 transition-colors truncate block"
                                                title={
                                                    study.translations?.[0]?.title || activeStudyId
                                                }
                                            >
                                                {study.translations?.[0]?.title || activeStudyId}
                                            </BreadcrumbLink>
                                        </BreadcrumbItem>
                                        <BreadcrumbSeparator className="hidden md:block shrink-0" />
                                    </>
                                )}

                                {/* Current Page */}
                                <BreadcrumbItem className="shrink-0">
                                    <BreadcrumbPage className="text-sm font-bold text-slate-900">
                                        {getCurrentPageName()}
                                    </BreadcrumbPage>
                                </BreadcrumbItem>
                            </BreadcrumbList>
                        </Breadcrumb>
                    </div>
                </header>
                <div
                    className={cn(
                        'flex flex-1 flex-col transition-all duration-300 min-w-0',
                        !location.pathname.includes('/design')
                            ? 'gap-3 sm:gap-4 p-3 sm:p-4 pt-0'
                            : 'overflow-hidden max-w-full'
                    )}
                >
                    <Outlet
                        context={{
                            workspace: adminWorkspace,
                            study: adminStudy || study, // Use context study if available, else re-fetched study
                        }}
                    />
                </div>
            </SidebarInset>
        </SidebarProvider>
    );
}
