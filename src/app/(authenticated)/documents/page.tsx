
import type { PaginatedDocumentsResponse } from '@/types';
import { Button } from '@/components/ui/button';
import { FilePlus, FileText } from 'lucide-react';
import Link from 'next/link';
import { DocumentListClient } from '@/components/documents/DocumentListClient';
import { fetchPaginatedDocuments } from '@/actions/documentActions';

const ITEMS_PER_PAGE = 10; // Define how many items per page

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams?: {
    page?: string;
    keyword?: string;
    documentType?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  };
}) {
  const currentPage = Number(searchParams?.page) || 1;
  const filters = {
    keyword: searchParams?.keyword,
    documentType: searchParams?.documentType,
    status: searchParams?.status,
    dateFrom: searchParams?.dateFrom,
    dateTo: searchParams?.dateTo,
  };

  const paginatedData: PaginatedDocumentsResponse = await fetchPaginatedDocuments({
    page: currentPage,
    limit: ITEMS_PER_PAGE,
    ...filters,
  });

  return (
    <div className="container mx-auto px-4 md:px-6 py-6">
      <header className="mb-8 mt-0">
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div className="flex items-center gap-3">
            <FileText className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight text-foreground mt-0">Document Management</h1>
          </div>
          <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Link href="/documents/new">
              <FilePlus className="mr-2 h-4 w-4" /> Upload New Document
            </Link>
          </Button>
        </div>
        <p className="mt-2 text-muted-foreground">
          Securely upload, search, and manage your notarial documents.
        </p>
      </header>

      <DocumentListClient
        initialPaginatedData={paginatedData}
        itemsPerPage={ITEMS_PER_PAGE}
        initialFilters={filters}
      />
      
    </div>
  );
}
