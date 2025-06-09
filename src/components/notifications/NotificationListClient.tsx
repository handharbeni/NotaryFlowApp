
'use client';

import { useState, useEffect, useMemo } from 'react';
import type { Notification } from '@/types';
import { NotificationItem } from '@/components/notifications/NotificationItem';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { BellRing, Search, Filter, Trash2, CheckCheck, AlertTriangle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { 
    markNotificationAsReadInDB,
    deleteNotificationFromDB,
    markAllNotificationsAsReadInDB,
    clearAllNotificationsFromDB
} from '@/actions/notificationActions';

interface NotificationListClientProps {
  initialNotifications: Notification[];
}

const ALL_TYPES = 'ALL_TYPES_PLACEHOLDER';
const ALL_STATUSES = 'ALL_STATUSES_PLACEHOLDER';

export function NotificationListClient({ initialNotifications }: NotificationListClientProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState(ALL_TYPES);
  const [statusFilter, setStatusFilter] = useState(ALL_STATUSES);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState<Record<string, boolean>>({});


  useEffect(() => {
    setNotifications(initialNotifications.map(n => ({...n, date: new Date(n.date)})));
  }, [initialNotifications]);

  const handleMarkAsRead = async (id: string) => {
    setIsProcessing(prev => ({ ...prev, [id]: true }));
    const result = await markNotificationAsReadInDB(id);
    if (result.success) {
      toast({ title: 'Notifikasi Ditandai Sudah Dibaca' });
      router.refresh(); 
    } else {
      toast({ title: 'Error', description: result.error || 'Gagal menandai sudah dibaca.', variant: 'destructive' });
    }
    setIsProcessing(prev => ({ ...prev, [id]: false }));
  };

  const handleDelete = async (id: string) => {
    setIsProcessing(prev => ({ ...prev, [id]: true }));
    const result = await deleteNotificationFromDB(id);
    if (result.success) {
      toast({ title: 'Notifikasi Dihapus' });
      router.refresh();
    } else {
      toast({ title: 'Error', description: result.error || 'Gagal menghapus notifikasi.', variant: 'destructive' });
    }
    setIsProcessing(prev => ({ ...prev, [id]: false }));
  };

  const handleMarkAllAsRead = async () => {
    setIsLoading(true);
    const result = await markAllNotificationsAsReadInDB();
    if (result.success) {
      toast({ title: `Menandai ${result.affectedRows || 0} Notifikasi Sudah Dibaca` });
      router.refresh();
    } else {
      toast({ title: 'Error', description: result.error || 'Gagal menandai semua sudah dibaca.', variant: 'destructive' });
    }
    setIsLoading(false);
  };

  const handleClearAll = async () => {
    setIsLoading(true);
    setShowClearAllConfirm(false);
    const result = await clearAllNotificationsFromDB();
    if (result.success) {
      toast({ title: `Menghapus ${result.affectedRows || 0} Notifikasi` });
      router.refresh();
    } else {
      toast({ title: 'Error', description: result.error || 'Gagal menghapus semua notifikasi.', variant: 'destructive' });
    }
    setIsLoading(false);
  };

  const uniqueNotificationTypes = useMemo(() => {
    const types = new Set(notifications.map(n => n.type));
    return Array.from(types);
  }, [notifications]);

  const filteredNotifications = useMemo(() => {
    return notifications.filter(n => {
      const matchesSearch = searchTerm.trim() === '' ||
        n.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        n.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = typeFilter === ALL_TYPES || n.type === typeFilter;
      const matchesStatus = statusFilter === ALL_STATUSES ||
        (statusFilter === 'unread' && !n.read) ||
        (statusFilter === 'read' && n.read);
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [notifications, searchTerm, typeFilter, statusFilter]);

  return (
    <>
      <Card className="shadow-lg mb-8">
        <CardContent className="p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-3">
            <div className="relative md:col-span-1 lg:col-span-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input 
                placeholder="Cari notifikasi..." 
                className="pl-10" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter} disabled={isLoading}>
              <SelectTrigger>
                <SelectValue placeholder="Filter berdasarkan Tipe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_TYPES}>Semua Tipe</SelectItem>
                {uniqueNotificationTypes.map(type => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter} disabled={isLoading}>
              <SelectTrigger>
                <SelectValue placeholder="Filter berdasarkan Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_STATUSES}>Semua Status</SelectItem>
                <SelectItem value="unread">Belum Dibaca</SelectItem>
                <SelectItem value="read">Sudah Dibaca</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="flex justify-center items-center py-10">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="ml-2 text-muted-foreground">Memproses...</p>
        </div>
      )}

      {!isLoading && filteredNotifications.length > 0 ? (
        <div className="space-y-4">
          {filteredNotifications.map((notification) => (
            <NotificationItem 
              key={notification.id} 
              notification={notification} 
              onMarkAsRead={handleMarkAsRead}
              onDelete={handleDelete}
              isProcessing={isProcessing[notification.id] || false}
            />
          ))}
        </div>
      ) : !isLoading && (
        <Card className="shadow-md">
          <CardContent className="p-10 text-center">
            <BellRing className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-xl font-semibold text-foreground">
              {notifications.length > 0 ? 'Tidak Ada Notifikasi yang Cocok' : 'Tidak Ada Notifikasi'}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {notifications.length > 0 ? 'Coba sesuaikan kriteria pencarian atau filter Anda.' : "Anda sudah terbarui! (Atau tidak ada notifikasi di DB)"}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="mt-8 flex justify-end gap-2 flex-wrap">
        <Button 
            variant="outline" 
            onClick={handleMarkAllAsRead} 
            disabled={isLoading || notifications.every(n => n.read) || notifications.length === 0}
        >
          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCheck className="mr-2 h-4 w-4" />} 
          Tandai semua sudah dibaca
        </Button>
        <AlertDialog open={showClearAllConfirm} onOpenChange={setShowClearAllConfirm}>
          <AlertDialogTrigger asChild>
            <Button 
                variant="destructive-outline" 
                disabled={isLoading || notifications.length === 0}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Bersihkan semua
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Apakah Anda yakin ingin membersihkan semua notifikasi?</AlertDialogTitle>
              <AlertDialogDescription>
                Tindakan ini tidak dapat dibatalkan dan akan menghapus semua notifikasi dari daftar Anda di basis data.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setShowClearAllConfirm(false)} disabled={isLoading}>Batal</AlertDialogCancel>
              <AlertDialogAction onClick={handleClearAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Bersihkan Semua Notifikasi
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  );
}
