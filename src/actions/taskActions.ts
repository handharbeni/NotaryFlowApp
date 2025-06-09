
'use server';

import pool from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import type { TaskFormValues } from '@/components/tasks/TaskForm';
import type { Task, UserRole, PublicTaskStatusResult, PublicSubtaskDetail } from '@/types';
import type { RowDataPacket, PoolConnection } from 'mysql2/promise';
import { createNotificationInDB } from '@/actions/notificationActions';
import { getJobNumberPattern } from '@/actions/settingsActions';
import { generateNewJobNumber } from '@/services/jobNumberService';

const statusToExpectedRoles: Record<Task['status'], UserRole[]> = {
  'To Do': ['staff', 'cs', 'admin', 'manager'],
  'In Progress': ['staff', 'cs', 'admin', 'manager'],
  'Pending Review': ['manager', 'admin'],
  'Approved': ['manager', 'cs', 'admin'],
  'Pending Notarization': ['cs', 'admin', 'manager'],
  'Ready for Notarization': ['notary', 'admin', 'manager', 'cs'],
  'Notarization Complete': ['cs', 'admin', 'manager', 'notary'],
  'Archived': ['admin', 'manager', 'cs', 'notary'],
  'Blocked': ['staff', 'cs', 'manager', 'admin', 'notary'],
};


