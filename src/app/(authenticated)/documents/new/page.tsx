
'use client';

import { DocumentUploadForm } from '@/components/documents/DocumentUploadForm';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { FilePlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { UploadDocumentResult } from '@/actions/documentActions';
// import { useToast } from '@/hooks/use-toast'; // Toast is handled within DocumentUploadForm


export default function NewDocumentPage() {
  const router = useRouter();
  // const { toast } = useToast(); // Toasting is now primarily handled within DocumentUploadForm based on Server Action result

  const handleUploadIsComplete = (result: UploadDocumentResult) => {
    console.log('Document upload process completed in parent page:', result);
    // The DocumentUploadForm now handles its own toast notifications based on server action result.
    // It will also redirect to /documents upon success by default if this callback isn't provided
    // or if this callback doesn't navigate.
    // For now, let's just ensure it redirects to the main documents list.
    if (result.success && result.document) {
      router.push('/documents');
    }
    // If !result.success, the form itself shows the error toast.
  };


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
          <DocumentUploadForm onUploadComplete={handleUploadIsComplete} />
        </CardContent>
      </Card>
    </div>
  );
}
