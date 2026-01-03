import * as React from 'react';
import { ChevronsUpDown, Plus, Briefcase } from 'lucide-react';

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
import { useListWorkspacesApiAdminWorkspacesGet } from '@/api/generated';
import { useAdminStore } from '@/store/useAdminStore';
import { Skeleton } from '@/components/ui/skeleton';

export function WorkspaceSwitcher() {
    const { isMobile } = useSidebar();
    const { data: workspaces, isLoading } = useListWorkspacesApiAdminWorkspacesGet();
    const { activeWorkspaceId, setActiveWorkspace } = useAdminStore();

    const activeWorkspace = workspaces?.find((w) => w.id === activeWorkspaceId);

    // Auto-select first workspace if none selected and data loaded
    React.useEffect(() => {
        if (!activeWorkspaceId && workspaces && workspaces.length > 0) {
            setActiveWorkspace(workspaces[0].id);
        }
    }, [activeWorkspaceId, workspaces, setActiveWorkspace]);

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
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton
                            size="lg"
                            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                        >
                            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-black text-white dark:bg-white dark:text-black">
                                <Briefcase className="size-4" />
                            </div>
                            <div className="grid flex-1 text-left text-sm leading-tight">
                                <span className="truncate font-semibold">
                                    {activeWorkspace ? activeWorkspace.title : 'Select Workspace'}
                                </span>
                                <span className="truncate text-xs">
                                    {activeWorkspace ? 'Free Plan' : 'No workspace'}
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
                            Workspaces
                        </DropdownMenuLabel>
                        {workspaces?.map((workspace) => (
                            <DropdownMenuItem
                                key={workspace.id}
                                onClick={() => setActiveWorkspace(workspace.id)}
                                className="gap-2 p-2"
                            >
                                <div className="flex size-6 items-center justify-center rounded-sm border">
                                    <Briefcase className="size-4" />
                                </div>
                                {workspace.title}
                                {workspace.id === activeWorkspaceId && (
                                    <div className="ml-auto text-xs">Active</div>
                                )}
                            </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="gap-2 p-2" disabled>
                            <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                                <Plus className="size-4" />
                            </div>
                            <div className="font-medium text-muted-foreground">
                                Create Workspace
                            </div>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    );
}
