
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
  Settings,
  Users,
  Briefcase,
  ListChecks,
  HelpCircle,
  Activity,
  ArchiveIcon,
  SearchCheck,
  PackageSearch, 
} from 'lucide-react';
import { useSidebar } from '@/components/ui/sidebar';
import { useSession } from 'next-auth/react';
import { cn } from '@/lib/utils';

interface AppSidebarProps {
  notificationCount: number;
  taskCount: number;
}

const navItemsConfig = [
  { href: '/dashboard', icon: Home, label: 'Dasbor', badgeKey: 'dashboardCount' as const },
  { href: '/documents', icon: Briefcase, label: 'Dokumen' },
  { href: '/tasks', icon: ListChecks, label: 'Tugas', badgeKey: 'taskCount' as const },
  { href: '/reports/income', icon: Activity, label: 'Laporan Aktivitas' },
  { href: '/archive', icon: ArchiveIcon, label: 'Arsip', roles: ['admin', 'manager', 'cs', 'notary'] },
  { href: '/track-task', icon: SearchCheck, label: 'Lacak Progres Tugas' },
  { href: '/notifications', icon: Bell, label: 'Notifikasi', badgeKey: 'notificationCount' as const },
];

const adminNavItems = [
 { href: '/admin/users', icon: Users, label: 'Manajemen Pengguna' },
 // Updated path for Document Requests
 { href: '/document-management/requests', icon: PackageSearch, label: 'Permintaan Dokumen', roles: ['admin', 'cs'] },
];

const utilityNavItems = [
  { href: '/settings', icon: Settings, label: 'Pengaturan'},
  { href: '/help', icon: HelpCircle, label: 'Bantuan & Dukungan' },
];

export function AppSidebar({ notificationCount, taskCount }: AppSidebarProps) {
  const pathname = usePathname();
  const { state: sidebarState } = useSidebar();
  const { data: session } = useSession();

  const userRole = session?.user?.role?.toLowerCase(); // Use toLowerCase for consistent role checking
  const isSidebarExpanded = sidebarState === 'expanded';

  const getBadgeCount = (badgeKey?: 'notificationCount' | 'taskCount' | 'dashboardCount') => {
    if (!badgeKey) return 0;
    if (badgeKey === 'notificationCount') return notificationCount;
    if (badgeKey === 'taskCount') return taskCount;
    return 0;
  };

  const mainNavItems = navItemsConfig.filter(item => {
    if (item.href.startsWith('/reports')) {
      return userRole === 'admin' || userRole === 'manager';
    }
    if (item.roles && userRole) {
        return item.roles.includes(userRole);
    }
    if (item.roles && !userRole && item.href !== '/track-task') return false;
    if (item.href === '/track-task') return true; 
    return !item.roles; 
  });
  
  const filteredAdminNavItems = adminNavItems.filter(item => {
    if (!userRole) return false; 
    if (item.roles) {
        return item.roles.includes(userRole);
    }
    return userRole === 'admin'; 
  });


  return (
    <Sidebar side="left" variant="sidebar" collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center justify-between p-2">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Button
              variant="ghost"
              className="h-10 w-10 p-0 text-primary hover:bg-primary/10"
              aria-label="Beranda NotaryFlow"
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
          {mainNavItems.map((item) => {
            const badgeCount = getBadgeCount(item.badgeKey);
            return (
              <SidebarMenuItem key={item.label}>
                <Link href={item.href} legacyBehavior passHref>
                  <SidebarMenuButton
                    isActive={pathname === item.href || (item.href !== '/dashboard' && item.href !== '/track-task' && pathname.startsWith(item.href)) || (item.href === '/track-task' && pathname === '/track-task')}
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

        {filteredAdminNavItems.length > 0 && (
          <>
            <Separator className="my-4" />
            <SidebarMenu>
              <SidebarMenuItem className={cn(
                "px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider",
                !isSidebarExpanded && "text-center"
              )}>
                {isSidebarExpanded ? 'Alat Admin' : <Users className="h-5 w-5 mx-auto"/>}
              </SidebarMenuItem>
              {filteredAdminNavItems.map((item) => (
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
        <SidebarMenu>
          {utilityNavItems.map((item) => (
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
      </SidebarFooter>
    </Sidebar>
  );
}
