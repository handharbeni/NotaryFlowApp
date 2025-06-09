
import { PackageSearch } from 'lucide-react';
import { getDocumentRequests } from '@/actions/documentActions';
import type { DocumentRequest } from '@/types';
import { DocumentRequestListClient } from '@/components/admin/document-requests/DocumentRequestListClient';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export default async function DocumentRequestsPage() {
  const session = await getServerSession(authOptions);

  // Fetch all relevant requests for CS/Admin.
  // Adjust statuses based on what CS/Admin needs to actively manage.
  const documentRequestData = await getDocumentRequests({
    status: ['Pending Approval', 'Approved - Pending Pickup', 'Checked Out', 'Returned', 'Rejected', 'Cancelled'] // Fetch a broader range for CS to see history too
  });
  const initialRequests: DocumentRequest[] = documentRequestData.requests; 

  const actorUserId = session?.user?.id;
  if (!actorUserId) {
    // This case should ideally be caught by the layout, but as a fallback:
    return <p className="p-4 text-destructive">Error: User information not available.</p>;
  }

  return (
    <div className="container mx-auto px-4 md:px-6 py-6">
      <header className="mb-8 mt-0">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <PackageSearch className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight text-foreground mt-0">Kelola Permintaan Dokumen Asli</h1>
          </div>
        </div>
        <p className="mt-2 text-muted-foreground">
          Setujui, lacak, dan kelola permintaan untuk dokumen fisik asli.
        </p>
      </header>

      <DocumentRequestListClient
        initialRequests={initialRequests} 
        currentActorUserId={actorUserId}
      />
    </div>
  );
}
