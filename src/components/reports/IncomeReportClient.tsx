
'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { id as localeID } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, Loader2, Search, Activity, ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchActivityReportData } from '@/actions/reportActions';
import type { ActivityReportData, ActivityReportItem } from '@/types';
import { StatisticCard } from '@/components/dashboard/StatisticCard';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';

interface ActivityReportClientProps {
  initialData: ActivityReportData;
}

export function IncomeReportClient({ initialData }: ActivityReportClientProps) {
  const { toast } = useToast();
  const [reportData, setReportData] = useState<ActivityReportData>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [startDate, setStartDate] = useState<Date | undefined>(new Date(initialData.startDate + 'T00:00:00'));
  const [endDate, setEndDate] = useState<Date | undefined>(new Date(initialData.endDate + 'T00:00:00'));

  useEffect(() => {
    setReportData({
        ...initialData,
        newTasks: initialData.newTasks.map(task => ({
            ...task,
            createdAt: new Date(task.createdAt)
        }))
    });
    setStartDate(new Date(initialData.startDate + 'T00:00:00'));
    setEndDate(new Date(initialData.endDate + 'T00:00:00'));
  }, [initialData]);

  const handleGenerateReport = async () => {
    if (!startDate || !endDate) {
      toast({ title: 'Error', description: 'Silakan pilih tanggal mulai dan tanggal selesai.', variant: 'destructive' });
      return;
    }
    if (endDate < startDate) {
      toast({ title: 'Error', description: 'Tanggal selesai tidak boleh sebelum tanggal mulai.', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      const fetchedData = await fetchActivityReportData(
        format(startDate, 'yyyy-MM-dd'),
        format(endDate, 'yyyy-MM-dd')
      );
      setReportData({
        ...fetchedData,
        newTasks: fetchedData.newTasks.map(task => ({
            ...task,
            createdAt: new Date(task.createdAt)
        }))
      });
      toast({ title: 'Laporan Dibuat', description: `Menampilkan data untuk ${format(startDate, 'PPP', { locale: localeID })} - ${format(endDate, 'PPP', { locale: localeID })}.` });
    } catch (error: any) {
      toast({ title: 'Gagal Membuat Laporan', description: error.message || 'Terjadi kesalahan.', variant: 'destructive' });
    }
    setIsLoading(false);
  };

  const getStatusBadgeVariant = (status: ActivityReportItem['status']) => {
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
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Filter Laporan</CardTitle>
          <CardDescription>Pilih rentang tanggal untuk laporan aktivitas.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 items-end">
          <div className="space-y-1">
            <label htmlFor="startDate" className="text-sm font-medium">Tanggal Mulai</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="startDate"
                  variant={"outline"}
                  className={cn("w-full justify-start text-left font-normal", !startDate && "text-muted-foreground")}
                  disabled={isLoading}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate ? format(startDate, "PPP", { locale: localeID }) : <span>Pilih tanggal</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={startDate} onSelect={setStartDate} initialFocus />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1">
            <label htmlFor="endDate" className="text-sm font-medium">Tanggal Selesai</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="endDate"
                  variant={"outline"}
                  className={cn("w-full justify-start text-left font-normal", !endDate && "text-muted-foreground")}
                  disabled={isLoading}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {endDate ? format(endDate, "PPP", { locale: localeID }) : <span>Pilih tanggal</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={endDate} onSelect={setEndDate} initialFocus disabled={(date) => startDate && date < startDate} />
              </PopoverContent>
            </Popover>
          </div>
          <Button onClick={handleGenerateReport} disabled={isLoading || !startDate || !endDate} className="w-full sm:w-auto">
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            Buat Laporan
          </Button>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="flex justify-center items-center py-10">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      )}

      {!isLoading && reportData && (
        <>
          <Card className="shadow-md">
            <CardHeader>
                <CardTitle>Ringkasan Laporan Aktivitas</CardTitle>
                <CardDescription>
                    Data untuk periode {startDate ? format(startDate, 'PPP', {locale: localeID}) : 'N/A'} sampai {endDate ? format(endDate, 'PPP', {locale: localeID}) : 'N/A'}.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <StatisticCard
                    title="Total Tugas Baru Dibuat"
                    value={reportData.totalNewTasks.toString()}
                    icon={ListChecks}
                    description="Jumlah tugas yang dibuat dalam periode ini."
                />
            </CardContent>
          </Card>

          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>Detail Tugas Baru</CardTitle>
              <CardDescription>Daftar tugas yang dibuat dalam periode yang dipilih.</CardDescription>
            </CardHeader>
            <CardContent>
              {reportData.newTasks.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Judul Tugas</TableHead>
                      <TableHead>Tanggal Dibuat</TableHead>
                      <TableHead>Status Saat Ini</TableHead>
                      <TableHead>Prioritas</TableHead>
                      <TableHead>Ditugaskan Kepada</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.newTasks.map((task) => (
                      <TableRow key={task.id}>
                        <TableCell className="font-medium">{task.title}</TableCell>
                        <TableCell suppressHydrationWarning>{format(task.createdAt, 'PPP p', { locale: localeID })}</TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadgeVariant(task.status)}>{task.status}</Badge>
                        </TableCell>
                        <TableCell>{task.priority}</TableCell>
                        <TableCell>{task.assignedToName || 'N/A'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground text-center py-4">Tidak ada tugas baru yang dibuat dalam periode ini.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
