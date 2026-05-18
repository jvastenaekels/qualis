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
import { usePlatformConfigStore } from '@/store/usePlatformConfigStore';
import { Outlet, useLocation } from 'react-router-dom';
import { useAdminContext } from '@/hooks/useAdminContext';
import { useGetParticipantApiAdminStudiesParticipantsParticipantIdGet } from '@/api/generated';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Footer } from '@/components/Footer';
import { resolveBreadcrumbLabel } from './AdminLayout.helpers';

export default function AdminLayout() {
    const location = useLocation();
    const { activeStudyId, setActiveStudy } = useAdminStore();
    const { currentProject } = useAuthStore();
    const isEmailManual = usePlatformConfigStore((s) => s.isEmailManual());
    const { project: adminProject, study: adminStudy } = useAdminContext();
    const { t } = useTranslation();

    // Resolve the participant code (session_token[:8]) for the breadcrumb
    // when on /participants/:participantId. The fetch is gated to that route
    // and shares the React Query cache with ParticipantDetailsPage, so the
    // page render and the breadcrumb dedupe to a single network call.
    const participantMatch = location.pathname.match(/\/participants\/(\d+)(?:\/|$)/);
    const participantIdNum = participantMatch ? Number(participantMatch[1]) : 0;
    const { data: breadcrumbParticipant } =
        useGetParticipantApiAdminStudiesParticipantsParticipantIdGet(participantIdNum, {
            query: { enabled: participantIdNum > 0 },
        });

    useEffect(() => {
        const match = location.pathname.match(/\/app\/[^/]+\/studies\/([^/]+)/);
        const matchedSlug = match?.[1] ?? null;
        if (matchedSlug !== null) {
            if (matchedSlug !== activeStudyId) {
                setActiveStudy(matchedSlug);
            }
        } else if (activeStudyId && !location.pathname.includes('/studies/')) {
            setActiveStudy(null);
        }
    }, [location.pathname, activeStudyId, setActiveStudy]);

    // Resolve the breadcrumb leaf label (extracted helper for testability).
    const currentPageName = resolveBreadcrumbLabel(
        location.pathname,
        activeStudyId,
        breadcrumbParticipant,
        t
    );

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
                {isEmailManual && (
                    <div
                        role="status"
                        className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-xs font-medium text-amber-800"
                    >
                        {t(
                            'admin.smtp_banner.manual',
                            'Email delivery not configured — recovery links are generated manually from Admin → Users.'
                        )}
                    </div>
                )}
                <header className="flex h-16 shrink-0 items-center justify-between border-b px-4 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12 min-w-0 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 min-w-0 flex-1">
                        <SidebarTrigger className="-ml-1" />
                        <Separator orientation="vertical" className="mr-2 h-4" />
                        <Breadcrumb className="min-w-0 flex-1 overflow-hidden">
                            <BreadcrumbList className="flex-nowrap min-w-0">
                                {/* Project Context (if available) */}
                                {currentProject && (
                                    <>
                                        <BreadcrumbItem className="hidden md:block min-w-0 max-w-[120px] lg:max-w-[180px]">
                                            <BreadcrumbLink
                                                href={`/app/${currentProject.slug}/dashboard`}
                                                className="text-xs font-medium text-slate-500 hover:text-indigo-600 transition-colors truncate block"
                                                title={currentProject.title}
                                            >
                                                {currentProject.title}
                                            </BreadcrumbLink>
                                        </BreadcrumbItem>
                                        <BreadcrumbSeparator className="hidden md:block shrink-0" />
                                    </>
                                )}

                                {/* Study Context (if on study page) */}
                                {activeStudyId && adminStudy && (
                                    <>
                                        <BreadcrumbItem className="hidden md:block min-w-0 max-w-[160px] lg:max-w-[280px]">
                                            <BreadcrumbLink
                                                href={`/app/${currentProject?.slug}/studies/${activeStudyId}`}
                                                className="text-sm font-semibold text-slate-700 hover:text-indigo-600 transition-colors truncate block"
                                                title={
                                                    adminStudy.translations?.[0]?.title ||
                                                    activeStudyId
                                                }
                                            >
                                                {adminStudy.translations?.[0]?.title ||
                                                    activeStudyId}
                                            </BreadcrumbLink>
                                        </BreadcrumbItem>
                                        <BreadcrumbSeparator className="hidden md:block shrink-0" />
                                    </>
                                )}

                                {/* Current Page */}
                                <BreadcrumbItem className="shrink-0">
                                    <BreadcrumbPage className="text-sm font-bold text-slate-900">
                                        {currentPageName}
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
                            project: adminProject,
                            study: adminStudy,
                        }}
                    />
                </div>
                <Footer />
            </SidebarInset>
        </SidebarProvider>
    );
}
