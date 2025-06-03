
'use client';

import type { Document } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, Edit3, Trash2, ArrowLeft, CalendarDays, Info, GitBranch, Tag, Download, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

interface DocumentDetailClientProps {
  initialDocument: Document;
}

export function DocumentDetailClient({ initialDocument }: DocumentDetailClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [document, setDocument] = useState<Document | null>(initialDocument);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Ensure date objects are correctly instantiated if passed as strings
    if (initialDocument) {
        setDocument({
            ...initialDocument,
            dateUploaded: new Date(initialDocument.dateUploaded),
            lastModified: new Date(initialDocument.lastModified),
        });
    }
  }, [initialDocument]);

  const handleDeleteDocument = async () => {
    if (!document) return;
    setIsLoading(true);
    // TODO: Replace with Server Action to delete from DB and OwnCloud
    // For now, this is mock local storage deletion
    const storedDocsString = localStorage.getItem('notaryflow_documents');
    let documentsFromStorage: Document[] = storedDocsString ? JSON.parse(storedDocsString) : [];
    const updatedDocs = documentsFromStorage.filter(d => d.id !== document.id);
    localStorage.setItem('notaryflow_documents', JSON.stringify(updatedDocs));

    toast({
      title: 'Document "Deleted" (Locally)',
      description: `Document "${document.name}" removed from local view. DB delete needed.`,
    });
    router.push('/documents');
    setShowDeleteConfirm(false);
    setIsLoading(false);
    // Consider router.refresh() if you want to ensure the list page re-fetches after local change,
    // though actual DB delete will handle this better.
  };

  const statusColors: { [key: string]: string } = {
    Draft: 'bg-gray-500 hover:bg-gray-600',
    'Pending Review': 'bg-yellow-500 hover:bg-yellow-600',
    Notarized: 'bg-green-500 hover:bg-green-600',
    Archived: 'bg-slate-500 hover:bg-slate-600',
  };

  if (!document) {
     return (
      <div className="container mx-auto px-4 md:px-6 py-6 text-center">
        <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
        <h3 className="mt-4 text-xl font-semibold">Document Not Found</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          The document you are looking for does not exist or could not be loaded.
        </p>
        <Button asChild className="mt-4">
          <Link href="/documents"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Documents</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 md:px-6 py-6">
      <header className="mb-8 mt-0">
        <Button variant="outline" size="sm" onClick={() => router.back()} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to List
        </Button>
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div className="flex items-center gap-3">
            <FileText className="h-8 w-8 text-primary flex-shrink-0" />
            <h1 className="text-3xl font-bold tracking-tight text-foreground break-all mt-0">{document.name}</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href={`/documents/${document.id}/edit`}>
                <Edit3 className="mr-2 h-4 w-4" /> Edit
              </Link>
            </Button>
            <Button variant="destructive-outline" onClick={() => setShowDeleteConfirm(true)} disabled={isLoading}>
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </Button>
            <Button disabled={!document.ownCloudPath}>
              <Download className="mr-2 h-4 w-4" /> Download
            </Button>
          </div>
        </div>
      </header>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Document Details</CardTitle>
          <CardDescription>Viewing full information for {document.name}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm">
            <div>
              <p className="font-medium text-muted-foreground">Type</p>
              <p className="text-foreground">{document.type}</p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground">Status</p>
              <Badge variant="outline" className={`${statusColors[document.status] || 'bg-gray-400'} text-white border-none text-xs`}>
                {document.status}
              </Badge>
            </div>
            <div>
              <p className="font-medium text-muted-foreground">Date Uploaded</p>
              <p className="text-foreground flex items-center gap-1" suppressHydrationWarning>
                <CalendarDays className="h-4 w-4" /> {format(document.dateUploaded, 'PPP p')}
              </p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground">Last Modified</p>
              <p className="text-foreground flex items-center gap-1" suppressHydrationWarning>
                <CalendarDays className="h-4 w-4" /> {format(document.lastModified, 'PPP p')}
              </p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground">File Size</p>
              <p className="text-foreground flex items-center gap-1"><Info className="h-4 w-4" /> {document.fileSize}</p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground">Version</p>
              <p className="text-foreground flex items-center gap-1"><GitBranch className="h-4 w-4" /> {document.version}</p>
            </div>
            {document.ownCloudPath && (
                 <div>
                    <p className="font-medium text-muted-foreground">Storage Path</p>
                    <p className="text-foreground break-all text-xs">{document.ownCloudPath}</p>
                 </div>
            )}
          </div>
          {document.tags && document.tags.length > 0 && (
            <div>
              <p className="font-medium text-muted-foreground mb-1">Tags</p>
              <div className="flex flex-wrap gap-2">
                {document.tags.map(tag => (
                  <Badge key={tag} variant="secondary" className="text-xs"><Tag className="mr-1 h-3 w-3"/>{tag}</Badge>
                ))}
              </div>
            </div>
          )}
          {document.contentPreview && (
            <div className="mt-4">
              <p className="font-medium text-muted-foreground mb-1">Content Preview</p>
              <Card className="bg-muted/50 p-4">
                <p className="text-sm text-foreground whitespace-pre-wrap">{document.contentPreview}</p>
              </Card>
            </div>
          )}
        </CardContent>
        <CardFooter className="border-t pt-6">
            <p className="text-xs text-muted-foreground">Document ID: {document.id}</p>
        </CardFooter>
      </Card>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete this document?</AlertDialogTitle>
            <AlertDialogDescription>
              Document: "{document.name}"<br />
              This action cannot be undone and will permanently remove the document (locally for now).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDeleteConfirm(false)} disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
                onClick={handleDeleteDocument}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={isLoading}
            >
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete Document
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
