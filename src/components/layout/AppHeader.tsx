
'use client';

import Link from 'next/link';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  FileText,
  Home,
  LogOut,
  Menu,
  Bell,
  Settings,
  ListChecks,
  User,
  Activity,
  ArchiveIcon,
  SearchCheck,
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { signOut, useSession } from 'next-auth/react';

const navItemsBase = [
  { href: '/dashboard', icon: Home, label: 'Dasbor' },
  { href: '/documents', icon: FileText, label: 'Dokumen' },
  { href: '/tasks', icon: ListChecks, label: 'Tugas' },
];

const reportNavItem = { href: '/reports/income', icon: Activity, label: 'Laporan Aktivitas' };
const archiveNavItem = { href: '/archive', icon: ArchiveIcon, label: 'Arsip', roles: ['admin', 'manager', 'cs', 'notary'] };
const trackTaskNavItem = { href: '/track-task', icon: SearchCheck, label: 'Lacak Progres Tugas' };

const utilityNavItemsBase = [
  { href: '/notifications', icon: Bell, label: 'Notifikasi' },
  { href: '/settings', icon: Settings, label: 'Pengaturan'}
];


export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();

  const userRole = session?.user?.role;

  let navItems = [...navItemsBase];
  if (userRole === 'admin' || userRole === 'manager') {
    navItems.push(reportNavItem);
  }
  if (userRole && archiveNavItem.roles.includes(userRole)) {
    navItems.push(archiveNavItem);
  }
  navItems.push(trackTaskNavItem); // Add track task for all logged-in users
  navItems = [...navItems, ...utilityNavItemsBase];


  const handleLogout = async () => {
    await signOut({ redirect: true, callbackUrl: '/' });
  };

  const userInitial = session?.user?.name
    ? session.user.name.charAt(0).toUpperCase()
    : (session?.user?.email ? session.user.email.charAt(0).toUpperCase() : 'P');

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6 print:hidden mb-0">
      <div className="md:hidden">
        <SidebarTrigger />
      </div>
      <Sheet>
        <SheetTrigger asChild>
          <Button size="icon" variant="outline" className="sm:hidden">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Alihkan Menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="sm:max-w-xs bg-sidebar text-sidebar-foreground">
          <SheetHeader className="border-b border-sidebar-border p-4">
            <SheetTitle className="text-lg font-semibold">Menu Navigasi</SheetTitle>
          </SheetHeader>
          <nav className="grid gap-6 text-lg font-medium p-4">
            <Link
              href="/dashboard"
              className="group flex h-10 shrink-0 items-center gap-2 rounded-full bg-primary text-lg font-semibold text-primary-foreground md:text-base -ml-2 -mt-2"
            >
              <FileText className="h-5 w-5 transition-all group-hover:scale-110 ml-2.5" />
              <span className="sr-only">NotaryFlow</span>
            </Link>
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={`flex items-center gap-4 px-2.5 ${
                  pathname === item.href || (item.href !== '/dashboard' && item.href !== '/track-task' && pathname.startsWith(item.href)) || (item.href === '/track-task' && pathname === '/track-task')
                    ? 'text-sidebar-primary font-semibold'
                    : 'text-sidebar-foreground hover:text-sidebar-primary'
                }`}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            ))}
          </nav>
        </SheetContent>
      </Sheet>

      <div className="relative ml-auto flex items-center gap-2 md:grow-0">
        {status === 'authenticated' && session?.user?.name && (
           <span className="text-sm text-muted-foreground hidden md:inline">Selamat datang, {session.user.name}</span>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="overflow-hidden rounded-full"
            disabled={status === 'loading'}
          >
            {status === 'authenticated' && session?.user ? (
                <Avatar>
                <AvatarFallback>{userInitial}</AvatarFallback>
              </Avatar>
            ) : (
                <User className="h-5 w-5"/>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {status === 'authenticated' && session?.user ? (
            <>
              <DropdownMenuLabel>{session.user.name || session.user.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push('/settings')}>
                <User className="mr-2 h-4 w-4" />
                Profil & Pengaturan
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Keluar
              </DropdownMenuItem>
            </>
          ) : (
             <>
              <DropdownMenuItem onClick={() => router.push('/')}>
                <LogOut className="mr-2 h-4 w-4" />
                Masuk
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
    