export async function fetchActionableTasksCountForUser(userId: string, role: UserRole): Promise<number> {
  let query = 'SELECT COUNT(*) as count FROM tasks WHERE ';
  const params: (string | string[])[] = [];

  switch (role) {
    case 'admin':
      query += "status != 'Archived'";
      break;
    case 'manager':
      query += "(status = 'Pending Review' OR (assignedTo = ? AND (status = 'To Do' OR status = 'In Progress')) OR status = 'Approved' OR status = 'Pending Notarization' OR status = 'Ready for Notarization' OR status = 'Notarization Complete')";
      params.push(userId);
      break;
    case 'staff':
      query += "(status = 'To Do' OR status = 'In Progress') AND assignedTo = ?";
      params.push(userId);
      break;
    case 'cs':
      query += "((status = 'To Do' AND (assignedTo = ? OR assignedTo IS NULL)) OR status = 'Approved' OR status = 'Notarization Complete' OR status = 'Pending Notarization' OR status = 'Ready for Notarization')";
      params.push(userId);
      break;
    case 'notary':
      query += "status = 'Ready for Notarization' AND (assignedTo IS NULL OR assignedTo = ?)";
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
  const { title, description, status, dueDate, assignedTo, priority, documentIds } = values;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    let generatedJobNumber: string | null = null;
    const jobNumberPattern = await getJobNumberPattern();
    if (jobNumberPattern) {
      try {
        generatedJobNumber = await generateNewJobNumber(jobNumberPattern, connection);
      } catch (jobNumError: any) {
        console.warn(`Failed to generate job number for new task ${taskId}: ${jobNumError.message}. Proceeding without job number.`);
      }
    }

    const taskQuery = `
      INSERT INTO tasks (id, title, description, status, dueDate, assignedTo, priority, job_number, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;
    const finalAssignedTo = (assignedTo && assignedTo.trim() !== '' && assignedTo !== 'UNASSIGNED') ? assignedTo : null;

    const [taskResult] = await connection.execute(taskQuery, [
      taskId,
      title,
      description || null,
      status,
      dueDate,
      finalAssignedTo,
      priority,
      generatedJobNumber,
    ]);

    // @ts-ignore
    if (taskResult.affectedRows === 0) {
      await connection.rollback();
      return { success: false, error: 'Failed to create task. No rows affected.' };
    }

    if (documentIds && documentIds.length > 0) {
      const taskDocValues = documentIds.map(docId => [taskId, docId]);
      const taskDocQuery = 'INSERT INTO task_documents (task_id, document_id) VALUES ?';
      // @ts-ignore
      const [taskDocResult] = await connection.query(taskDocQuery, [taskDocValues]);
      // @ts-ignore
      if (taskDocResult.affectedRows !== documentIds.length) {
          await connection.rollback();
          return { success: false, error: 'Failed to associate all documents with the task.' };
      }
    }

    if (finalAssignedTo) {
      const notificationResult = await createNotificationInDB({
        userId: finalAssignedTo,
        type: 'Task Assignment',
        title: `Tugas Baru Ditugaskan: ${title}`,
        description: `Anda telah ditugaskan tugas baru: "${title}". Tenggat: ${new Date(dueDate).toLocaleDateString()}.`,
        priority: 'medium',
        relatedTaskId: taskId,
      }, connection);
      if (!notificationResult.success) {
        console.warn(`Failed to create notification for new task ${taskId} assignment: ${notificationResult.error}`);
      }
    }

    await connection.commit();
    return { success: true, taskId };

  } catch (error: any) {
    await connection.rollback();
    console.error('Error creating task in DB (Full Error):', error);
    let message = 'A database error occurred while creating the task.';
    if (error.code) message = `DB Error (${error.code}): ${error.message}`;
    else if (error instanceof Error) message = error.message;

    return { success: false, error: message };
  } finally {
    connection.release();
  }
}

export async function createSubtaskInDB(values: TaskFormValues, parentId: string): Promise<{ success: boolean; error?: string; subtaskId?: string }> {
  const subtaskId = uuidv4();
  const { title, description, status, dueDate, assignedTo, priority, documentIds } = values;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    let generatedJobNumber: string | null = null;
    const jobNumberPattern = await getJobNumberPattern();
    if (jobNumberPattern) {
      try {
        generatedJobNumber = await generateNewJobNumber(jobNumberPattern, connection);
      } catch (jobNumError: any) {
        console.warn(`Failed to generate job number for new subtask ${subtaskId}: ${jobNumError.message}. Proceeding without job number.`);
      }
    }

    const query = `
      INSERT INTO tasks (id, title, description, status, dueDate, assignedTo, priority, parentId, job_number, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;
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
      generatedJobNumber,
    ]);

    // @ts-ignore
    if (result.affectedRows === 0) {
      await connection.rollback();
      return { success: false, error: 'Failed to create subtask. No rows affected.' };
    }

    if (documentIds && documentIds.length > 0) {
      const taskDocValues = documentIds.map(docId => [subtaskId, docId]);
      const taskDocQuery = 'INSERT INTO task_documents (task_id, document_id) VALUES ?';
      // @ts-ignore
      const [taskDocResult] = await connection.query(taskDocQuery, [taskDocValues]);
      // @ts-ignore
      if (taskDocResult.affectedRows !== documentIds.length) {
          await connection.rollback();
          return { success: false, error: 'Failed to associate all documents with the subtask.' };
      }
    }

    if (finalAssignedTo) {
        const notificationResult = await createNotificationInDB({
            userId: finalAssignedTo,
            type: 'Subtask Assignment',
            title: `Subtugas Baru Ditugaskan: ${title}`,
            description: `Anda telah ditugaskan subtugas baru: "${title}". Tenggat: ${new Date(dueDate).toLocaleDateString()}.`,
            priority: 'medium',
            relatedTaskId: subtaskId,
        }, connection);
        if (!notificationResult.success) {
            console.warn(`Failed to create notification for new subtask ${subtaskId} assignment: ${notificationResult.error}`);
        }
    }

    await connection.commit();
    return { success: true, subtaskId };

  } catch (error: any) {
    await connection.rollback();
    console.error('Error creating subtask in DB (Full Error):', error);
    let message = 'A database error occurred while creating the subtask.';
    if (error.code) message = `DB Error (${error.code}): ${error.message}`;
    else if (error instanceof Error) message = error.message;

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
  existingConnection?: PoolConnection
): Promise<{ success: boolean; error?: string }> {
  const { title, description, status, dueDate, assignedTo, priority, documentIds } = values;
  const connectionToUse = existingConnection || await pool.getConnection();

  try {
    if (!existingConnection) await connectionToUse.beginTransaction();

    const [currentTaskRows] = await connectionToUse.query<RowDataPacket[]>(
        'SELECT assignedTo, title FROM tasks WHERE id = ?',
        [taskId]
    );
    const originalAssignedTo = currentTaskRows.length > 0 ? currentTaskRows[0].assignedTo : null;
    const currentTaskTitleForNotif = currentTaskRows.length > 0 ? currentTaskRows[0].title : title;

    const finalAssignedTo = (assignedTo && assignedTo.trim() !== '' && assignedTo !== 'UNASSIGNED') ? assignedTo : null;

    const taskUpdateQuery = `
      UPDATE tasks
      SET title = ?, description = ?, status = ?, dueDate = ?, assignedTo = ?, priority = ?, updatedAt = NOW()
      WHERE id = ?
    `;
    await connectionToUse.execute(taskUpdateQuery, [
      title,
      description || null,
      status,
      dueDate,
      finalAssignedTo,
      priority,
      taskId
    ]);

    await connectionToUse.execute('DELETE FROM task_documents WHERE task_id = ?', [taskId]);
    if (documentIds && documentIds.length > 0) {
      const taskDocValues = documentIds.map(docId => [taskId, docId]);
      const taskDocQuery = 'INSERT INTO task_documents (task_id, document_id) VALUES ?';
       // @ts-ignore
      const [taskDocResult] = await connectionToUse.query(taskDocQuery, [taskDocValues]);
       // @ts-ignore
      if (taskDocResult.affectedRows !== documentIds.length) {
        if (!existingConnection) await connectionToUse.rollback();
        return { success: false, error: 'Failed to update all document associations.' };
      }
    }

    if (finalAssignedTo && finalAssignedTo !== originalAssignedTo) {
      const notificationResult = await createNotificationInDB({
        userId: finalAssignedTo,
        type: 'Task Assignment Update',
        title: `Tugas Ditugaskan Kembali: ${currentTaskTitleForNotif}`,
        description: `Tugas "${currentTaskTitleForNotif}" telah diperbarui dan sekarang ditugaskan kepada Anda dengan status: ${status}. Tenggat: ${new Date(dueDate).toLocaleDateString()}.`,
        priority: 'medium',
        relatedTaskId: taskId,
      }, connectionToUse);
      if (!notificationResult.success) {
        console.warn(`Failed to create notification for task ${taskId} reassignment/update: ${notificationResult.error}`);
      }
    }

    if (!existingConnection) await connectionToUse.commit();
    return { success: true };

  } catch (error: any) {
    if (!existingConnection) await connectionToUse.rollback();
    console.error('Error updating task in DB (Full Error):', error);
    let message = 'A database error occurred while updating the task.';
    if (error.code) message = `DB Error (${error.code}): ${error.message}`;
    else if (error instanceof Error) message = error.message;

    return { success: false, error: message };
  } finally {
    if (!existingConnection && connectionToUse) connectionToUse.release();
  }
}


