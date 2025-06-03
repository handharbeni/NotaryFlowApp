
import type { Document } from '@/types';
import pool from '@/lib/db';
import { notFound } from 'next/navigation';
import { DocumentDetailClient } from '@/components/documents/DocumentDetailClient';

// Helper function to safely parse JSON strings (like tags) from the database
// This function is safe to be in a Server Component file as it doesn't use client-only APIs
function parseJsonStringSafe(jsonString: string | null | undefined): string[] | undefined {
  if (!jsonString) return undefined;
  try {
    const parsed = JSON.parse(jsonString);
    if (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) {
      return parsed;
    }
    if (typeof parsed === 'string') return [parsed]; // Handle case where a single tag might be stored as a simple string
    return undefined;
  } catch (error) {
    // Fallback for non-JSON comma-separated tags
    if (typeof jsonString === 'string') {
        const tags = jsonString.split(',').map(tag => tag.trim()).filter(tag => tag);
        return tags.length > 0 ? tags : undefined;
    }
    console.warn('Failed to parse tags from DB (detail page server):', jsonString, error);
    return undefined;
  }
}

async function getDocumentFromDB(documentId: string): Promise<Document | null> {
  if (!documentId) return null;
  try {
    const [rows]: [any[], any] = await pool.query(
      'SELECT id, name, type, status, dateUploaded, lastModified, fileSize, version, tags, contentPreview, ownCloudPath FROM documents WHERE id = ?',
      [documentId]
    );
    if (rows.length === 0) {
      return null;
    }
    const row = rows[0];
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      status: row.status as Document['status'],
      dateUploaded: new Date(row.dateUploaded),
      lastModified: new Date(row.lastModified),
      fileSize: row.fileSize || 'N/A',
      version: row.version || 1,
      tags: parseJsonStringSafe(row.tags),
      contentPreview: row.contentPreview || undefined,
      ownCloudPath: row.ownCloudPath || undefined,
    };
  } catch (error) {
    console.error(`Failed to fetch document ${documentId} from DB:`, error);
    // In a real app, you might want to log this error to a monitoring service
    return null;
  }
}

export default async function DocumentDetailPageWrapper({ params }: { params: { id: string } }) {
  const documentId = params.id;
  const document = await getDocumentFromDB(documentId);

  if (!document) {
    notFound();
  }

  return <DocumentDetailClient initialDocument={document} />;
}
