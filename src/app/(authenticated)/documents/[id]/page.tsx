
import type { Document, DocumentRequest, User, DocumentLocationLog } from '@/types'; 
import { notFound } from 'next/navigation';
import { DocumentDetailClient } from '@/components/documents/DocumentDetailClient';
import { getExtendedDocumentDetails, getDocumentRequests, fetchDocumentLocationHistory } from '@/actions/documentActions'; 
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { fetchUsers } from '@/actions/userActions'; 

export default async function DocumentDetailPageWrapper({ params }: { params: { id: string } }) {
  const documentId = params.id;
  const session = await getServerSession(authOptions);

  const document = await getExtendedDocumentDetails(documentId);

  if (!document) {
    notFound();
  }

  let userActiveRequest: DocumentRequest | undefined = undefined;
  if (session?.user?.id && document.activeRequestId) {
    const { requests } = await getDocumentRequests({ 
      requesterId: session.user.id, 
      documentId: document.id, 
      status: ['Pending Approval', 'Approved - Pending Pickup', 'Checked Out'] 
    });
    if (requests.length > 0 && requests[0].id === document.activeRequestId) {
        userActiveRequest = requests[0];
    }
  }

  // Fetch all users for the "Request for Another User" dialog
  const allUsers = await fetchUsers();
  const locationHistory = await fetchDocumentLocationHistory(documentId);

  return (
    <DocumentDetailClient 
      initialDocument={document} 
      initialUserActiveRequest={userActiveRequest} 
      allUsers={allUsers} 
      initialLocationLogs={locationHistory}
    />
  );
}
    
