
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Document } from '@/types';
import { DocumentSearchForm } from '@/components/documents/DocumentSearchForm';
import { DocumentListItem } from '@/components/documents/DocumentListItem';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ListFilter, FileText, Search } from 'lucide-react'; // Added Search
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
import type { SearchFormValues } from './DocumentSearchForm'; // Import SearchFormValues

interface DocumentListClientProps {
  initialDocuments: Document[];
}

export function DocumentListClient({ initialDocuments }: DocumentListClientProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [filteredDocuments, setFilteredDocuments] = useState<Document[]>([]);
  const { toast } = useToast();
  const [docToDelete, setDocToDelete] = useState<Document | null>(null);

  const mapAndSetDocuments = useCallback((docs: Document[]) => {
    const mappedDocs = docs.map(doc => ({
      ...doc,
      dateUploaded: new Date(doc.dateUploaded),
      lastModified: new Date(doc.lastModified),
    }));
    setDocuments(mappedDocs);
    setFilteredDocuments(mappedDocs);
  }, []);

  useEffect(() => {
    mapAndSetDocuments(initialDocuments);
  }, [initialDocuments, mapAndSetDocuments]);


  const saveDocumentsToLocalStorage = (updatedDocs: Document[]) => {
    // TODO: This will be replaced with a Server Action to delete from DB
    localStorage.setItem('notaryflow_documents', JSON.stringify(updatedDocs));
    console.warn("Mock delete: Updated localStorage. Implement Server Action for DB delete.");
  };

  const confirmDeleteDocument = (doc: Document) => {
    setDocToDelete(doc);
  };

  const handleDeleteDocument = async () => {
    if (!docToDelete) return;

    const updatedDocs = documents.filter(d => d.id !== docToDelete.id);
    setDocuments(updatedDocs);
    setFilteredDocuments(updatedDocs);
    saveDocumentsToLocalStorage(updatedDocs);

    toast({ title: 'Document "Deleted" (Locally)', description: `Document "${docToDelete.name}" removed from view. DB delete implementation pending.` });
    setDocToDelete(null);
    // TODO: Implement Server Action for actual DB deletion.
  };

  const handleSearch = (searchParams: SearchFormValues) => {
    let tempFilteredDocs = [...documents];
    if (searchParams.keyword) {
      const keywordLower = searchParams.keyword.toLowerCase();
      tempFilteredDocs = tempFilteredDocs.filter(doc =>
        doc.name.toLowerCase().includes(keywordLower) ||
        doc.type.toLowerCase().includes(keywordLower) ||
        (doc.tags && doc.tags.some(tag => tag.toLowerCase().includes(keywordLower)))
      );
    }
    if (searchParams.documentType) {
      tempFilteredDocs = tempFilteredDocs.filter(doc => doc.type.toLowerCase() === searchParams.documentType?.toLowerCase());
    }
    if (searchParams.status) {
      // Assuming searchParams.status matches the Document status values (e.g., 'Draft', 'Notarized')
      tempFilteredDocs = tempFilteredDocs.filter(doc => doc.status === searchParams.status);
    }
    if (searchParams.dateFrom) {
        tempFilteredDocs = tempFilteredDocs.filter(doc => new Date(doc.dateUploaded) >= new Date(searchParams.dateFrom!));
    }
    if (searchParams.dateTo) {
        tempFilteredDocs = tempFilteredDocs.filter(doc => new Date(doc.dateUploaded) <= new Date(searchParams.dateTo!));
    }
    setFilteredDocuments(tempFilteredDocs);
    toast({ title: 'Search Applied (Client-Side)', description: 'Displaying filtered results.' });
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <Card className="shadow-lg sticky top-20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Search className="h-5 w-5" /> Search & Filters</CardTitle>
              <CardDescription>Refine the document list.</CardDescription>
            </CardHeader>
            <CardContent>
              <DocumentSearchForm onSearchSubmit={handleSearch} />
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card className="shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Document List</CardTitle>
                <Button variant="outline" size="sm" onClick={() => setFilteredDocuments(documents)}>
                  <ListFilter className="mr-2 h-4 w-4" /> Show All
                </Button>
              </div>
              <CardDescription>Showing {filteredDocuments.length} of {documents.length} documents from the database.</CardDescription>
            </CardHeader>
            <CardContent>
              {filteredDocuments.length > 0 ? (
                <div className="space-y-4">
                  {filteredDocuments.map((doc) => (
                    <DocumentListItem key={doc.id} document={doc} onDelete={() => confirmDeleteDocument(doc)} />
                  ))}
                </div>
              ) : (
                 documents.length > 0 && filteredDocuments.length === 0 ? (
                  <div className="py-10 text-center">
                    <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
                    <h3 className="mt-4 text-xl font-semibold">No Documents Match Filters</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Try adjusting your search filters.
                    </p>
                  </div>
                ) : (
                  <div className="py-10 text-center">
                    <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
                    <h3 className="mt-4 text-xl font-semibold">No Documents Found in Database</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Upload a new document to get started.
                    </p>
                  </div>
                )
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <AlertDialog open={!!docToDelete} onOpenChange={(open) => !open && setDocToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete this document?</AlertDialogTitle>
            <AlertDialogDescription>
              Document: "{docToDelete?.name}"<br />
              This action cannot be undone (locally for now). Database delete pending.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDocToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteDocument} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete Document
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
