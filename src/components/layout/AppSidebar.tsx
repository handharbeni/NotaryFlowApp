
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge, 
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  FileText,
  Home,
  Bell,
  Lightbulb,
  Settings,
  Users,
  Briefcase, 
  ListChecks, 
  HelpCircle,
} from 'lucide-react';
import { useSidebar } from '@/components/ui/sidebar';
import { useSession } from 'next-auth/react'; 
import { cn } from '@/lib/utils'; 

interface AppSidebarProps {
  notificationCount: number;
  taskCount: number;
}

const navItemsConfig = [
  { href: '/dashboard', icon: Home, label: 'Dashboard', badgeKey: 'dashboardCount' as const },
  { href: '/documents', icon: Briefcase, label: 'Documents' },
  { href: '/tasks', icon: ListChecks, label: 'Tasks', badgeKey: 'taskCount' as const },
  { href: '/documents/keyword-suggestion', icon: Lightbulb, label: 'AI Keywords' },
  { href: '/notifications', icon: Bell, label: 'Notifications', badgeKey: 'notificationCount' as const },
];

const adminNavItems = [
 { href: '/admin/users', icon: Users, label: 'User Management' },
 // { href: '/admin/settings', icon: Settings, label: 'System Settings' }, // Keep for future
];

export function AppSidebar({ notificationCount, taskCount }: AppSidebarProps) {
  const pathname = usePathname();
  const { state: sidebarState } = useSidebar(); 
  const { data: session } = useSession(); 

  const userRole = session?.user?.role;
  const isSidebarExpanded = sidebarState === 'expanded';

  const getBadgeCount = (badgeKey?: 'notificationCount' | 'taskCount' | 'dashboardCount') => {
    if (!badgeKey) return 0;
    if (badgeKey === 'notificationCount') return notificationCount;
    if (badgeKey === 'taskCount') return taskCount;
    // Add logic for dashboardCount if/when it becomes dynamic
    return 0; 
  };

  return (
    <Sidebar side="left" variant="sidebar" collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center justify-between p-2">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Button
              variant="ghost"
              className="h-10 w-10 p-0 text-primary hover:bg-primary/10"
              aria-label="NotaryFlow Home"
            >
              <FileText className="h-6 w-6" />
            </Button>
            {isSidebarExpanded && <h1 className="text-lg font-semibold text-foreground">NotaryFlow</h1>}
          </Link>
          <div className="md:hidden">
            <SidebarTrigger />
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="flex-1 overflow-y-auto">
        <SidebarMenu>
          {navItemsConfig.map((item) => {
            const badgeCount = getBadgeCount(item.badgeKey);
            return (
              <SidebarMenuItem key={item.label}>
                <Link href={item.href} legacyBehavior passHref>
                  <SidebarMenuButton
                    isActive={pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))}
                    tooltip={{ children: item.label, hidden: isSidebarExpanded }}
                    className="justify-start"
                  >
                    <item.icon className="h-5 w-5" />
                    <span className={!isSidebarExpanded ? 'sr-only' : ''}>{item.label}</span>
                    {badgeCount > 0 && isSidebarExpanded && (
                      <SidebarMenuBadge>{badgeCount}</SidebarMenuBadge>
                    )}
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>

        {userRole === 'admin' && (
          <>
            <Separator className="my-4" />
            <SidebarMenu>
              <SidebarMenuItem className={cn(
                "px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider",
                !isSidebarExpanded && "text-center" 
              )}>
                {isSidebarExpanded ? 'Admin Tools' : <Users className="h-5 w-5 mx-auto"/>}
              </SidebarMenuItem>
              {adminNavItems.map((item) => (
                <SidebarMenuItem key={item.label}>
                  <Link href={item.href} legacyBehavior passHref>
                    <SidebarMenuButton
                      isActive={pathname.startsWith(item.href)}
                      tooltip={{ children: item.label, hidden: isSidebarExpanded }}
                      className="justify-start"
                    >
                      <item.icon className="h-5 w-5" />
                      <span className={!isSidebarExpanded ? 'sr-only' : ''}>{item.label}</span>
                    </SidebarMenuButton>
                  </Link>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </>
        )}
      </SidebarContent>

      <SidebarFooter className="mt-auto border-t border-sidebar-border p-2">
        <Link href="/help" legacyBehavior passHref>
          <SidebarMenuButton 
            variant="ghost" 
            className="w-full justify-start"
            tooltip={{ children: "Help & Support", hidden: isSidebarExpanded }}
          >
            <HelpCircle className="h-5 w-5" />
            <span className={!isSidebarExpanded ? 'sr-only' : ''}>Help & Support</span>
          </SidebarMenuButton>
        </Link>
      </SidebarFooter>
    </Sidebar>
  );
}