async function updateTaskStatus(
  taskId: string,
  newStatus: Task['status'],
  assignedToUpdate?: string | null,
  existingConnection?: PoolConnection
): Promise<{ success: boolean; error?: string }> {
  if (!taskId || !newStatus) {
    return { success: false, error: 'Task ID and new status are required.' };
  }

  const connectionToUse = existingConnection || await pool.getConnection();
  let originalAssignedTo: string | null = null;
  let currentTaskTitle: string | null = null;
  let finalAssignedToValue: string | null | undefined = assignedToUpdate;

  try {
    if (!existingConnection) await connectionToUse.beginTransaction();

    const [currentTaskRows] = await connectionToUse.query<RowDataPacket[]>(
      'SELECT t.assignedTo, t.title, u.role as assignedToRole FROM tasks t LEFT JOIN users u ON t.assignedTo = u.id WHERE t.id = ?',
      [taskId]
    );

    if (currentTaskRows.length === 0) {
      if (!existingConnection) await connectionToUse.rollback();
      return { success: false, error: 'Task not found.' };
    }
    originalAssignedTo = currentTaskRows[0].assignedTo;
    currentTaskTitle = currentTaskRows[0].title;
    const currentAssignedToRole: UserRole | null = currentTaskRows[0].assignedToRole;

    if (assignedToUpdate === undefined && originalAssignedTo && currentAssignedToRole) {
      const expectedRolesForNewStatus = statusToExpectedRoles[newStatus];
      if (!expectedRolesForNewStatus.includes(currentAssignedToRole)) {
        console.log(`Role mismatch for task ${taskId}: Current role ${currentAssignedToRole} not in expected roles (${expectedRolesForNewStatus.join(', ')}) for status ${newStatus}. Unassigning.`);
        finalAssignedToValue = null;
      } else {
        finalAssignedToValue = originalAssignedTo;
      }
    } else if (assignedToUpdate !== undefined) {
        finalAssignedToValue = (assignedToUpdate === 'UNASSIGNED' || assignedToUpdate === null) ? null : assignedToUpdate;
    }


    let query = 'UPDATE tasks SET status = ?, updatedAt = NOW()';
    const queryParams: (string | null)[] = [newStatus];

    if (finalAssignedToValue !== undefined) {
      query += ', assignedTo = ?';
      queryParams.push(finalAssignedToValue);
    }

    query += ' WHERE id = ?';
    queryParams.push(taskId);

    const [result] = await connectionToUse.execute(query, queryParams);
    // @ts-ignore
    if (result.affectedRows === 0) {
      if (!existingConnection) await connectionToUse.rollback();
      return { success: false, error: 'Task not found or no change made.' };
    }

    if (finalAssignedToValue && finalAssignedToValue !== originalAssignedTo && currentTaskTitle) {
      const notificationResult = await createNotificationInDB({
        userId: finalAssignedToValue,
        type: 'Task Status Update & Assignment',
        title: `Tugas Diperbarui & Ditugaskan: ${currentTaskTitle}`,
        description: `Tugas "${currentTaskTitle}" telah diperbarui ke status "${newStatus}" dan sekarang ditugaskan kepada Anda.`,
        priority: 'medium',
        relatedTaskId: taskId,
      }, connectionToUse);
      if (!notificationResult.success) {
        console.warn(`Failed to create notification for task ${taskId} status update assignment: ${notificationResult.error}`);
      }
    } else if (!finalAssignedToValue && originalAssignedTo && currentTaskTitle) {
      console.log(`Task ${taskId} ("${currentTaskTitle}") status changed to ${newStatus} and became unassigned.`);
    }


    if (!existingConnection) await connectionToUse.commit();
    return { success: true };
  } catch (error: any) {
    if (!existingConnection) await connectionToUse.rollback();
    console.error(`Error updating task ${taskId} to status ${newStatus}${finalAssignedToValue !== undefined ? ` and assignee ${finalAssignedToValue}` : ''}:`, error);
    return { success: false, error: `Failed to update task: ${error.message}` };
  } finally {
    if (!existingConnection && connectionToUse) connectionToUse.release();
  }
}


