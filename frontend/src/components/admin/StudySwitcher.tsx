import * as React from 'react';
import { ChevronsUpDown, Plus, LayoutGrid } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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
import { useListStudiesApiAdminStudiesGet } from '@/api/generated';
import { useAdminStore } from '@/store/useAdminStore';
import { useAuthStore } from '@/store/useAuthStore';
import { Skeleton } from '@/components/ui/skeleton';
import { CreateStudyDialog } from './CreateStudyDialog';

export function StudySwitcher() {
    const { isMobile } = useSidebar();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { activeStudyId, setActiveStudy, activeWorkspaceId } = useAdminStore();
    const { currentWorkspace } = useAuthStore();
    const { data: studies, isLoading } = useListStudiesApiAdminStudiesGet({
        query: { enabled: !!activeWorkspaceId },
    });
    const [showCreateDialog, setShowCreateDialog] = React.useState(false);

    const filteredStudies = studies?.filter((s) => s.workspace_id === activeWorkspaceId);
    const activeStudy = filteredStudies?.find((s) => s.slug === activeStudyId);

    const handleStudySelect = (studySlug: string) => {
        if (currentWorkspace?.slug) {
            navigate(`/app/${currentWorkspace.slug}/studies/${studySlug}`);
        } else {
            setActiveStudy(studySlug);
        }
    };

    const _getStatusColor = (state: string) => {
        switch (state) {
            case 'active':
                return 'bg-emerald-500';
            case 'draft':
                return 'bg-slate-400';
            case 'closed':
                return 'bg-red-500';
            case 'paused':
                return 'bg-amber-500';
            default:
                return 'bg-slate-300';
        }
    };

    const getAvatarColor = (slug: string) => {
        const colors = [
            'from-indigo-500 to-purple-500',
            'from-emerald-500 to-teal-500',
            'from-blue-500 to-indigo-500',
            'from-rose-500 to-pink-500',
            'from-amber-500 to-orange-500',
        ];
        const hash = slug.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        return colors[hash % colors.length];
    };

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
                                data-testid="study-switcher"
                                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground transition-all duration-300 hover:bg-sidebar-accent/50"
                            >
                                <div
                                    className={cn(
                                        'flex aspect-square size-8 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-lg shadow-indigo-500/10 font-black tracking-tighter text-xs',
                                        activeStudy
                                            ? getAvatarColor(activeStudy.slug)
                                            : 'from-slate-600 to-slate-800'
                                    )}
                                >
                                    {activeStudy
                                        ? activeStudy.slug.substring(0, 1).toUpperCase()
                                        : 'OQ'}
                                </div>
                                <div className="grid flex-1 text-left text-sm leading-tight ml-1">
                                    <span className="truncate font-bold tracking-tight text-slate-900 leading-none">
                                        {activeStudy
                                            ? activeStudy.translations?.[0]?.title ||
                                              activeStudy.slug
                                            : t('admin.sidebar.select_study')}
                                    </span>
                                </div>
                                <ChevronsUpDown className="ml-auto size-4 text-slate-400" />
                            </SidebarMenuButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            className="w-[--radix-dropdown-menu-trigger-width] min-w-64 rounded-xl border-slate-200 bg-white backdrop-blur-xl shadow-2xl p-2 animate-in fade-in-0 zoom-in-95"
                            align="start"
                            side={isMobile ? 'bottom' : 'right'}
                            sideOffset={4}
                        >
                            <DropdownMenuLabel className="px-2 py-1.5 text-xs font-semibold text-slate-400">
                                {t('admin.sidebar.studies')}
                            </DropdownMenuLabel>
                            <div className="space-y-1 my-1">
                                {filteredStudies?.map((study) => {
                                    const isActive = study.slug === activeStudyId;
                                    return (
                                        <DropdownMenuItem
                                            key={study.id}
                                            onClick={() => handleStudySelect(study.slug)}
                                            className={cn(
                                                'flex items-center gap-3 px-2 py-2.5 rounded-lg cursor-pointer transition-all duration-200 outline-none',
                                                isActive
                                                    ? 'bg-indigo-50 text-indigo-700 shadow-sm border-indigo-100'
                                                    : 'hover:bg-slate-50 text-slate-600'
                                            )}
                                        >
                                            <div
                                                className={cn(
                                                    'flex size-8 items-center justify-center rounded-md bg-gradient-to-br text-white font-black tracking-tighter text-xs shadow-sm transition-transform duration-300',
                                                    getAvatarColor(study.slug),
                                                    isActive && 'scale-105'
                                                )}
                                            >
                                                {study.slug.substring(0, 1).toUpperCase()}
                                            </div>
                                            <div className="flex flex-col flex-1 min-w-0">
                                                <span className="text-sm font-bold truncate">
                                                    {study.translations?.[0]?.title || study.slug}
                                                </span>
                                            </div>
                                        </DropdownMenuItem>
                                    );
                                })}
                            </div>
                            <DropdownMenuSeparator className="bg-slate-100 my-1" />
                            <DropdownMenuItem
                                className="flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer hover:bg-slate-50 text-slate-600 group"
                                onClick={() => {
                                    if (currentWorkspace?.slug) {
                                        navigate(`/app/${currentWorkspace.slug}/dashboard`);
                                    } else {
                                        navigate('/admin?dashboard=true');
                                    }
                                }}
                            >
                                <div className="flex size-8 items-center justify-center rounded-md border border-slate-200 bg-slate-50 transition-colors group-hover:border-slate-300 group-hover:bg-white shadow-sm">
                                    <LayoutGrid className="size-4" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold">
                                        {t('admin.sidebar.view_all_studies', 'All Studies')}
                                    </span>
                                </div>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                className="flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer hover:bg-slate-50 text-slate-600 group"
                                onClick={() => setShowCreateDialog(true)}
                            >
                                <div className="flex size-8 items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50 transition-colors group-hover:border-slate-300 group-hover:bg-white shadow-sm">
                                    <Plus className="size-4" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold">
                                        {t('admin.sidebar.add_study')}
                                    </span>
                                    <span className="text-xs font-semibold text-slate-400">
                                        {t('admin.sidebar.create_project')}
                                    </span>
                                </div>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </SidebarMenuItem>
            </SidebarMenu>

            <CreateStudyDialog
                open={showCreateDialog}
                onOpenChange={setShowCreateDialog}
                workspaceSlug={currentWorkspace?.slug || ''}
            />
        </>
    );
}
