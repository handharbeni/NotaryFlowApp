
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { DocumentEditForm, type DocumentEditFormValues } from '@/components/documents/DocumentEditForm';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import type { Document } from '@/types';
import { FileText, Loader2 } from 'lucide-react';

export default function EditDocumentPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [document, setDocument] = useState<Document | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const documentId = params.id as string;

  useEffect(() => {
    if (documentId) {
      const storedDocsString = localStorage.getItem('notaryflow_documents');
      if (storedDocsString) {
        const documents: Document[] = JSON.parse(storedDocsString).map((doc: Document) => ({
          ...doc,
          dateUploaded: new Date(doc.dateUploaded),
          lastModified: new Date(doc.lastModified),
        }));
        const foundDoc = documents.find(d => d.id === documentId);
        if (foundDoc) {
          setDocument(foundDoc);
        } else {
          toast({ title: 'Error', description: 'Document not found.', variant: 'destructive' });
          router.push('/documents');
        }
      } else {
        toast({ title: 'Error', description: 'No documents found in storage.', variant: 'destructive' });
        router.push('/documents');
      }
      setIsLoading(false);
    }
  }, [documentId, router, toast]);

  const handleUpdateDocument = async (values: DocumentEditFormValues) => {
    if (!document) return;
    console.log('Updating document:', documentId, values);

    const storedDocsString = localStorage.getItem('notaryflow_documents');
    let documents: Document[] = storedDocsString ? JSON.parse(storedDocsString).map((doc: Document) => ({...doc, dateUploaded: new Date(doc.dateUploaded), lastModified: new Date(doc.lastModified)})) : [];
    
    const updatedDocs = documents.map(d => 
      d.id === documentId ? { ...d, ...values, lastModified: new Date(), tags: values.tags || [] } : d
    );
    localStorage.setItem('notaryflow_documents', JSON.stringify(updatedDocs));

    toast({
      title: 'Document Updated',
      description: `Document "${values.name}" has been successfully updated.`,
    });
    router.push(`/documents/${documentId}`); // Navigate back to detail page or list
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 md:px-6 py-6 flex justify-center items-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2 text-muted-foreground">Loading document details...</p>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="container mx-auto px-4 md:px-6 py-6 text-center">
        <p className="text-destructive">Document not found or failed to load.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 md:px-6 py-6">
      <header className="mb-8 mt-0">
        <div className="flex items-center gap-3">
            <FileText className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight text-foreground mt-0">Edit Document</h1>
        </div>
        <p className="mt-2 text-muted-foreground">
          Modify the metadata for the document: <span className="font-semibold">{document.name}</span>
        </p>
      </header>
      <Card className="shadow-lg max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Document Metadata</CardTitle>
          <CardDescription>Update the details below. The file content itself cannot be changed here.</CardDescription>
        </CardHeader>
        <CardContent>
          <DocumentEditForm document={document} onSubmit={handleUpdateDocument} />
        </CardContent>
      </Card>
    </div>
  );
}
