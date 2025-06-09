
import { BellRing } from 'lucide-react';
import { fetchNotificationsFromDB } from '@/actions/notificationActions';
import type { Notification } from '@/types';
import { NotificationListClient } from '@/components/notifications/NotificationListClient';

export default async function NotificationsPage() {
  const initialNotifications: Notification[] = await fetchNotificationsFromDB();

  return (
    <div className="container mx-auto px-4 md:px-6 py-6">
      <header className="mb-8 mt-0">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BellRing className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight text-foreground mt-0">Notifikasi Cerdas</h1>
          </div>
        </div>
        <p className="mt-2 text-muted-foreground">
          Tetap terbarui dengan tugas penting, perubahan dokumen, dan peringatan sistem dari basis data.
        </p>
      </header>

      <NotificationListClient initialNotifications={initialNotifications} />
      
    </div>
  );
}
