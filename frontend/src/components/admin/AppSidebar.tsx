import { useEffect } from 'react';
import {
    BadgeCheck,
    ChartColumnStacked,
    ChevronsUpDown,
    Globe,
    LayoutDashboard,
    Library,
    Link2,
    LogOut,
    PencilRuler,
    Search,
    Settings,
    Download,
    Users,
    Settings2,
    Wand2,
    Table,
    ShieldCheck,
} from 'lucide-react';
import { StudySwitcher } from './StudySwitcher';
import { ProjectSwitcher } from './ProjectSwitcher';
import { FocusModeHeader } from './FocusModeHeader';
import { UserAvatar } from './UserAvatar';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarGroup,
    SidebarGroupLabel,
} from '@/components/ui/sidebar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAdminStore } from '@/store/useAdminStore';
import { useAuthStore } from '@/store/useAuthStore';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { usePermission } from '@/hooks/usePermission';
import { useSidebar } from '@/components/ui/sidebar';

function NavLanguage() {
    const { i18n, t } = useTranslation();
    const currentLang = i18n.language;

    const languages = [
        { code: 'en', label: 'EN', flag: '🇬🇧', name: 'English' },
        { code: 'fr', label: 'FR', flag: '🇫🇷', name: 'Français' },
        { code: 'fi', label: 'FI', flag: '🇫🇮', name: 'Suomi' },
    ];

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton size="sm" className="text-muted-foreground">
                            <Globe className="size-4" />
                            <span>
                                {languages.find((l) => l.code === currentLang)?.label ||
                                    t('layout.language')}
                            </span>
                            <ChevronsUpDown className="ml-auto size-3" />
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40 rounded-lg">
                        <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground/70">
                            {t('layout.change_lang_title')}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {languages.map((lang) => (
                            <DropdownMenuItem
                                key={lang.code}
                                onSelect={() => i18n.changeLanguage(lang.code)}
                                className={cn(
                                    'flex items-center gap-2 cursor-pointer',
                                    currentLang === lang.code && 'bg-accent text-accent-foreground'
                                )}
                            >
                                <span className="text-sm" aria-hidden="true">
                                    {lang.flag}
                                </span>
                                <span className="text-sm">{lang.label}</span>
                                <span className="sr-only">{lang.name}</span>
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    );
}

// biome-ignore lint/suspicious/noExplicitAny: mock user
function NavUser({ user, projectSlug }: { user: any; projectSlug?: string }) {
    const logout = useAuthStore((state) => state.logout);
    const navigate = useNavigate();
    const { t } = useTranslation();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton
                            size="lg"
                            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                        >
                            <UserAvatar name={user?.full_name} email={user?.email} />
                            <div className="grid flex-1 text-left text-sm leading-tight">
                                <span className="truncate font-semibold">
                                    {user?.full_name || t('admin.layout.admin_user')}
                                </span>
                                <span className="truncate text-xs">{user?.email}</span>
                            </div>
                            <ChevronsUpDown className="ml-auto size-4" />
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                        side="bottom"
                        align="end"
                        sideOffset={4}
                    >
                        <DropdownMenuLabel className="p-0 font-normal">
                            <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                                <UserAvatar name={user?.full_name} email={user?.email} />
                                <div className="grid flex-1 text-left text-sm leading-tight">
                                    <span className="truncate font-semibold">
                                        {user?.full_name || t('admin.layout.admin_user')}
                                    </span>
                                    <span className="truncate text-xs">{user?.email}</span>
                                </div>
                            </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuGroup>
                            <DropdownMenuItem
                                onSelect={() =>
                                    navigate(projectSlug ? `/app/${projectSlug}/profile` : '/hub')
                                }
                            >
                                <BadgeCheck className="mr-2 h-4 w-4" />
                                {t('admin.layout.profile', 'Profile')}
                            </DropdownMenuItem>
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={handleLogout}>
                            <LogOut className="mr-2 h-4 w-4" />
                            {t('admin.layout.logout')}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    );
}

import { useListStudiesApiAdminStudiesGet } from '@/api/generated';

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
    const { activeStudyId, activeProjectId } = useAdminStore();
    const { currentProject } = useAuthStore();
    const { user } = useAuth();
    const location = useLocation();
    const { t } = useTranslation();
    const params = useParams<{ projectSlug?: string; studySlug?: string }>();
    const { setOpenMobile } = useSidebar();

    // Close mobile sidebar on route change
    // biome-ignore lint/correctness/useExhaustiveDependencies: intentional trigger on pathname
    useEffect(() => {
        setOpenMobile(false);
    }, [location.pathname]);

    // Detect if we're in the new Project-First architecture
    const isNewArchitecture = location.pathname.startsWith('/app/');
    const isFocusMode = isNewArchitecture && !!params.studySlug;
    const projectSlug = params.projectSlug || currentProject?.slug;

    const { data: studiesData } = useListStudiesApiAdminStudiesGet(undefined, {
        query: {
            enabled: !!currentProject?.id,
        },
    });
    const studies = studiesData?.items;

    const { can } = usePermission();

    // For legacy routes
    const isValidStudy =
        activeStudyId &&
        studies?.some((s) => s.slug === activeStudyId && s.project_id === activeProjectId);

    // Project-level navigation (always visible in new architecture)
    const projectNav = projectSlug
        ? [
              {
                  title: t('admin.sidebar.dashboard', 'Dashboard'),
                  url: `/app/${projectSlug}/dashboard`,
                  icon: LayoutDashboard,
                  show: true,
              },
              {
                  title: t('admin.sidebar.concourse', 'Concourse'),
                  url: `/app/${projectSlug}/concourses`,
                  icon: Library,
                  show: true,
              },
              {
                  title: t('admin.sidebar.project_settings', 'Project settings'),
                  url: `/app/${projectSlug}/settings`,
                  icon: Settings2,
                  show: can('project:settings'),
              },
          ].filter((item) => item.show)
        : [];

    // Study-level navigation (Focus Mode only)
    const studyNav =
        isFocusMode && params.studySlug
            ? [
                  {
                      title: t('admin.sidebar.dashboard'),
                      url: `/app/${projectSlug}/studies/${params.studySlug}`,
                      icon: LayoutDashboard,
                      show: true,
                  },
                  {
                      title: t('admin.sidebar.design'),
                      url: `/app/${projectSlug}/studies/${params.studySlug}/design`,
                      icon: PencilRuler,
                      show: can('study:edit_design'),
                  },
                  {
                      title: t('admin.sidebar.recruit'),
                      url: `/app/${projectSlug}/studies/${params.studySlug}/recruitment`,
                      icon: Link2,
                      show: can('study:launch_recruitment'),
                  },
                  {
                      title: t('admin.sidebar.data'),
                      url: `/app/${projectSlug}/studies/${params.studySlug}/data`,
                      icon: Download,
                      show: can('study:view_data'),
                  },
                  {
                      title: t('admin.sidebar.lifecycle', 'Data lifecycle'),
                      url: `/app/${projectSlug}/studies/${params.studySlug}/lifecycle`,
                      icon: ShieldCheck,
                      show: can('study:edit_settings'),
                  },
                  {
                      title: t('admin.sidebar.analysis', 'Analysis'),
                      url: `/app/${projectSlug}/studies/${params.studySlug}/analysis`,
                      icon: ChartColumnStacked,
                      show: can('study:edit_design'),
                  },
                  {
                      title: t('admin.sidebar.settings', 'Study settings'),
                      url: `/app/${projectSlug}/studies/${params.studySlug}/settings`,
                      icon: Settings,
                      show: can('study:edit_settings'),
                  },
              ].filter((item) => item.show)
            : [];

    const activeStudy = studies?.find(
        (s) => s.slug === activeStudyId && s.project_id === activeProjectId
    );

    // Legacy navigation for backward compatibility
    const navMain = isValidStudy
        ? [
              {
                  title: t('layout.navigation'),
                  url: '#',
                  isActive: true,
                  items: [
                      {
                          title: t('admin.sidebar.overview', 'Overview'),
                          url:
                              projectSlug && activeStudyId
                                  ? `/app/${projectSlug}/studies/${activeStudyId}`
                                  : activeStudy?.project?.slug && activeStudyId
                                    ? `/app/${activeStudy.project.slug}/studies/${activeStudyId}`
                                    : `/admin/studies/${activeStudyId}`,
                          icon: LayoutDashboard,
                      },
                      {
                          title: t('admin.sidebar.design', 'Design'),
                          url:
                              projectSlug && activeStudyId
                                  ? `/app/${projectSlug}/studies/${activeStudyId}/design`
                                  : activeStudy?.project?.slug && activeStudyId
                                    ? `/app/${activeStudy.project.slug}/studies/${activeStudyId}/design`
                                    : `/admin/studies/${activeStudyId}/design`,
                          icon: Wand2,
                      },
                      {
                          title: t('admin.sidebar.recruitment', 'Recruitment'),
                          url:
                              projectSlug && activeStudyId
                                  ? `/app/${projectSlug}/studies/${activeStudyId}/recruitment`
                                  : activeStudy?.project?.slug && activeStudyId
                                    ? `/app/${activeStudy.project.slug}/studies/${activeStudyId}/recruitment`
                                    : `/admin/studies/${activeStudyId}/recruitment`,
                          icon: Users,
                      },
                      {
                          title: t('admin.sidebar.data_exports', 'Data & Exports'),
                          url:
                              projectSlug && activeStudyId
                                  ? `/app/${projectSlug}/studies/${activeStudyId}/data`
                                  : activeStudy?.project?.slug && activeStudyId
                                    ? `/app/${activeStudy.project.slug}/studies/${activeStudyId}/data`
                                    : `/admin/studies/${activeStudyId}/exports`,
                          icon: Table,
                      },
                      {
                          title: t('admin.sidebar.lifecycle', 'Data lifecycle'),
                          url:
                              projectSlug && activeStudyId
                                  ? `/app/${projectSlug}/studies/${activeStudyId}/lifecycle`
                                  : activeStudy?.project?.slug && activeStudyId
                                    ? `/app/${activeStudy.project.slug}/studies/${activeStudyId}/lifecycle`
                                    : `/admin/studies/${activeStudyId}/lifecycle`,
                          icon: ShieldCheck,
                      },
                      {
                          title: t('admin.sidebar.analysis', 'Analysis'),
                          url:
                              projectSlug && activeStudyId
                                  ? `/app/${projectSlug}/studies/${activeStudyId}/analysis`
                                  : activeStudy?.project?.slug && activeStudyId
                                    ? `/app/${activeStudy.project.slug}/studies/${activeStudyId}/analysis`
                                    : `/admin/studies/${activeStudyId}/analysis`,
                          icon: ChartColumnStacked,
                      },
                      {
                          title: t('admin.sidebar.settings', 'Study settings'),
                          url:
                              projectSlug && activeStudyId
                                  ? `/app/${projectSlug}/studies/${activeStudyId}/settings`
                                  : activeStudy?.project?.slug && activeStudyId
                                    ? `/app/${activeStudy.project.slug}/studies/${activeStudyId}/settings`
                                    : `/admin/studies/${activeStudyId}/settings`,
                          icon: Settings,
                      },
                  ],
              },
          ]
        : [];

    const focusStudy =
        isFocusMode && params.studySlug
            ? studies?.find(
                  (s) => s.slug === params.studySlug && s.project_id === currentProject?.id
              )
            : undefined;

    // Render new architecture sidebar
    if (isNewArchitecture) {
        return (
            <Sidebar variant="inset" {...props}>
                <SidebarHeader>
                    {isFocusMode && params.studySlug ? (
                        <FocusModeHeader
                            projectSlug={projectSlug}
                            projectTitle={currentProject?.title}
                            study={focusStudy}
                            studySlug={params.studySlug}
                        />
                    ) : (
                        <ProjectSwitcher />
                    )}
                </SidebarHeader>
                <SidebarContent>
                    {isFocusMode ? (
                        // Focus Mode: Study navigation
                        <SidebarGroup>
                            <SidebarMenu>
                                <SidebarMenuItem className="px-2 mb-4">
                                    <SidebarMenuButton
                                        size="sm"
                                        className="bg-muted/50 hover:bg-muted border border-border/50 text-slate-700 transition-all duration-200"
                                        onClick={() => {
                                            window.dispatchEvent(
                                                new CustomEvent('open-command-menu')
                                            );
                                        }}
                                    >
                                        <Search className="size-3.5 mr-2" />
                                        <span className="text-xs">
                                            {t('admin.sidebar.search', 'Search')}
                                        </span>
                                        <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-background px-1.5 font-mono text-2xs font-medium text-muted-foreground opacity-100">
                                            <span className="text-xs">⌘</span>K
                                        </kbd>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            </SidebarMenu>
                            <SidebarGroupLabel className="px-2 text-xs font-semibold text-slate-600">
                                {t('admin.sidebar.study_tools', 'Study Tools')}
                            </SidebarGroupLabel>
                            <SidebarMenu>
                                {studyNav.map((item) => (
                                    <SidebarMenuItem key={item.title}>
                                        <SidebarMenuButton
                                            asChild
                                            isActive={location.pathname === item.url}
                                        >
                                            <Link to={item.url}>
                                                <item.icon />
                                                <span>{item.title}</span>
                                            </Link>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                ))}
                            </SidebarMenu>
                        </SidebarGroup>
                    ) : (
                        // Project View: Project navigation
                        <SidebarGroup>
                            <SidebarMenu>
                                <SidebarMenuItem className="px-2 mb-4">
                                    <SidebarMenuButton
                                        size="sm"
                                        className="bg-muted/50 hover:bg-muted border border-border/50 text-slate-700 transition-all duration-200"
                                        onClick={() => {
                                            window.dispatchEvent(
                                                new CustomEvent('open-command-menu')
                                            );
                                        }}
                                    >
                                        <Search className="size-3.5 mr-2" />
                                        <span className="text-xs">{t('admin.sidebar.search')}</span>
                                        <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-background px-1.5 font-mono text-2xs font-medium text-muted-foreground opacity-100">
                                            <span className="text-xs">⌘</span>K
                                        </kbd>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            </SidebarMenu>
                            <SidebarGroupLabel className="px-2 text-xs font-semibold text-slate-600">
                                {t('admin.sidebar.project', 'Project')}
                            </SidebarGroupLabel>
                            <SidebarMenu>
                                {projectNav.map((item) => (
                                    <SidebarMenuItem key={item.title}>
                                        <SidebarMenuButton
                                            asChild
                                            isActive={location.pathname === item.url}
                                        >
                                            <Link to={item.url}>
                                                <item.icon />
                                                <span>{item.title}</span>
                                            </Link>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                ))}
                            </SidebarMenu>
                        </SidebarGroup>
                    )}
                </SidebarContent>
                <SidebarFooter className="gap-2">
                    <NavLanguage />
                    <NavUser user={user} projectSlug={projectSlug} />
                </SidebarFooter>
            </Sidebar>
        );
    }

    // Legacy sidebar for backward compatibility
    return (
        <Sidebar variant="inset" {...props}>
            <SidebarHeader>
                <ProjectSwitcher />
                <StudySwitcher />
            </SidebarHeader>
            <SidebarContent>
                {isValidStudy ? (
                    <SidebarGroup>
                        <SidebarMenu>
                            <SidebarMenuItem className="px-2 mb-4">
                                <SidebarMenuButton
                                    size="sm"
                                    className="bg-muted/50 hover:bg-muted border border-border/50 text-slate-700 transition-all duration-200"
                                    onClick={() => {
                                        window.dispatchEvent(new CustomEvent('open-command-menu'));
                                    }}
                                >
                                    <Search className="size-3.5 mr-2" />
                                    <span className="text-xs">{t('admin.sidebar.search')}</span>
                                    <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-background px-1.5 font-mono text-2xs font-medium text-muted-foreground opacity-100">
                                        <span className="text-xs">⌘</span>K
                                    </kbd>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        </SidebarMenu>

                        <SidebarMenu>
                            {navMain.map((group) =>
                                group.items.map((item) => (
                                    <SidebarMenuItem key={item.title}>
                                        <SidebarMenuButton
                                            asChild
                                            isActive={location.pathname === item.url}
                                        >
                                            <Link to={item.url}>
                                                <item.icon />
                                                <span>{item.title}</span>
                                            </Link>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                ))
                            )}
                        </SidebarMenu>
                    </SidebarGroup>
                ) : (
                    <div className="p-4 text-sm text-muted-foreground text-center">
                        {t(
                            'admin.sidebar.select_study_msg',
                            'Please select or create a study to begin.'
                        )}
                    </div>
                )}
            </SidebarContent>
            <SidebarFooter className="gap-2">
                <NavLanguage />
                <NavUser user={user} projectSlug={projectSlug} />
            </SidebarFooter>
        </Sidebar>
    );
}
