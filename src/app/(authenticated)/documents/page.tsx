
// Removed 'use client'; to make it a Server Component by default

import type { Document } from '@/types';
import { Button } from '@/components/ui/button';
import { FilePlus, FileText } from 'lucide-react';
import Link from 'next/link';
import pool from '@/lib/db'; // Import the database pool
import { DocumentListClient } from '@/components/documents/DocumentListClient'; // Import the new client component

// Helper function to safely parse JSON strings (like tags) from the database
function parseJsonStringSafe(jsonString: string | null | undefined): string[] | undefined {
  if (!jsonString) return undefined;
  try {
    const parsed = JSON.parse(jsonString);
    // Ensure it's an array of strings, or return undefined
    if (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) {
      return parsed;
    }
    // If it parsed but isn't an array of strings, maybe it's a single tag stringified
    if (typeof parsed === 'string') return [parsed]; 
    return undefined;
  } catch (error) {
    // If JSON parsing fails, and it's a string, try to split by comma as a fallback for non-JSON tags
    if (typeof jsonString === 'string') {
        const tags = jsonString.split(',').map(tag => tag.trim()).filter(tag => tag);
        return tags.length > 0 ? tags : undefined;
    }
    console.warn('Failed to parse tags from DB:', jsonString, error);
    return undefined;
  }
}


async function fetchDocumentsFromDB(): Promise<Document[]> {
  try {
    // Ensure your 'documents' table and columns match this query
    const [rows] = await pool.query('SELECT id, name, type, status, dateUploaded, lastModified, fileSize, version, tags, contentPreview, ownCloudPath FROM documents ORDER BY dateUploaded DESC');
    
    return (rows as any[]).map(row => ({
      id: row.id,
      name: row.name,
      type: row.type,
      status: row.status as Document['status'], // Ensure this matches the enum in your types/Document
      dateUploaded: new Date(row.dateUploaded),
      lastModified: new Date(row.lastModified),
      fileSize: row.fileSize || 'N/A',
      version: row.version || 1,
      tags: parseJsonStringSafe(row.tags), // Parse tags safely
      contentPreview: row.contentPreview || undefined,
      ownCloudPath: row.ownCloudPath || undefined,
    }));
  } catch (error) {
    console.error("Failed to fetch documents from DB:", error);
    // Depending on how you want to handle DB errors, you might throw or return empty
    return []; 
  }
}


export default async function DocumentsPage() {
  const documentsFromDB = await fetchDocumentsFromDB();

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

      <DocumentListClient initialDocuments={documentsFromDB} />
      
    </div>
  );
}
