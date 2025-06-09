
'use server';

import pool from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import type { Notification } from '@/types';
import type { RowDataPacket, PoolConnection } from 'mysql2/promise';

export async function fetchNotificationsFromDB(): Promise<Notification[]> {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id, userId, type, title, description, date, \`read\`, priority, relatedTaskId, relatedDocumentId, relatedRequestId FROM notifications ORDER BY date DESC'
    );
    return rows.map(row => ({
      ...row,
      date: new Date(row.date),
      read: Boolean(row.read), 
      priority: row.priority as Notification['priority'],
      type: row.type as Notification['type'],
    })) as Notification[];
  } catch (error: any) {
    console.error('Error fetching notifications from DB:', error);
    throw new Error(`Failed to fetch notifications: ${error.message}`);
  }
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) as count FROM notifications WHERE \`read\` = FALSE"
    );
    return rows[0].count || 0;
  } catch (error: any) {
    console.error('Error fetching unread notification count:', error);
    return 0; 
  }
}

export async function createNotificationInDB(
  data: Omit<Notification, 'id' | 'date' | 'read'>,
  existingConnection?: PoolConnection
): Promise<{ success: boolean; notificationId?: string; error?: string }> {
  const notificationId = uuidv4();
  const query = `
    INSERT INTO notifications (id, userId, type, title, description, priority, relatedTaskId, relatedDocumentId, relatedRequestId, date, \`read\`)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), FALSE)
  `;
  const connection = existingConnection || pool;
  try {
    await connection.execute(query, [
      notificationId,
      data.userId || null,
      data.type,
      data.title,
      data.description,
      data.priority,
      data.relatedTaskId || null,
      data.relatedDocumentId || null,
      data.relatedRequestId || null,
    ]);
    return { success: true, notificationId };
  } catch (error: any) {
    console.error('Error creating notification in DB:', error);
    return { success: false, error: `Failed to create notification: ${error.message}` };
  } finally {
    if (!existingConnection && connection !== pool && 'release' in connection) {
      (connection as PoolConnection).release();
    }
  }
}

export async function markNotificationAsReadInDB(
  notificationId: string
): Promise<{ success: boolean; error?: string }> {
  const query = 'UPDATE notifications SET \`read\` = TRUE WHERE id = ?';
  try {
    const [result] = await pool.execute(query, [notificationId]);
    // @ts-ignore
    if (result.affectedRows === 0) {
      return { success: false, error: 'Notification not found or no change made.' };
    }
    return { success: true };
  } catch (error: any) {
    console.error('Error marking notification as read:', error);
    return { success: false, error: `Failed to mark as read: ${error.message}` };
  }
}

export async function deleteNotificationFromDB(
  notificationId: string
): Promise<{ success: boolean; error?: string }> {
  const query = 'DELETE FROM notifications WHERE id = ?';
  try {
    const [result] = await pool.execute(query, [notificationId]);
    // @ts-ignore
    if (result.affectedRows === 0) {
      return { success: false, error: 'Notification not found.' };
    }
    return { success: true };
  } catch (error: any) {
    console.error('Error deleting notification:', error);
    return { success: false, error: `Failed to delete notification: ${error.message}` };
  }
}

export async function markAllNotificationsAsReadInDB(): Promise<{ success: boolean; error?: string, affectedRows?: number }> {
  const query = 'UPDATE notifications SET \`read\` = TRUE WHERE \`read\` = FALSE'; 
  try {
    const [result] = await pool.execute(query);
    // @ts-ignore
    return { success: true, affectedRows: result.affectedRows };
  } catch (error: any) {
    console.error('Error marking all notifications as read:', error);
    return { success: false, error: `Failed to mark all as read: ${error.message}` };
  }
}

export async function clearAllNotificationsFromDB(): Promise<{ success: boolean; error?: string, affectedRows?: number }> {
  const query = 'DELETE FROM notifications';
  try {
    const [result] = await pool.execute(query);
    // @ts-ignore
    return { success: true, affectedRows: result.affectedRows };
  } catch (error: any) {
    console.error('Error clearing all notifications:', error);
    return { success: false, error: `Failed to clear all notifications: ${error.message}` };
  }
}
