
'use server';

import pool from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import type { TaskFormValues } from '@/components/tasks/TaskForm'; 
import type { Task, UserRole } from '@/types'; 
import type { RowDataPacket, PoolConnection } from 'mysql2/promise';
import { createNotificationInDB } from '@/actions/notificationActions';


export async function fetchActionableTasksCountForUser(userId: string, role: UserRole): Promise<number> {
  let query = 'SELECT COUNT(*) as count FROM tasks WHERE ';
  const params: (string | string[])[] = [];

  switch (role) {
    case 'admin': 
      query += "status != 'Archived'"; 
      break;
    case 'manager':
      query += "(status = 'Pending Review' OR (assignedTo = ? AND (status = 'To Do' OR status = 'In Progress')))";
      params.push(userId);
      break;
    case 'staff':
      query += "(status = 'To Do' OR status = 'In Progress') AND assignedTo = ?";
      params.push(userId);
      break;
    case 'cs':
      query += "((status = 'To Do' AND (assignedTo = ? OR assignedTo IS NULL)) OR status = 'Approved' OR status = 'Notarization Complete')";
      params.push(userId);
      break;
    case 'notary':
      query += "status = 'Pending Notarization' AND (assignedTo IS NULL OR assignedTo = ?)";
      params.push(userId); 
      break;
    default:
      return 0; 
  }

  try {
    const [rows] = await pool.query<RowDataPacket[]>(query, params);
    return rows[0].count || 0;
  } catch (error: any) {
    console.error(`Error fetching actionable tasks count for role ${role}, user ${userId}:`, error);
    return 0;
  }
}


