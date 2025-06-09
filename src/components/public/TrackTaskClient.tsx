
'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, Info, AlertTriangle, Hash, ListChecks, CheckCircle, CalendarDays } from 'lucide-react';
import { fetchPublicTaskStatusByJobNumber } from '@/actions/taskActions';
import type { PublicTaskStatusResult, PublicTaskDetail, PublicSubtaskDetail, Task } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { id as localeID } from 'date-fns/locale';
import { Separator } from '@/components/ui/separator';

const trackTaskFormSchema = z.object({
  jobNumber: z.string().min(1, { message: 'Nomor pekerjaan diperlukan.' }),
});

type TrackTaskFormValues = z.infer<typeof trackTaskFormSchema>;

export function TrackTaskClient() {
  const { toast } = useToast();
  const [taskDetails, setTaskDetails] = useState<PublicTaskDetail | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const form = useForm<TrackTaskFormValues>({
    resolver: zodResolver(trackTaskFormSchema),
    defaultValues: {
      jobNumber: '',
    },
  });

  async function onSubmit(values: TrackTaskFormValues) {
    setIsLoading(true);
    setTaskDetails(null);
    setMessage(null);
    setError(null);

    try {
      const result: PublicTaskStatusResult = await fetchPublicTaskStatusByJobNumber(values.jobNumber);
      if (result.task) {
        setTaskDetails(result.task);
      } else if (result.message) {
        setMessage(result.message);
      } else if (result.error) {
        setError(result.error);
        toast({ title: 'Error', description: result.error, variant: 'destructive' });
      } else {
        setError('Tidak ada tugas ditemukan atau terjadi error yang tidak diketahui.');
      }
    } catch (e: any) {
      setError('Terjadi kesalahan saat mengambil status tugas.');
      toast({ title: 'Error', description: e.message || 'Terjadi kesalahan.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }

  const getStatusBadgeVariant = (status: Task['status']) => {
    switch (status) {
      case 'To Do': return 'outline';
      case 'In Progress': return 'secondary';
      case 'Pending Review': return 'default';
      case 'Approved': return 'default';
      case 'Pending Notarization': return 'secondary';
      case 'Ready for Notarization': return 'default';
      case 'Notarization Complete': return 'default';
      case 'Archived': return 'outline';
      case 'Blocked': return 'destructive';
      default: return 'outline';
    }
  };


  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="w-full space-y-6">
          <FormField
            control={form.control}
            name="jobNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="sr-only">Nomor Pekerjaan</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Hash className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Masukkan Nomor Pekerjaan (cth: NA/2024/07/0001)"
                      {...field}
                      className="pl-10 text-base md:text-sm"
                      disabled={isLoading}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Mencari...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" /> Lacak Tugas
              </>
            )}
          </Button>
        </form>
      </Form>

      {isLoading && (
        <div className="mt-8 flex flex-col items-center justify-center text-muted-foreground">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="mt-2">Sedang mencari detail tugas...</p>
        </div>
      )}

      {taskDetails && !isLoading && (
        <Card className="mt-8 w-full shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <ListChecks className="h-6 w-6 text-primary" />
              Detail Progres Tugas
            </CardTitle>
            <CardDescription>Nomor Pekerjaan: <Badge variant="outline">{form.getValues('jobNumber')}</Badge></CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Judul Tugas:</p>
              <p className="text-lg font-semibold text-foreground">{taskDetails.title}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Status Tugas Utama:</p>
              <div className="text-lg font-medium text-foreground">
                <Badge variant={getStatusBadgeVariant(taskDetails.status)} className="text-lg px-3 py-1">
                  {taskDetails.status}
                </Badge>
              </div>
            </div>
            
            {taskDetails.subtasks && taskDetails.subtasks.length > 0 && (
              <div className="pt-4">
                <h3 className="text-md font-semibold text-foreground mb-3 border-b pb-2">Timeline Subtugas:</h3>
                <ul className="space-y-3">
                  {taskDetails.subtasks.map((subtask, index) => (
                    <li key={subtask.id} className="p-3 border rounded-md bg-muted/30">
                      <div className="flex justify-between items-start">
                        <p className="font-medium text-foreground">{index + 1}. {subtask.title}</p>
                        <Badge variant={getStatusBadgeVariant(subtask.status)} className="text-xs">
                          {subtask.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        Tenggat: {format(new Date(subtask.dueDate), 'PPP', { locale: localeID })}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {taskDetails.subtasks && taskDetails.subtasks.length === 0 && (
                <p className="text-sm text-muted-foreground italic">Tidak ada subtugas untuk tugas utama ini.</p>
            )}
          </CardContent>
        </Card>
      )}

      {message && !isLoading && (
        <Card className="mt-8 w-full shadow-md bg-blue-50 border-blue-200">
          <CardContent className="p-6 flex items-center gap-3">
            <Info className="h-6 w-6 text-blue-600" />
            <p className="text-blue-700">{message}</p>
          </CardContent>
        </Card>
      )}

      {error && !isLoading && (
        <Card className="mt-8 w-full shadow-md bg-red-50 border-red-200">
          <CardContent className="p-6 flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-red-600" />
            <p className="text-red-700">{error}</p>
          </CardContent>
        </Card>
      )}
    </>
  );
}
