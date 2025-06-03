
'use client';

import type { Notification } from '@/types'; 
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { Check, Eye, Trash2, AlertTriangle, Info, Bell, Loader2 } from 'lucide-react';

interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead: (id: string) => Promise<void>; // Now async
  onDelete: (id: string) => Promise<void>; // Now async
  isProcessing?: boolean;
}

const priorityStyles: Record<Notification['priority'], string> = {
  low: 'border-blue-500 bg-blue-500/10',
  medium: 'border-yellow-500 bg-yellow-500/10',
  high: 'border-red-500 bg-red-500/10',
};

const priorityIcon: Record<Notification['priority'], JSX.Element> = {
  low: <Info className="h-4 w-4 text-blue-500" />,
  medium: <AlertTriangle className="h-4 w-4 text-yellow-500" />,
  high: <Bell className="h-4 w-4 text-red-500" />,
}

export function NotificationItem({ notification, onMarkAsRead, onDelete, isProcessing }: NotificationItemProps) {
  const timeAgo = formatDistanceToNow(new Date(notification.date), { addSuffix: true });

  return (
    <Card className={cn(
      "shadow-md transition-all duration-300 hover:shadow-lg",
      notification.read ? 'bg-card/70 opacity-80' : 'bg-card',
      notification.priority && priorityStyles[notification.priority]
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {notification.priority && priorityIcon[notification.priority]}
            <CardTitle className="text-lg">{notification.title}</CardTitle>
          </div>
          {!notification.read && <Badge variant="default" className="bg-accent text-accent-foreground">New</Badge>}
        </div>
        <CardDescription className="text-xs text-muted-foreground">
          {notification.type} &bull; <span suppressHydrationWarning>{timeAgo}</span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-foreground">{notification.description}</p>
      </CardContent>
      <CardFooter className="flex justify-end gap-2 pt-3">
        {/* In a real app, this button might trigger actions like navigation based on relatedTaskId/DocumentId */}
        <Button variant="outline" size="sm" onClick={() => console.log('View notification details:', notification.id)} disabled={isProcessing}>
          <Eye className="mr-2 h-4 w-4" /> View Details
        </Button>
        {!notification.read && (
          <Button variant="default" size="sm" onClick={() => onMarkAsRead(notification.id)} disabled={isProcessing}>
            {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} 
            Mark as Read
          </Button>
        )}
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => onDelete(notification.id)} disabled={isProcessing}>
          {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          <span className="sr-only">Delete</span>
        </Button>
      </CardFooter>
    </Card>
  );
}

    