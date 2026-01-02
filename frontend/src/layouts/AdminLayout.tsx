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
import { Outlet, useLocation } from 'react-router-dom';

export default function AdminLayout() {
    const location = useLocation();
    const { activeStudyId } = useAdminStore();

    // Simple breadcrumb logic
    const pathSegments = location.pathname.split('/').filter(Boolean);
    // pathSegments: ['admin', 'studies', 'slug', 'design']

    // We want: Admin > [Study Slug] > [Page Name]

    return (
        <SidebarProvider>
            <CommandMenu />
            <AppSidebar />

            <SidebarInset>
                <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
                    <div className="flex items-center gap-2 px-4">
                        <SidebarTrigger className="-ml-1" />
                        <Separator orientation="vertical" className="mr-2 h-4" />
                        <Breadcrumb>
                            <BreadcrumbList>
                                <BreadcrumbItem className="hidden md:block">
                                    <BreadcrumbLink href="/admin">Admin</BreadcrumbLink>
                                </BreadcrumbItem>
                                <BreadcrumbSeparator className="hidden md:block" />
                                {activeStudyId && (
                                    <>
                                        <BreadcrumbItem>
                                            <BreadcrumbLink
                                                href={`/admin/studies/${activeStudyId}`}
                                            >
                                                {activeStudyId}
                                            </BreadcrumbLink>
                                        </BreadcrumbItem>
                                        <BreadcrumbSeparator className="hidden md:block" />
                                    </>
                                )}
                                <BreadcrumbItem>
                                    <BreadcrumbPage>
                                        {pathSegments.length > 2
                                            ? pathSegments.includes('design')
                                                ? 'Designer'
                                                : 'Overview'
                                            : 'Dashboard'}
                                    </BreadcrumbPage>
                                </BreadcrumbItem>
                            </BreadcrumbList>
                        </Breadcrumb>
                    </div>
                </header>
                <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
                    <Outlet />
                </div>
            </SidebarInset>
        </SidebarProvider>
    );
}
