import type * as React from 'react';
import { Database, LayoutDashboard, PencilRuler, Send, SquareTerminal, Users } from 'lucide-react';
import { StudySwitcher } from './StudySwitcher';
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
import { useAdminStore } from '@/store/useAdminStore';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

// biome-ignore lint/suspicious/noExplicitAny: mock user
function NavUser({ user }: { user: any }) {
    // Basic implementation
    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <SidebarMenuButton size="lg">
                    <div className="rounded-md bg-primary text-primary-foreground p-1">
                        {user?.email?.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="flex flex-col text-left">
                        <span className="font-semibold text-sm">{user?.email}</span>
                        <span className="text-xs text-muted-foreground">Admin</span>
                    </div>
                </SidebarMenuButton>
            </SidebarMenuItem>
        </SidebarMenu>
    );
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
    const { activeStudyId } = useAdminStore();
    const { user } = useAuth();
    const location = useLocation();

    const navMain = activeStudyId
        ? [
              {
                  title: 'Navigation',
                  url: '#',
                  icon: SquareTerminal,
                  isActive: true,
                  items: [
                      {
                          title: 'Overview',
                          url: `/admin/studies/${activeStudyId}`,
                          icon: LayoutDashboard,
                      },
                      {
                          title: 'Designer',
                          url: `/admin/studies/${activeStudyId}/design`,
                          icon: PencilRuler,
                      },
                      {
                          title: 'Team Management',
                          url: `/admin/studies/${activeStudyId}/team`,
                          icon: Users,
                      },
                      {
                          title: 'Fieldwork',
                          url: `#`,
                          icon: Send, // Placeholder
                      },
                      {
                          title: 'Data & Exports',
                          url: `#`,
                          icon: Database,
                      },
                  ],
              },
          ]
        : [];

    return (
        <Sidebar variant="inset" {...props}>
            <SidebarHeader>
                <StudySwitcher />
            </SidebarHeader>
            <SidebarContent>
                {activeStudyId ? (
                    <SidebarGroup>
                        <SidebarGroupLabel>Study Management</SidebarGroupLabel>
                        <SidebarMenu>
                            {navMain[0].items.map((item) => (
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
                    <div className="p-4 text-sm text-muted-foreground text-center">
                        Please select or create a study to begin.
                    </div>
                )}
            </SidebarContent>
            <SidebarFooter>
                <NavUser user={user} />
            </SidebarFooter>
        </Sidebar>
    );
}