export async function createTaskInDB(values: TaskFormValues): Promise<{ success: boolean; error?: string; taskId?: string }> {
  const taskId = uuidv4();
  const { title, description, status, dueDate, assignedTo, priority, primaryDocumentId, supportingDocumentIds } = values;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const taskQuery = `
      INSERT INTO tasks (id, title, description, status, dueDate, assignedTo, priority, primary_document_id, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;
    const finalPrimaryDocumentId = (primaryDocumentId && primaryDocumentId.trim() !== '' && primaryDocumentId !== 'NONE') ? primaryDocumentId : null;
    const finalAssignedTo = (assignedTo && assignedTo.trim() !== '' && assignedTo !== 'UNASSIGNED') ? assignedTo : null;


    const [taskResult] = await connection.execute(taskQuery, [
      taskId,
      title,
      description || null,
      status,
      dueDate,
      finalAssignedTo,
      priority,
      finalPrimaryDocumentId,
    ]);

    // @ts-ignore
    if (taskResult.affectedRows === 0) {
      await connection.rollback();
      return { success: false, error: 'Failed to create task. No rows affected.' };
    }

    if (supportingDocumentIds && supportingDocumentIds.length > 0) {
      const taskDocValues = supportingDocumentIds.map(docId => [taskId, docId]);
      const taskDocQuery = 'INSERT INTO task_documents (task_id, document_id) VALUES ?';
      // @ts-ignore
      const [taskDocResult] = await connection.query(taskDocQuery, [taskDocValues]);
      // @ts-ignore
      if (taskDocResult.affectedRows !== supportingDocumentIds.length) {
          await connection.rollback();
          return { success: false, error: 'Failed to associate all supporting documents with the task.' };
      }
    }

    if (finalAssignedTo) {
      await createNotificationInDB({
        userId: finalAssignedTo,
        type: 'Task Assignment',
        title: `New Task Assigned: ${title}`,
        description: `You have been assigned a new task: "${title}". Due: ${new Date(dueDate).toLocaleDateString()}.`,
        priority: 'medium',
        relatedTaskId: taskId,
      });
    }

    await connection.commit();
    return { success: true, taskId };

  } catch (error: any) {
    await connection.rollback();
    console.error('Error creating task in DB (Full Error):', error);
    let message = 'A database error occurred while creating the task.';
    if (error.code) message = `DB Error (${error.code}): ${error.message}`;
    else if (error instanceof Error) message = error.message;
    
    if (error.code === 'ER_DUP_ENTRY' && error.message.includes('uq_primary_document_id')) {
        message = 'This document is already assigned as a primary document to another task. Please select a different document or no primary document.';
    }
    return { success: false, error: message };
  } finally {
    connection.release();
  }
}

export async function createSubtaskInDB(values: TaskFormValues, parentId: string): Promise<{ success: boolean; error?: string; subtaskId?: string }> {
  const subtaskId = uuidv4();
  const { title, description, status, dueDate, assignedTo, priority, primaryDocumentId, supportingDocumentIds } = values;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const query = `
      INSERT INTO tasks (id, title, description, status, dueDate, assignedTo, priority, parentId, primary_document_id, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;
    const finalPrimaryDocumentId = (primaryDocumentId && primaryDocumentId.trim() !== '' && primaryDocumentId !== 'NONE') ? primaryDocumentId : null;
    const finalAssignedTo = (assignedTo && assignedTo.trim() !== '' && assignedTo !== 'UNASSIGNED') ? assignedTo : null;

    const [result] = await connection.execute(query, [
      subtaskId,
      title,
      description || null,
      status,
      dueDate,
      finalAssignedTo,
      priority,
      parentId,
      finalPrimaryDocumentId,
    ]);
    
    // @ts-ignore
    if (result.affectedRows === 0) {
      await connection.rollback();
      return { success: false, error: 'Failed to create subtask. No rows affected.' };
    }

    if (supportingDocumentIds && supportingDocumentIds.length > 0) {
      const taskDocValues = supportingDocumentIds.map(docId => [subtaskId, docId]);
      const taskDocQuery = 'INSERT INTO task_documents (task_id, document_id) VALUES ?';
      // @ts-ignore
      const [taskDocResult] = await connection.query(taskDocQuery, [taskDocValues]);
      // @ts-ignore
      if (taskDocResult.affectedRows !== supportingDocumentIds.length) {
          await connection.rollback();
          return { success: false, error: 'Failed to associate all supporting documents with the subtask.' };
      }
    }

    if (finalAssignedTo) {
        await createNotificationInDB({
            userId: finalAssignedTo,
            type: 'Subtask Assignment',
            title: `New Subtask Assigned: ${title}`,
            description: `You have been assigned a new subtask: "${title}". Due: ${new Date(dueDate).toLocaleDateString()}.`,
            priority: 'medium',
            relatedTaskId: subtaskId,
        });
    }
    
    await connection.commit();
    return { success: true, subtaskId };

  } catch (error: any) {
    await connection.rollback();
    console.error('Error creating subtask in DB (Full Error):', error);
    let message = 'A database error occurred while creating the subtask.';
    if (error.code) message = `DB Error (${error.code}): ${error.message}`;
    else if (error instanceof Error) message = error.message;

    if (error.code === 'ER_DUP_ENTRY' && error.message.includes('uq_primary_document_id')) {
        message = 'This document is already assigned as a primary document to another task. Please select a different document or no primary document.';
    }
    return { success: false, error: message };
  } finally {
    connection.release();
  }
}

export async function deleteSubtaskInDB(subtaskId: string): Promise<{ success: boolean; error?: string }> {
  const query = 'DELETE FROM tasks WHERE id = ?';
  try {
    const [result] = await pool.execute(query, [subtaskId]);
    // @ts-ignore
    if (result.affectedRows > 0) {
      return { success: true };
    } else {
      return { success: false, error: 'Failed to delete subtask. Subtask not found or no rows affected.' };
    }
  } catch (error: any) {
    console.error('Error deleting subtask from DB (Full Error):', error);
    let message = 'A database error occurred while deleting the subtask.';
    if (error.code) message = `DB Error (${error.code}): ${error.message}`;
    else if (error instanceof Error) message = error.message;
    return { success: false, error: message };
  }
}

