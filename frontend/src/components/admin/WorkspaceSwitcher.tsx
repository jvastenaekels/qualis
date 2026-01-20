import * as React from 'react';
import { ChevronsUpDown, Plus, Briefcase, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

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
import { useNavigate } from 'react-router-dom';
import { useListWorkspacesApiAdminWorkspacesGet } from '@/api/generated';
import { useAuthStore } from '@/store/useAuthStore';
import type { WorkspaceWithRole } from '@/types/backend';
import { Skeleton } from '@/components/ui/skeleton';

import { useAdminStore } from '@/store/useAdminStore';

export function WorkspaceSwitcher() {
    const { isMobile } = useSidebar();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { setActiveWorkspace, setActiveStudy } = useAdminStore();

    // Fetch data using generated hook (React Query)
    const { data: workspacesData, isLoading: isWorkspacesLoading } =
        useListWorkspacesApiAdminWorkspacesGet();
    // Cast to our type including role
    const workspaces = workspacesData as WorkspaceWithRole[] | undefined;
    // Use Auth Store for global state
    const { currentWorkspace, setCurrentWorkspace, setWorkspaces } = useAuthStore();

    // Sync React Query data to Zustand Store
    React.useEffect(() => {
        if (workspaces) {
            setWorkspaces(workspaces);
        }
    }, [workspaces, setWorkspaces]);

    // Sync activeWorkspaceId if currentWorkspace is set but not in admin store
    React.useEffect(() => {
        if (currentWorkspace) {
            setActiveWorkspace(currentWorkspace.id);
        }
    }, [currentWorkspace, setActiveWorkspace]);

    const isLoading = isWorkspacesLoading;

    // Auto-select first workspace if none selected and data loaded
    React.useEffect(() => {
        if (!currentWorkspace && workspaces && workspaces.length > 0) {
            const first = workspaces[0];
            setCurrentWorkspace(first);
            setActiveWorkspace(first.id);
        }
    }, [currentWorkspace, workspaces, setCurrentWorkspace, setActiveWorkspace]);

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
                            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground transition-all duration-300 hover:bg-sidebar-accent/50"
                        >
                            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-indigo-800 text-white shadow-lg shadow-indigo-500/20">
                                <Briefcase className="size-4" />
                            </div>
                            <div className="grid flex-1 text-left text-sm leading-tight ml-1">
                                <span className="truncate font-bold tracking-tight text-slate-900">
                                    {currentWorkspace ? currentWorkspace.title : 'Select Workspace'}
                                </span>
                            </div>
                            <ChevronsUpDown className="ml-auto size-4 text-slate-400" />
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-xl border-slate-200 bg-white shadow-2xl p-2 animate-in fade-in-0 zoom-in-95"
                        align="start"
                        side={isMobile ? 'bottom' : 'right'}
                        sideOffset={4}
                    >
                        <DropdownMenuLabel className="px-2 py-1.5 text-xs font-semibold text-slate-400">
                            {t('admin.command_menu.switch_workspace', 'Workspaces')}
                        </DropdownMenuLabel>
                        <div className="space-y-1 my-1">
                            {workspaces?.map((workspace) => {
                                const isActive = workspace.id === currentWorkspace?.id;
                                return (
                                    <DropdownMenuItem
                                        key={workspace.id}
                                        onClick={() => {
                                            if (workspace.id !== currentWorkspace?.id) {
                                                setCurrentWorkspace(workspace);
                                                setActiveWorkspace(workspace.id);
                                                setActiveStudy(null);
                                            }
                                        }}
                                        className={cn(
                                            'flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer transition-all duration-200 outline-none',
                                            isActive
                                                ? 'bg-indigo-50 text-indigo-700 shadow-sm border-indigo-100'
                                                : 'hover:bg-slate-50 text-slate-600'
                                        )}
                                    >
                                        <div
                                            className={cn(
                                                'flex size-7 items-center justify-center rounded-md border shadow-sm transition-transform duration-300',
                                                isActive
                                                    ? 'bg-indigo-600 text-white border-indigo-700 scale-105'
                                                    : 'bg-white border-slate-200'
                                            )}
                                        >
                                            <Briefcase className="size-3.5" />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold">
                                                {workspace.title}
                                            </span>
                                            <span className="text-[10px] font-medium opacity-60 flex items-center gap-1">
                                                {/* Show Role Badge */}
                                                <span
                                                    className={cn(
                                                        'uppercase px-1 rounded-sm text-[8px]',
                                                        workspace.user_role === 'owner'
                                                            ? 'bg-amber-100 text-amber-700'
                                                            : workspace.user_role === 'admin'
                                                              ? 'bg-blue-100 text-blue-700'
                                                              : 'bg-slate-100'
                                                    )}
                                                >
                                                    {t(
                                                        `admin.workspace.roles.${workspace.user_role}`,
                                                        workspace.user_role
                                                    )}
                                                </span>
                                            </span>
                                        </div>
                                        {isActive && (
                                            <div className="ml-auto flex items-center gap-1 bg-indigo-100/50 px-1.5 py-0.5 rounded-full ring-1 ring-indigo-500/20">
                                                <div className="size-1 rounded-full bg-indigo-500 animate-pulse" />
                                                <span className="text-[10px] font-semibold">
                                                    {t('admin.command_menu.active', 'Active')}
                                                </span>
                                            </div>
                                        )}
                                    </DropdownMenuItem>
                                );
                            })}
                        </div>
                        <DropdownMenuSeparator className="bg-slate-100 my-1" />
                        {currentWorkspace && (
                            <DropdownMenuItem
                                className="flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer hover:bg-slate-50 text-slate-600 transition-all duration-200"
                                onClick={() => {
                                    navigate(`/admin/workspaces/${currentWorkspace.slug}/settings`);
                                }}
                            >
                                <div className="flex size-7 items-center justify-center rounded-md border border-slate-200 bg-white shadow-sm">
                                    <Settings className="size-3.5" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold">
                                        {t('admin.workspace.switcher.settings')}
                                    </span>
                                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                                        {t('admin.workspace.switcher.settings_desc')}
                                    </span>
                                </div>
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                            className="flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer hover:bg-slate-50 text-slate-600 group"
                            onClick={() => navigate('/admin/workspaces/new')}
                        >
                            <div className="flex size-7 items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50 transition-colors group-hover:border-slate-300">
                                <Plus className="size-3.5" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-bold">
                                    {t('admin.workspace.switcher.new_workspace')}
                                </span>
                                <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">
                                    {t('admin.workspace.switcher.new_workspace_desc')}
                                </span>
                            </div>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    );
}
