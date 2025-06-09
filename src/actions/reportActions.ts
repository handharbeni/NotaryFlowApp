
'use server';

import pool from '@/lib/db';
import type { RowDataPacket } from 'mysql2';
import type { ActivityReportData, ActivityReportItem } from '@/types';

export async function fetchActivityReportData(
  startDate: string, // Expect ISO string e.g., YYYY-MM-DD
  endDate: string    // Expect ISO string e.g., YYYY-MM-DD
): Promise<ActivityReportData> {
  if (!startDate || !endDate) {
    return {
      totalNewTasks: 0,
      newTasks: [],
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
    };
  }

  const connection = await pool.getConnection();
  try {
    // Adjust endDate to include the whole day for createdAt comparison
    const endDateAdjusted = new Date(endDate);
    endDateAdjusted.setDate(endDateAdjusted.getDate() + 1);
    const endDateQueryParam = endDateAdjusted.toISOString().split('T')[0];

    const query = `
      SELECT
        t.id,
        t.title,
        t.createdAt,
        t.status,
        t.priority,
        u.name AS assignedToName,
        u.username AS assignedToUsername
      FROM tasks t
      LEFT JOIN users u ON t.assignedTo = u.id
      WHERE
        t.createdAt >= ? AND
        t.createdAt < ? 
      ORDER BY t.createdAt DESC;
    `;
    
    const [rows] = await connection.query<RowDataPacket[]>(query, [startDate, endDateQueryParam]);

    const newTasks: ActivityReportItem[] = rows.map(row => ({
      id: row.id,
      title: row.title,
      createdAt: new Date(row.createdAt),
      status: row.status,
      priority: row.priority,
      assignedToName: row.assignedToName || row.assignedToUsername || 'N/A',
    }));
    
    return {
      totalNewTasks: newTasks.length,
      newTasks,
      startDate,
      endDate,
    };

  } catch (error: any) {
    console.error('Error fetching activity report data:', error);
    return {
      totalNewTasks: 0,
      newTasks: [],
      startDate,
      endDate,
    };
  } finally {
    connection.release();
  }
}