export async function updateTaskInDB(
  taskId: string, 
  values: TaskFormValues,
  existingConnection?: PoolConnection // Optional existing connection
): Promise<{ success: boolean; error?: string }> {
  const { title, description, status, dueDate, assignedTo, priority, primaryDocumentId, supportingDocumentIds } = values;
  const connection = existingConnection || await pool.getConnection();

  try {
    if (!existingConnection) await connection.beginTransaction();
    
    // Fetch current assignedTo value before update
    const [currentTaskRows] = await connection.query<RowDataPacket[]>(
        'SELECT assignedTo FROM tasks WHERE id = ?',
        [taskId]
    );
    const originalAssignedTo = currentTaskRows.length > 0 ? currentTaskRows[0].assignedTo : null;

    const finalPrimaryDocumentId = (primaryDocumentId && primaryDocumentId.trim() !== '' && primaryDocumentId !== 'NONE') ? primaryDocumentId : null;
    const finalAssignedTo = (assignedTo && assignedTo.trim() !== '' && assignedTo !== 'UNASSIGNED') ? assignedTo : null;


    const taskUpdateQuery = `
      UPDATE tasks 
      SET title = ?, description = ?, status = ?, dueDate = ?, assignedTo = ?, priority = ?, primary_document_id = ?, updatedAt = NOW()
      WHERE id = ?
    `;
    await connection.execute(taskUpdateQuery, [
      title,
      description || null,
      status,
      dueDate,
      finalAssignedTo, 
      priority,
      finalPrimaryDocumentId,
      taskId
    ]);

    await connection.execute('DELETE FROM task_documents WHERE task_id = ?', [taskId]);
    if (supportingDocumentIds && supportingDocumentIds.length > 0) {
      const taskDocValues = supportingDocumentIds.map(docId => [taskId, docId]);
      const taskDocQuery = 'INSERT INTO task_documents (task_id, document_id) VALUES ?';
       // @ts-ignore
      const [taskDocResult] = await connection.query(taskDocQuery, [taskDocValues]);
       // @ts-ignore
      if (taskDocResult.affectedRows !== supportingDocumentIds.length) {
        if (!existingConnection) await connection.rollback();
        return { success: false, error: 'Failed to update all supporting document associations.' };
      }
    }

    if (finalAssignedTo && finalAssignedTo !== originalAssignedTo) {
      await createNotificationInDB({
        userId: finalAssignedTo,
        type: 'Task Assignment Update',
        title: `Task Reassigned: ${title}`,
        description: `Task "${title}" has been reassigned to you. Due: ${new Date(dueDate).toLocaleDateString()}.`,
        priority: 'medium',
        relatedTaskId: taskId,
      }, connection); // Pass connection if using one
    }
    
    if (!existingConnection) await connection.commit();
    return { success: true };

  } catch (error: any) {
    if (!existingConnection) await connection.rollback();
    console.error('Error updating task in DB (Full Error):', error);
    let message = 'A database error occurred while updating the task.';
    if (error.code) message = `DB Error (${error.code}): ${error.message}`;
    else if (error instanceof Error) message = error.message;

    if (error.code === 'ER_DUP_ENTRY' && error.message.includes('uq_primary_document_id')) {
        message = 'This document is already assigned as a primary document to another task. Please select a different document or no primary document.';
    }
    return { success: false, error: message };
  } finally {
    if (!existingConnection) connection.release();
  }
}


// --- Workflow Actions ---