async function fetchTaskForMerging(taskId: string, connection: PoolConnection): Promise<{
  id: string;
  title: string;
  description: string | undefined;
  status: Task['status'];
  dueDate: Date;
  assignedTo: string | null;
  priority: Task['priority'];
  parentId: string | undefined;
  documents: string[]; // Now just a list of document IDs
} | null> {
    const [rows]: [any[], any] = await connection.execute(
      `SELECT
         t.id, t.title, t.description, t.status, t.dueDate, t.assignedTo, t.priority, t.parentId,
         (
           SELECT COALESCE(JSON_ARRAYAGG(td.document_id), JSON_ARRAY())
           FROM task_documents td
           WHERE td.task_id = t.id
         ) AS documentsJson
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
        documents: data.documentsJson ? JSON.parse(data.documentsJson) : [],
    };
}


export async function submitTaskForReviewAction(taskId: string): Promise<{ success: boolean; error?: string; message?: string }> {
  const result = await updateTaskStatus(taskId, 'Pending Review');
  if (result.success) {
    return { ...result, message: 'Tugas dikirim untuk direview.' };
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
      return { success: false, error: `Gagal menyetujui tugas: ${updateStatusResult.error}` };
    }

    const approvedTask = await fetchTaskForMerging(taskId, connection);
    if (!approvedTask) {
        await connection.rollback();
        return { success: false, error: 'Gagal mengambil detail tugas setelah disetujui.' };
    }

    let message = `Tugas "${approvedTask.title}" disetujui.`;

    if (approvedTask.parentId) {
      const parentId = approvedTask.parentId;
      const parentTask = await fetchTaskForMerging(parentId, connection);
      if (!parentTask) {
        await connection.rollback();
        return { success: false, error: `Tugas induk (ID: ${parentId}) tidak ditemukan untuk menggabungkan dokumen.` };
      }

      const parentDocIds = new Set<string>(parentTask.documents || []);
      approvedTask.documents?.forEach(docId => parentDocIds.add(docId));

      const newParentDocIdsArray = Array.from(parentDocIds);

      if (newParentDocIdsArray.length > (parentTask.documents?.length || 0)) {
        const parentTaskFormValues: TaskFormValues = {
          title: parentTask.title,
          description: parentTask.description || '',
          status: parentTask.status,
          dueDate: parentTask.dueDate,
          assignedTo: parentTask.assignedTo,
          priority: parentTask.priority,
          documentIds: newParentDocIdsArray,
        };

        const updateParentResult = await updateTaskInDB(parentId, parentTaskFormValues, connection);
        if (!updateParentResult.success) {
          await connection.rollback();
          return { success: false, error: `Gagal menggabungkan dokumen ke tugas induk: ${updateParentResult.error}` };
        }
        message = `Subtugas "${approvedTask.title}" disetujui dan dokumennya digabung ke tugas induk "${parentTask.title}".`;
      } else {
         message = `Subtugas "${approvedTask.title}" disetujui. Tidak ada dokumen baru untuk digabung ke induk.`;
      }
    }

    await connection.commit();
    return { success: true, message };

  } catch (error: any) {
    await connection.rollback();
    console.error(`Error in approveTaskAction (task ID: ${taskId}):`, error);
    return { success: false, error: `Gagal menyetujui tugas dan menggabungkan dokumen: ${error.message}` };
  } finally {
    connection.release();
  }
}

export async function requestChangesTaskAction(taskId: string): Promise<{ success: boolean; error?: string; message?: string }> {
  const result = await updateTaskStatus(taskId, 'In Progress');
  if (result.success) {
    return { ...result, message: 'Tugas dikembalikan untuk perubahan (status diatur ke In Progress).' };
  }
  return result;
}

export async function sendToNotaryAction(taskId: string): Promise<{ success: boolean; error?: string; message?: string }> {
  const result = await updateTaskStatus(taskId, 'Pending Notarization', null);
  if (result.success) {
    return { ...result, message: 'Status tugas diatur ke "Pending Notarization" untuk review CS dan pengumpulan file.' };
  }
  return result;
}

export async function markReadyForNotarizationAction(
  taskId: string,
  assignedToNotaryId?: string | null
): Promise<{ success: boolean; error?: string; message?: string }> {
  const result = await updateTaskStatus(taskId, 'Ready for Notarization', assignedToNotaryId === undefined ? null : assignedToNotaryId);
  if (result.success) {
    return { ...result, message: `Tugas ditandai 'Siap untuk Notarisasi'${assignedToNotaryId ? ' dan ditugaskan ke notaris' : ' untuk pool notaris'}.` };
  }
  return result;
}

export async function revertTaskToPendingNotarizationAction(taskId: string): Promise<{ success: boolean; error?: string; message?: string }> {
  const result = await updateTaskStatus(taskId, 'Pending Notarization', null);
  if (result.success) {
    return { ...result, message: 'Tugas dikembalikan ke CS untuk revisi (status diatur ke "Pending Notarization").' };
  }
  return result;
}


export async function completeNotarizationAction(taskId: string): Promise<{ success: boolean; error?: string; message?: string }> {
  const result = await updateTaskStatus(taskId, 'Notarization Complete', null);
  if (result.success) {
    return { ...result, message: 'Notarisasi ditandai selesai. Tugas siap untuk diarsipkan.' };
  }
  return result;
}

export async function archiveTaskAction(taskId: string): Promise<{ success: boolean; error?: string; message?: string }> {
  const result = await updateTaskStatus(taskId, 'Archived');
  if (result.success) {
    return { ...result, message: 'Tugas diarsipkan.' };
  }
  return result;
}

export async function fetchArchivedTasks(): Promise<Task[]> {
  try {
    const query = `
      SELECT
        t.id, t.title, t.description, t.status, t.dueDate, t.assignedTo, t.priority, t.parentId,
        t.createdAt, t.updatedAt, t.job_number,
        u_assign.name as assignedToName, u_assign.username as assignedToUsername,
        (
          SELECT COALESCE(JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', sd.id,
              'name', sd.name,
              'type', sd.type,
              'ownCloudPath', sd.ownCloudPath
            )
          ), JSON_ARRAY())
          FROM task_documents td
          JOIN documents sd ON td.document_id = sd.id
          WHERE td.task_id = t.id
        ) AS documentsJson
      FROM tasks t
      LEFT JOIN users u_assign ON t.assignedTo = u_assign.id
      WHERE t.status = 'Archived'
      ORDER BY t.updatedAt DESC;
    `;
    const [rows] = await pool.query(query);

    return (rows as any[]).map(row => {
      let taskDocuments: Task['documents'] = [];
      if (row.documentsJson) {
        try {
          const parsedDocs = JSON.parse(row.documentsJson);
          taskDocuments = Array.isArray(parsedDocs) ? parsedDocs.filter(doc => doc !== null && doc.id !== undefined) : [];
        } catch (e) {
          console.error("Failed to parse documentsJson for archived task ID", row.id, ":", e);
          taskDocuments = [];
        }
      }

      return {
        id: row.id,
        title: row.title,
        description: row.description,
        status: row.status as Task['status'],
        dueDate: new Date(row.dueDate),
        assignedTo: row.assignedTo,
        assignedToName: row.assignedToName || row.assignedToUsername || null,
        priority: row.priority as Task['priority'],
        parentId: row.parentId || undefined,
        documents: taskDocuments,
        subtaskIds: [],
        jobNumber: row.job_number || null,
        createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
        updatedAt: row.updatedAt ? new Date(row.updatedAt) : undefined,
      };
    });

  } catch (error) {
    console.error("Failed to fetch archived tasks from DB:", error);
    return [];
  }
}

export async function fetchPublicTaskStatusByJobNumber(
  jobNumber: string
): Promise<PublicTaskStatusResult> {
  if (!jobNumber || jobNumber.trim() === '') {
    return { error: 'Nomor pekerjaan diperlukan.' };
  }
  const connection = await pool.getConnection();
  try {
    const [mainTaskRows] = await connection.query<RowDataPacket[]>(
      'SELECT id, title, status FROM tasks WHERE job_number = ? AND parentId IS NULL LIMIT 1',
      [jobNumber.trim()]
    );

    if (mainTaskRows.length === 0) {
      return { message: 'Tidak ada tugas ditemukan dengan nomor pekerjaan ini.' };
    }
    const mainTask = mainTaskRows[0];

    const [subtaskRows] = await connection.query<RowDataPacket[]>(
      'SELECT id, title, status, dueDate FROM tasks WHERE parentId = ? ORDER BY createdAt ASC',
      [mainTask.id]
    );

    const subtasks: PublicSubtaskDetail[] = subtaskRows.map(st => ({
      id: st.id,
      title: st.title,
      status: st.status as Task['status'],
      dueDate: new Date(st.dueDate),
    }));

    return {
      task: {
        id: mainTask.id,
        title: mainTask.title,
        status: mainTask.status as Task['status'],
        subtasks: subtasks,
      }
    };
  } catch (error: any) {
    console.error('Error fetching public task status:', error);
    return { error: 'Terjadi kesalahan saat mengambil status tugas.' };
  } finally {
    connection.release();
  }
}

export async function fetchTasksFromDB(): Promise<Task[]> {
  try {
    const query = `
      SELECT
        t.id, t.title, t.description, t.status, t.dueDate, t.assignedTo, t.priority, t.parentId,
        t.createdAt, t.updatedAt, t.job_number,
        u_assign.name as assignedToName, u_assign.username as assignedToUsername,
        (
          SELECT COALESCE(JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', sd.id,
              'name', sd.name,
              'type', sd.type,
              'ownCloudPath', sd.ownCloudPath
            )
          ), JSON_ARRAY())
          FROM task_documents td
          JOIN documents sd ON td.document_id = sd.id
          WHERE td.task_id = t.id
        ) AS documentsJson
      FROM tasks t
      LEFT JOIN users u_assign ON t.assignedTo = u_assign.id
      ORDER BY t.createdAt DESC;
    `;
    const [rows] = await pool.query(query);

    const taskMap = new Map<string, Task>();
    const allTasksFromDBInput = (rows as any[]).map(row => {

      let taskAttributedDocuments: Task['documents'] = [];
      if (row.documentsJson) {
        try {
          const parsedDocs = JSON.parse(row.documentsJson);
          taskAttributedDocuments = Array.isArray(parsedDocs) ? parsedDocs.filter(doc => doc !== null && doc.id !== undefined) : [];
        } catch (e) {
          console.error("Failed to parse documentsJson for task ID", row.id, ":", e);
          taskAttributedDocuments = [];
        }
      }

      const task: Task = {
        id: row.id,
        title: row.title,
        description: row.description,
        status: row.status as Task['status'],
        dueDate: new Date(row.dueDate),
        assignedTo: row.assignedTo,
        assignedToName: row.assignedToName || row.assignedToUsername || null,
        priority: row.priority as Task['priority'],
        parentId: row.parentId || undefined,
        documents: taskAttributedDocuments,
        subtaskIds: [],
        jobNumber: row.job_number || null,
        createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
        updatedAt: row.updatedAt ? new Date(row.updatedAt) : undefined,
      };
      taskMap.set(task.id, task);
      return task;
    });

    allTasksFromDBInput.forEach(task => {
      if (task.parentId && taskMap.has(task.parentId)) {
        const parentTask = taskMap.get(task.parentId)!;
        if (!Array.isArray(parentTask.subtaskIds)) {
            parentTask.subtaskIds = [];
        }
        parentTask.subtaskIds.push(task.id);
      }
    });

    return Array.from(taskMap.values());

  } catch (error) {
    console.error("Failed to fetch tasks from DB:", error);
    return [];
  }
}
