
'use client';

import { useState, useEffect } from 'react';
import type { Task } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, Hash, ArchiveIcon, CalendarDays, User, AlertTriangle, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { id as localeID } from 'date-fns/locale';

interface ArchivedTaskListClientProps {
  initialTasks: Task[];
}

export function ArchivedTaskListClient({ initialTasks }: ArchivedTaskListClientProps) {
  const [archivedTasks, setArchivedTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    const processedTasks = initialTasks.map(task => ({
      ...task,
      dueDate: new Date(task.dueDate),
      updatedAt: task.updatedAt ? new Date(task.updatedAt) : new Date(0), // Archival date
    }));
    setArchivedTasks(processedTasks);
    setIsLoading(false);
  }, [initialTasks]);

  const getPriorityBadgeVariant = (priority: Task['priority']) => {
    switch (priority) {
      case 'Low': return 'outline';
      case 'Medium': return 'secondary';
      case 'High': return 'destructive';
      default: return 'outline';
    }
  };
  
  if (isLoading) {
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Daftar Tugas Diarsipkan</CardTitle>
          <CardDescription>Memuat tugas yang diarsipkan...</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center items-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }


  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle>Daftar Tugas Diarsipkan</CardTitle>
        <CardDescription>Menampilkan {archivedTasks.length} tugas yang telah diarsipkan.</CardDescription>
      </CardHeader>
      <CardContent>
        {archivedTasks.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Judul</TableHead>
                <TableHead className="flex items-center gap-1"><Hash className="h-4 w-4" />Nomor Akta</TableHead>
                <TableHead>Prioritas</TableHead>
                <TableHead className="flex items-center gap-1"><CalendarDays className="h-4 w-4" />Tanggal Diarsipkan</TableHead>
                <TableHead className="flex items-center gap-1"><User className="h-4 w-4" />Ditugaskan Kepada (Saat Diarsipkan)</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {archivedTasks.map((task) => (
                <TableRow key={task.id} className="hover:bg-muted/50">
                  <TableCell className="font-medium">
                     <Link href={`/tasks/${task.id}/edit`} className="hover:underline text-primary">
                        {task.title}
                      </Link>
                  </TableCell>
                  <TableCell>
                    {task.jobNumber ? (
                        <Badge variant="outline" className="text-xs flex items-center gap-1">
                            <Hash className="h-3 w-3"/> {task.jobNumber}
                        </Badge>
                    ) : (
                        <span className="text-xs text-muted-foreground">N/A</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getPriorityBadgeVariant(task.priority)}>{task.priority}</Badge>
                  </TableCell>
                  <TableCell suppressHydrationWarning>{task.updatedAt ? format(task.updatedAt, 'PPP p', { locale: localeID }) : 'N/A'}</TableCell>
                  <TableCell>{task.assignedToName || task.assignedTo || 'Tidak Ditugaskan'}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/tasks/${task.id}/edit`}>
                        <Eye className="mr-1 h-3 w-3" /> Lihat Detail
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="py-10 text-center">
            <ArchiveIcon className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-xl font-semibold">Tidak Ada Tugas Diarsipkan</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Tidak ada tugas yang ditemukan dalam arsip.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
