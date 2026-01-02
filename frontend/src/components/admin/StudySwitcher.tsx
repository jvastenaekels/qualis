import * as React from 'react';
import { ChevronsUpDown, Plus } from 'lucide-react';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    useSidebar,
} from '@/components/ui/sidebar';
import { useListStudiesApiAdminStudiesGet } from '@/api/generated';
import { useAdminStore } from '@/store/useAdminStore';
import { Skeleton } from '@/components/ui/skeleton';
import { CreateStudyDialog } from './CreateStudyDialog';

export function StudySwitcher() {
    const { isMobile } = useSidebar();
    const { data: studies, isLoading } = useListStudiesApiAdminStudiesGet();
    const { activeStudyId, setActiveStudy, activeWorkspaceId } = useAdminStore();
    const [showCreateDialog, setShowCreateDialog] = React.useState(false);

    const filteredStudies = studies?.filter((s) => s.workspace_id === activeWorkspaceId);
    const activeStudy = filteredStudies?.find((s) => s.slug === activeStudyId);

    if (isLoading) {
        return (
            <SidebarMenu>
                <SidebarMenuItem>
                    <Skeleton className="h-12 w-full" />
                </SidebarMenuItem>
            </SidebarMenu>
        );
    }

    return (
        <>
            <SidebarMenu>
                <SidebarMenuItem>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <SidebarMenuButton
                                size="lg"
                                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                            >
                                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                                    {activeStudy
                                        ? activeStudy.slug.substring(0, 2).toUpperCase()
                                        : 'OQ'}
                                </div>
                                <div className="grid flex-1 text-left text-sm leading-tight">
                                    <span className="truncate font-semibold">
                                        {activeStudy ? activeStudy.slug : 'Select Study'}
                                    </span>
                                    <span className="truncate text-xs">
                                        {activeStudy ? activeStudy.state : 'No study selected'}
                                    </span>
                                </div>
                                <ChevronsUpDown className="ml-auto" />
                            </SidebarMenuButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                            align="start"
                            side={isMobile ? 'bottom' : 'right'}
                            sideOffset={4}
                        >
                            <DropdownMenuLabel className="text-xs text-muted-foreground">
                                Studies
                            </DropdownMenuLabel>
                            {filteredStudies?.map((study) => (
                                <DropdownMenuItem
                                    key={study.id}
                                    onClick={() => setActiveStudy(study.slug)}
                                    className="gap-2 p-2"
                                >
                                    <div className="flex size-6 items-center justify-center rounded-sm border">
                                        {study.slug.substring(0, 1).toUpperCase()}
                                    </div>
                                    {study.slug}
                                    {study.slug === activeStudyId && (
                                        <div className="ml-auto text-xs">Active</div>
                                    )}
                                </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                className="gap-2 p-2"
                                onClick={() => setShowCreateDialog(true)}
                            >
                                <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                                    <Plus className="size-4" />
                                </div>
                                <div className="font-medium text-muted-foreground">Add Study</div>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </SidebarMenuItem>
            </SidebarMenu>

            <CreateStudyDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} />
        </>
    );
}
