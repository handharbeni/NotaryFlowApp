
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
      toast({ title: 'Notification Marked as Read' });
      router.refresh(); 
    } else {
      toast({ title: 'Error', description: result.error || 'Failed to mark as read.', variant: 'destructive' });
    }
    setIsProcessing(prev => ({ ...prev, [id]: false }));
  };

  const handleDelete = async (id: string) => {
    setIsProcessing(prev => ({ ...prev, [id]: true }));
    const result = await deleteNotificationFromDB(id);
    if (result.success) {
      toast({ title: 'Notification Deleted' });
      router.refresh();
    } else {
      toast({ title: 'Error', description: result.error || 'Failed to delete notification.', variant: 'destructive' });
    }
    setIsProcessing(prev => ({ ...prev, [id]: false }));
  };

  const handleMarkAllAsRead = async () => {
    setIsLoading(true);
    const result = await markAllNotificationsAsReadInDB();
    if (result.success) {
      toast({ title: `Marked ${result.affectedRows || 0} Notifications as Read` });
      router.refresh();
    } else {
      toast({ title: 'Error', description: result.error || 'Failed to mark all as read.', variant: 'destructive' });
    }
    setIsLoading(false);
  };

  const handleClearAll = async () => {
    setIsLoading(true);
    setShowClearAllConfirm(false);
    const result = await clearAllNotificationsFromDB();
    if (result.success) {
      toast({ title: `Cleared ${result.affectedRows || 0} Notifications` });
      router.refresh();
    } else {
      toast({ title: 'Error', description: result.error || 'Failed to clear all notifications.', variant: 'destructive' });
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
                placeholder="Search notifications..." 
                className="pl-10" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter} disabled={isLoading}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_TYPES}>All Types</SelectItem>
                {uniqueNotificationTypes.map(type => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter} disabled={isLoading}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_STATUSES}>All Statuses</SelectItem>
                <SelectItem value="unread">Unread</SelectItem>
                <SelectItem value="read">Read</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="flex justify-center items-center py-10">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="ml-2 text-muted-foreground">Processing...</p>
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
              {notifications.length > 0 ? 'No Matching Notifications' : 'No Notifications'}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {notifications.length > 0 ? 'Try adjusting your search or filter criteria.' : "You're all caught up! (Or no notifications in DB)"}
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
          Mark all as read
        </Button>
        <AlertDialog open={showClearAllConfirm} onOpenChange={setShowClearAllConfirm}>
          <AlertDialogTrigger asChild>
            <Button 
                variant="destructive-outline" 
                disabled={isLoading || notifications.length === 0}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Clear all
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure you want to clear all notifications?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone and will remove all notifications from your list in the database.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setShowClearAllConfirm(false)} disabled={isLoading}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleClearAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Clear All Notifications
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  );
}

    