
'use client'; // Still needs to be client for router and form handling

import { DocumentUploadForm } from '@/components/documents/DocumentUploadForm';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { FilePlus, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { UploadDocumentResult } from '@/actions/documentActions';
import { useSession } from 'next-auth/react'; // Import useSession
import { useEffect, useState } from 'react';

export default function NewDocumentPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession(); // Get session
  const [uploaderId, setUploaderId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (sessionStatus === 'authenticated' && session?.user?.id) {
      setUploaderId(session.user.id);
    } else if (sessionStatus === 'unauthenticated') {
      // Handle case where user is not authenticated, perhaps redirect or show error
      console.error("User not authenticated for document upload.");
      // router.push('/'); // Example redirect
    }
  }, [session, sessionStatus, router]);

  const handleUploadIsComplete = (result: UploadDocumentResult) => {
    if (result.success && result.document) {
      router.push('/documents');
    }
  };

  if (sessionStatus === 'loading' || (sessionStatus === 'authenticated' && !uploaderId) ) {
    return (
        <div className="container mx-auto px-4 md:px-6 py-6 flex justify-center items-center min-h-[calc(100vh-var(--header-height,theme(spacing.14)))]">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="ml-2 text-muted-foreground">Loading user session...</p>
        </div>
    );
  }

  if (sessionStatus === 'unauthenticated') {
     return (
        <div className="container mx-auto px-4 md:px-6 py-6 text-center">
            <p className="text-destructive">You must be logged in to upload documents.</p>
             <Button onClick={() => router.push('/')} className="mt-4">Go to Login</Button>
        </div>
     )
  }


  return (
    <div className="container mx-auto px-4 md:px-6 py-6">
      <header className="mb-8 mt-0">
        <div className="flex items-center gap-3">
            <FilePlus className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight text-foreground mt-0">Upload New Document</h1>
        </div>
        <p className="mt-2 text-muted-foreground">
          Select a file and provide details to upload a new document to OwnCloud and record it in the system.
        </p>
      </header>
      <Card className="shadow-lg max-w-xl mx-auto">
        <CardHeader>
          <CardTitle>Document Upload</CardTitle>
          <CardDescription>Files will be stored in OwnCloud. Max file size and accepted types are shown below.</CardDescription>
        </CardHeader>
        <CardContent>
          {uploaderId ? (
            <DocumentUploadForm 
                onUploadComplete={handleUploadIsComplete} 
                uploaderId={uploaderId} 
            />
          ) : (
            <p className="text-center text-muted-foreground">Could not retrieve uploader information. Please try again.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
