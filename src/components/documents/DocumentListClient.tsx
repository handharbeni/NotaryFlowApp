
'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Document, PaginatedDocumentsResponse } from '@/types';
import { DocumentSearchForm } from '@/components/documents/DocumentSearchForm';
import { DocumentListItem } from '@/components/documents/DocumentListItem';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ListFilter, FileText, Search, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
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
import type { SearchFormValues } from './DocumentSearchForm';
import { fetchPaginatedDocuments } from '@/actions/documentActions'; // Import server action
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

interface DocumentListClientProps {
  initialPaginatedData: PaginatedDocumentsResponse;
  itemsPerPage: number;
  initialFilters?: Partial<SearchFormValues>;
}

export function DocumentListClient({ 
  initialPaginatedData, 
  itemsPerPage,
  initialFilters = {}
}: DocumentListClientProps) {
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParamsHook = useSearchParams();


  const [documents, setDocuments] = useState<Document[]>(initialPaginatedData.documents);
  const [currentPage, setCurrentPage] = useState<number>(initialPaginatedData.currentPage);
  const [totalPages, setTotalPages] = useState<number>(initialPaginatedData.totalPages);
  const [totalDocuments, setTotalDocuments] = useState<number>(initialPaginatedData.totalDocuments);
  const [isLoading, setIsLoading] = useState(false);
  const [docToDelete, setDocToDelete] = useState<Document | null>(null);
  const [activeFilters, setActiveFilters] = useState<Partial<SearchFormValues>>(initialFilters);

  const mapAndSetDocuments = useCallback((docs: Document[]) => {
    const mappedDocs = docs.map(doc => ({
      ...doc,
      dateUploaded: new Date(doc.dateUploaded),
      lastModified: new Date(doc.lastModified),
    }));
    setDocuments(mappedDocs);
  }, []);

  useEffect(() => {
    mapAndSetDocuments(initialPaginatedData.documents);
    setCurrentPage(initialPaginatedData.currentPage);
    setTotalPages(initialPaginatedData.totalPages);
    setTotalDocuments(initialPaginatedData.totalDocuments);
  }, [initialPaginatedData, mapAndSetDocuments]);

  const buildQueryString = (page: number, filters: Partial<SearchFormValues>): string => {
    const params = new URLSearchParams();
    params.append('page', page.toString());
    if (filters.keyword) params.append('keyword', filters.keyword);
    if (filters.documentType) params.append('documentType', filters.documentType);
    if (filters.status) params.append('status', filters.status);
    if (filters.dateFrom) params.append('dateFrom', filters.dateFrom.toISOString().split('T')[0]);
    if (filters.dateTo) params.append('dateTo', filters.dateTo.toISOString().split('T')[0]);
    return params.toString();
  };

  const loadDocuments = useCallback(async (page: number, filters: Partial<SearchFormValues>) => {
    setIsLoading(true);
    try {
      const queryString = buildQueryString(page, filters);
      router.push(`${pathname}?${queryString}`, { scroll: false }); 
      // Data will be re-fetched by the server component due to searchParams change,
      // and then propogated down via initialPaginatedData in the useEffect.
      // If we wanted to fetch directly here without full page reload:
      // const result = await fetchPaginatedDocuments({ page, limit: itemsPerPage, ...filters });
      // mapAndSetDocuments(result.documents);
      // setCurrentPage(result.currentPage);
      // setTotalPages(result.totalPages);
      // setTotalDocuments(result.totalDocuments);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to load documents.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [itemsPerPage, mapAndSetDocuments, toast, router, pathname]);


  const handleSearch = (newFilters: SearchFormValues) => {
    const updatedFilters = {
      keyword: newFilters.keyword || undefined,
      documentType: newFilters.documentType || undefined,
      status: newFilters.status || undefined,
      dateFrom: newFilters.dateFrom || undefined,
      dateTo: newFilters.dateTo || undefined,
    };
    setActiveFilters(updatedFilters);
    loadDocuments(1, updatedFilters);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      loadDocuments(newPage, activeFilters);
    }
  };
  
  const confirmDeleteDocument = (doc: Document) => {
    setDocToDelete(doc);
  };

  const handleDeleteDocument = async () => {
    if (!docToDelete) return;
    setIsLoading(true);
    // TODO: Implement actual server-side delete and refetch or optimistic update
    // For now, this is a mock local "delete" and refetch of current page
    console.warn("Mock delete: Implement Server Action for DB delete for document: " + docToDelete.id);
    
    // This is a placeholder. In a real scenario, you'd call a delete action
    // then refetch the current page's data.
    const currentDocs = documents.filter(d => d.id !== docToDelete.id);
    setDocuments(currentDocs);
    setTotalDocuments(prev => prev - 1);
    // Adjust totalPages if necessary, though this might be complex without refetching counts
    if (currentDocs.length === 0 && currentPage > 1) {
      handlePageChange(currentPage - 1);
    } else {
      // Potentially refetch or just update counts locally
    }

    toast({ title: 'Document "Deleted" (Locally)', description: `Document "${docToDelete.name}" removed from view. DB delete implementation pending.` });
    setDocToDelete(null);
    setIsLoading(false);
  };
  
  useEffect(() => {
    // This effect will run when searchParamsHook changes, which happens after router.push
    // It allows the component to react to URL changes triggered by pagination/filtering
    // and ensure the state reflects the URL, especially if the server component re-renders.
    const pageFromUrl = Number(searchParamsHook.get('page')) || 1;
    const keywordFromUrl = searchParamsHook.get('keyword') || undefined;
    // ... (get other filters from URL) ...
    
    if (pageFromUrl !== currentPage) {
      // setCurrentPage(pageFromUrl); // This is handled by initialPaginatedData prop update
    }
    // Update activeFilters if they differ, but be careful of infinite loops
    // setActiveFilters({ keyword: keywordFromUrl, ... }); 
  }, [searchParamsHook, currentPage]);


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
              <DocumentSearchForm onSearchSubmit={handleSearch} initialValues={activeFilters} />
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card className="shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Document List</CardTitle>
                <Button variant="outline" size="sm" onClick={() => handleSearch({})}>
                  <ListFilter className="mr-2 h-4 w-4" /> Show All
                </Button>
              </div>
              <CardDescription>
                Showing {documents.length > 0 ? ((currentPage - 1) * itemsPerPage + 1) : 0}-
                {Math.min(currentPage * itemsPerPage, totalDocuments)} of {totalDocuments} documents.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading && documents.length === 0 ? (
                <div className="flex justify-center items-center py-10">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : documents.length > 0 ? (
                <div className="space-y-4">
                  {documents.map((doc) => (
                    <DocumentListItem key={doc.id} document={doc} onDelete={() => confirmDeleteDocument(doc)} />
                  ))}
                </div>
              ) : (
                 totalDocuments > 0 && documents.length === 0 ? (
                  <div className="py-10 text-center">
                    <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
                    <h3 className="mt-4 text-xl font-semibold">No Documents Match Filters</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Try adjusting your search filters or go to another page.
                    </p>
                  </div>
                ) : (
                  <div className="py-10 text-center">
                    <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
                    <h3 className="mt-4 text-xl font-semibold">No Documents Found</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Upload a new document to get started.
                    </p>
                  </div>
                )
              )}
              {totalPages > 1 && !isLoading && (
                <div className="flex items-center justify-between pt-6 mt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage <= 1 || isLoading}
                  >
                    <ChevronLeft className="mr-2 h-4 w-4" />
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage >= totalPages || isLoading}
                  >
                    Next
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
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
