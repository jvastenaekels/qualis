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
    Settings2,
    ShieldCheck,
    Users,
} from 'lucide-react';
import { ProjectSwitcher } from './ProjectSwitcher';
import { FocusModeHeader } from './FocusModeHeader';
import { UserAvatar } from './UserAvatar';
import { resetAllStores } from '@/utils/sessionReset';
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
import { useAuthStore } from '@/store/useAuthStore';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { usePermission } from '@/hooks/usePermission';
import { useSidebar } from '@/components/ui/sidebar';
import { getAdminLanguages } from '@/constants/languages';

function NavLanguage() {
    const { i18n, t } = useTranslation();
    const currentLang = i18n.language;
    const adminLanguages = getAdminLanguages();
    const currentCodeUpper = adminLanguages.find((l) => l.code === currentLang)?.code.toUpperCase();

    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton size="sm" className="text-muted-foreground">
                            <Globe className="size-4" />
                            <span>{currentCodeUpper || t('layout.language')}</span>
                            <ChevronsUpDown className="ml-auto size-3" />
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40 rounded-lg">
                        <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground/70">
                            {t('layout.change_lang_title')}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {adminLanguages.map((lang) => (
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
                                <span className="text-sm">{lang.code.toUpperCase()}</span>
                                <span className="sr-only">{lang.label}</span>
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    );
}

function NavUser({
    user,
    projectSlug,
    isSuperuser,
}: {
    // biome-ignore lint/suspicious/noExplicitAny: mock user
    user: any;
    projectSlug?: string;
    isSuperuser: boolean;
}) {
    const logout = useAuthStore((state) => state.logout);
    const navigate = useNavigate();
    const { t } = useTranslation();

    const handleLogout = () => {
        logout();
        // Clear persisted Zustand stores + query cache so a subsequent admin
        // login on the same browser cannot see the previous session's data.
        // Mirrors the logout flow in CommandMenu.tsx.
        resetAllStores({ skipConfig: true });
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
                                    navigate(projectSlug ? `/app/${projectSlug}/account` : '/hub')
                                }
                            >
                                <BadgeCheck className="mr-2 h-4 w-4" />
                                {t('admin.layout.account', 'Account settings')}
                            </DropdownMenuItem>
                            {isSuperuser && (
                                <DropdownMenuItem onSelect={() => navigate('/app/users')}>
                                    <ShieldCheck className="mr-2 h-4 w-4" />
                                    {t('admin.layout.platform_settings', 'Platform settings')}
                                </DropdownMenuItem>
                            )}
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
    const { currentProject } = useAuthStore();
    const { user, isSuperuser } = useAuth();
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
                  title: t('admin.sidebar.members', 'Team members'),
                  url: `/app/${projectSlug}/members`,
                  icon: Users,
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
                      // Wave E (E4): study-scope sidebar item is "Overview" /
                      // "Vue d'ensemble" — distinct from the project-scope
                      // "Dashboard" above. Both used the same label before;
                      // breadcrumbs already say "Vue d'ensemble" so the page
                      // and sidebar now agree (audit REPORT.md finding C4).
                      title: t('admin.sidebar.overview', 'Overview'),
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
                      title: t('admin.sidebar.privacy', 'Data privacy'),
                      url: `/app/${projectSlug}/studies/${params.studySlug}/privacy`,
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

    const focusStudy =
        isFocusMode && params.studySlug
            ? studies?.find(
                  (s) => s.slug === params.studySlug && s.project_id === currentProject?.id
              )
            : undefined;

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
                                        window.dispatchEvent(new CustomEvent('open-command-menu'));
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
                <NavUser user={user} projectSlug={projectSlug} isSuperuser={isSuperuser} />
            </SidebarFooter>
        </Sidebar>
    );
}
