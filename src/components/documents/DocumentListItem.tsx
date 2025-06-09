
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { FileText, Eye, Edit3, Download, Trash2, MoreVertical, Tag, CalendarDays, Info, GitBranch, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { id as localeID } from 'date-fns/locale';
import Link from 'next/link'; 
import type { Document } from '@/types'; 
import { useState, useEffect } from 'react';

interface DocumentListItemProps {
  document: Document;
  onDelete: (documentId: string) => void; 
}

const statusColors: { [key: string]: string } = {
  Draft: 'bg-gray-500 hover:bg-gray-600',
  'Pending Review': 'bg-yellow-500 hover:bg-yellow-600',
  Notarized: 'bg-green-500 hover:bg-green-600',
  Archived: 'bg-slate-500 hover:bg-slate-600',
};

export function DocumentListItem({ document, onDelete }: DocumentListItemProps) {
  const [formattedDateUploaded, setFormattedDateUploaded] = useState<string | null>(null);
  const [formattedLastModified, setFormattedLastModified] = useState<string | null>(null);

  useEffect(() => {
    setFormattedDateUploaded(format(new Date(document.dateUploaded), 'MMM d, yyyy', { locale: localeID }));
    setFormattedLastModified(format(new Date(document.lastModified), 'MMM d, yyyy', { locale: localeID }));
  }, [document.dateUploaded, document.lastModified]);

  return (
    <Card className="hover:shadow-md transition-shadow duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <FileText className="h-6 w-6 text-primary flex-shrink-0" />
            <Link href={`/documents/${document.id}`} passHref legacyBehavior>
              <a className="text-lg leading-tight hover:underline cursor-pointer font-medium text-foreground">
                <CardTitle className="text-lg leading-tight"> 
                  {document.name}
                </CardTitle>
              </a>
            </Link>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
                <span className="sr-only">More actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/documents/${document.id}`}><Eye className="mr-2 h-4 w-4" />View Details</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/documents/${document.id}/edit`}><Edit3 className="mr-2 h-4 w-4" />Edit Details</Link>
              </DropdownMenuItem>
              <DropdownMenuItem><Download className="mr-2 h-4 w-4" />Download</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                className="text-destructive focus:text-destructive focus:bg-destructive/10"
                onClick={() => onDelete(document.id)} 
              >
                <Trash2 className="mr-2 h-4 w-4" />Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4" />
          <span>Type: {document.type}</span>
          <span className="mx-1">|</span>
          <Badge variant="outline" className={`${statusColors[document.status] || 'bg-gray-400'} text-white border-none text-xs`}>
            {document.status}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4" />
          <span>Uploaded: {formattedDateUploaded || <Loader2 className="h-3 w-3 animate-spin inline-block" />}</span>
          <span className="mx-1">|</span>
          <span>Modified: {formattedLastModified || <Loader2 className="h-3 w-3 animate-spin inline-block" />}</span>
        </div>
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4" />
          <span>Version: {document.version}</span>
          <span className="mx-1">|</span>
          <span>Size: {document.fileSize}</span>
        </div>
        {document.tags && document.tags.length > 0 && (
          <div className="flex items-start gap-2 pt-1">
            <Tag className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div className="flex flex-wrap gap-1">
              {document.tags.map(tag => (
                <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
