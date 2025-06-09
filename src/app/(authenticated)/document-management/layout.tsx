
import type { ReactNode } from 'react';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';

export default async function DocumentManagementLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getServerSession(authOptions);
  const userRole = session?.user?.role?.toLowerCase();
  const allowedRoles = ['admin', 'cs'];

  if (!session || !userRole || !allowedRoles.includes(userRole)) {
    redirect('/dashboard'); 
  }

  return <>{children}</>;
}
