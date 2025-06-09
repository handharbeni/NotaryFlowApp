
import type { ReactNode } from 'react';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

export default async function ArchiveLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getServerSession(authOptions);
  const allowedRoles: Array<string | undefined> = ['admin', 'manager', 'cs', 'notary'];

  if (!session || !session.user || !allowedRoles.includes(session.user.role)) {
    // If you want to show a "not authorized" page instead:
    // return (
    //   <div className="container mx-auto py-8 px-4 md:px-6 flex justify-center items-center min-h-[calc(100vh-theme(spacing.14))]">
    //     <Card className="w-full max-w-md shadow-lg">
    //       <CardHeader>
    //         <CardTitle className="flex items-center gap-2 text-destructive">
    //           <AlertTriangle className="h-6 w-6" /> Access Denied
    //         </CardTitle>
    //       </CardHeader>
    //       <CardContent>
    //         <p className="text-muted-foreground">You do not have permission to view this page.</p>
    //         <p className="mt-2 text-sm">Please contact an administrator if you believe this is an error.</p>
    //       </CardContent>
    //     </Card>
    //   </div>
    // );
    redirect('/dashboard'); 
  }

  return <>{children}</>;
}