async function updateTaskStatus(
  taskId: string, 
  newStatus: Task['status'], 
  assignedToUpdate?: string | null, // Changed name to avoid conflict
  existingConnection?: PoolConnection
): Promise<{ success: boolean; error?: string }> {
  if (!taskId || !newStatus) {
    return { success: false, error: 'Task ID and new status are required.' };
  }
  
  let query = 'UPDATE tasks SET status = ?, updatedAt = NOW()';
  const queryParams: (string | null)[] = [newStatus];

  let originalAssignedTo: string | null = null;
  let newAssignedToValue: string | null = null;
  let taskTitleForNotification: string | null = null;

  const connection = existingConnection || await pool.getConnection();
  try {
    if (!existingConnection) await connection.beginTransaction();

    if (assignedToUpdate !== undefined) { 
        const [taskRows] = await connection.query<RowDataPacket[]>('SELECT assignedTo, title FROM tasks WHERE id = ?', [taskId]);
        if (taskRows.length > 0) {
            originalAssignedTo = taskRows[0].assignedTo;
            taskTitleForNotification = taskRows[0].title;
        }
        newAssignedToValue = assignedToUpdate === 'UNASSIGNED' ? null : assignedToUpdate;
        
        query += ', assignedTo = ?';
        queryParams.push(newAssignedToValue);
    }
  
    query += ' WHERE id = ?';
    queryParams.push(taskId);

    const [result] = await connection.execute(query, queryParams);
    // @ts-ignore
    if (result.affectedRows === 0) {
      if (!existingConnection) await connection.rollback();
      return { success: false, error: 'Task not found or no change made.' };
    }

    // Send notification if assignee changed
    if (assignedToUpdate !== undefined && newAssignedToValue !== originalAssignedTo && newAssignedToValue && taskTitleForNotification) {
        await createNotificationInDB({
            userId: newAssignedToValue,
            type: 'Task Assignment Update',
            title: `Task Reassigned: ${taskTitleForNotification}`,
            description: `Task "${taskTitleForNotification}" has been updated and is now assigned to you with status: ${newStatus}.`,
            priority: 'medium',
            relatedTaskId: taskId,
        }, connection); // Pass connection
    }


    if (!existingConnection) await connection.commit();
    return { success: true };
  } catch (error: any) {
    if (!existingConnection) await connection.rollback();
    console.error(`Error updating task ${taskId} to status ${newStatus}${assignedToUpdate !== undefined ? ` and assignee ${assignedToUpdate}` : ''}:`, error);
    return { success: false, error: `Failed to update task: ${error.message}` };
  } finally {
    if (!existingConnection && connection) connection.release();
  }
}

// Helper to fetch task details needed for merging
async function fetchTaskForMerging(taskId: string, connection: PoolConnection): Promise<{
  id: string;
  title: string;
  description: string | undefined;
  status: Task['status'];
  dueDate: Date;
  assignedTo: string | null;
  priority: Task['priority'];
  parentId: string | undefined;
  primaryDocumentId: string | undefined | null;
  supportingDocumentIds: string[];
} | null> {
    const [rows]: [any[], any] = await connection.execute(
      `SELECT
         t.id, t.title, t.description, t.status, t.dueDate, t.assignedTo, t.priority, t.parentId,
         t.primary_document_id,
         (
           SELECT JSON_ARRAYAGG(td.document_id)
           FROM task_documents td
           WHERE td.task_id = t.id
         ) AS supportingDocumentIdsJson
       FROM tasks t
       WHERE t.id = ?`,
      [taskId]
    );
    if (rows.length === 0) return null;
    const data = rows[0];
    return {
        id: data.id,
        title: data.title,
        description: data.description || undefined,
        status: data.status as Task['status'],
        dueDate: new Date(data.dueDate),
        assignedTo: data.assignedTo,
        priority: data.priority as Task['priority'],
        parentId: data.parentId || undefined,
        primaryDocumentId: data.primary_document_id || null,
        supportingDocumentIds: data.supportingDocumentIdsJson ? JSON.parse(data.supportingDocumentIdsJson) : [],
    };
}


export async function submitTaskForReviewAction(taskId: string): Promise<{ success: boolean; error?: string; message?: string }> {
  const result = await updateTaskStatus(taskId, 'Pending Review');
  if (result.success) {
    // TODO: Notify manager or relevant role if needed
    return { ...result, message: 'Task submitted for review.' };
  }
  return result;
}

