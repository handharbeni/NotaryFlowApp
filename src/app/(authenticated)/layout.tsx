
import type { ReactNode } from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { fetchUnreadNotificationCount } from '@/actions/notificationActions';
import { fetchActionableTasksCountForUser } from '@/actions/taskActions';
import type { UserRole } from '@/types';

export default async function AuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getServerSession(authOptions);
  let unreadNotificationCount = 0;
  let actionableTasksCount = 0;

  if (session?.user?.id && session?.user?.role) {
    unreadNotificationCount = await fetchUnreadNotificationCount();
    actionableTasksCount = await fetchActionableTasksCountForUser(session.user.id, session.user.role as UserRole);
  }

  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-screen w-full bg-muted/40"> {/* Changed flex-col to flex (row default) */}
        <AppSidebar notificationCount={unreadNotificationCount} taskCount={actionableTasksCount} />
        <div className="flex flex-col flex-1 overflow-y-auto print:sm:pl-0 md:pl-12 peer-data-[state=expanded]:md:pl-64 transition-[padding-left] duration-200 ease-linear">
          <AppHeader />
          <main className="flex-1 pt-0 px-4 pb-4 sm:px-6 sm:pt-0 sm:pb-0">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