export async function approveTaskAction(taskId: string): Promise<{ success: boolean; error?: string; message?: string }> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const updateStatusResult = await updateTaskStatus(taskId, 'Approved', undefined, connection);
    if (!updateStatusResult.success) {
      await connection.rollback();
      return { success: false, error: `Failed to approve task: ${updateStatusResult.error}` };
    }

    const approvedTask = await fetchTaskForMerging(taskId, connection);
    if (!approvedTask) {
        await connection.rollback();
        return { success: false, error: 'Failed to retrieve task details after approval.' };
    }

    let message = `Task "${approvedTask.title}" approved.`;

    if (approvedTask.parentId) {
      const parentId = approvedTask.parentId;
      const parentTask = await fetchTaskForMerging(parentId, connection);
      if (!parentTask) {
        await connection.rollback();
        return { success: false, error: `Parent task (ID: ${parentId}) not found for merging documents.` };
      }

      const parentSupportingDocIds = new Set<string>(parentTask.supportingDocumentIds || []);
      if (approvedTask.primaryDocumentId) {
        parentSupportingDocIds.add(approvedTask.primaryDocumentId);
      }
      approvedTask.supportingDocumentIds?.forEach(docId => parentSupportingDocIds.add(docId));
      
      const newParentSupportingDocIdsArray = Array.from(parentSupportingDocIds);

      if (newParentSupportingDocIdsArray.length > (parentTask.supportingDocumentIds?.length || 0) || 
          (approvedTask.primaryDocumentId && !parentTask.supportingDocumentIds?.includes(approvedTask.primaryDocumentId))) {
        
        const parentTaskFormValues: TaskFormValues = {
          title: parentTask.title,
          description: parentTask.description || '',
          status: parentTask.status, // Parent status doesn't change here
          dueDate: parentTask.dueDate,
          assignedTo: parentTask.assignedTo,
          priority: parentTask.priority,
          primaryDocumentId: parentTask.primaryDocumentId,
          supportingDocumentIds: newParentSupportingDocIdsArray,
        };
        
        const updateParentResult = await updateTaskInDB(parentId, parentTaskFormValues, connection);
        if (!updateParentResult.success) {
          await connection.rollback();
          return { success: false, error: `Failed to merge documents to parent task: ${updateParentResult.error}` };
        }
        message = `Subtask "${approvedTask.title}" approved and its documents merged to parent.`;
      } else {
         message = `Subtask "${approvedTask.title}" approved. No new documents to merge.`;
      }
    }
    // TODO: Notify CS if the main task is approved and ready for them

    await connection.commit();
    return { success: true, message };

  } catch (error: any) {
    await connection.rollback();
    console.error(`Error in approveTaskAction (task ID: ${taskId}):`, error);
    return { success: false, error: `Failed to approve task and merge documents: ${error.message}` };
  } finally {
    connection.release();
  }
}

export async function requestChangesTaskAction(taskId: string): Promise<{ success: boolean; error?: string; message?: string }> {
  // We need to find out who was originally assigned to notify them.
  // For now, status change is enough, the assigned staff should see it in their list.
  const result = await updateTaskStatus(taskId, 'In Progress'); 
  if (result.success) {
    // TODO: Notify the original assignee (staff) that changes are requested.
    return { ...result, message: 'Task sent back for changes.' };
  }
  return result;
}

export async function sendToNotaryAction(taskId: string): Promise<{ success: boolean; error?: string; message?: string }> {
  const result = await updateTaskStatus(taskId, 'Pending Notarization', null); // Unassign for notary pool
  if (result.success) {
    // TODO: Notify Notary role users or a specific notary pool distribution list.
    return { ...result, message: 'Task sent to Notary pool (unassigned).' };
  }
  return result;
}

export async function completeNotarizationAction(taskId: string): Promise<{ success: boolean; error?: string; message?: string }> {
  const result = await updateTaskStatus(taskId, 'Notarization Complete', null); // Unassign for CS to pick up for archival
  if (result.success) {
    // TODO: Notify CS role users that a task is ready for archival.
    return { ...result, message: 'Notarization marked complete. Task ready for archival (unassigned).' };
  }
  return result;
}

export async function archiveTaskAction(taskId: string): Promise<{ success: boolean; error?: string; message?: string }> {
  const result = await updateTaskStatus(taskId, 'Archived');
  if (result.success) {
    return { ...result, message: 'Task archived.' };
  }
  return result;
}
