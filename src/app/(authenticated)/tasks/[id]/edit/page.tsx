
import pool from '@/lib/db';
import type { Task, User, UserRole } from '@/types';
import { notFound, redirect } from 'next/navigation';
import { ListChecks } from 'lucide-react';
import { EditTaskClientPage } from '@/components/tasks/EditTaskClientPage';
import { fetchUsers } from '@/actions/userActions';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

interface BasicDocumentInfo {
  id: string;
  name: string;
  type?: string;
  ownCloudPath?: string; 
  isOriginalRequested?: boolean; // Added
  originalFileHolderId?: string | null; // Added
}

interface ParentTaskDocumentDetails {
  title: string;
  documents: Task['documents'] | null; 
}

interface FetchPageDataResult {
  task: Task;
  subtasks: Task[];
  allAvailableDocuments: BasicDocumentInfo[];
  parentTaskDocumentDetails?: ParentTaskDocumentDetails | null;
  allUsers: Pick<User, 'id' | 'username' | 'email' | 'role' | 'name' | 'createdAt'>[];
  unauthorized?: boolean;
}

async function fetchPageData(taskId: string, sessionUser: User | undefined): Promise<FetchPageDataResult | null> {
  if (!sessionUser) {
    return { unauthorized: true } as unknown as FetchPageDataResult;
  }

  const currentUser = sessionUser as User & { role: UserRole };
  const connection = await pool.getConnection();
  try {
    const [mainTaskRows]: [any[], any] = await connection.execute(
      `SELECT
         t.id, t.title, t.description, t.status, t.dueDate, t.assignedTo, t.priority, t.parentId,
         t.job_number,
         COALESCE(
           (
             SELECT JSON_ARRAYAGG(
               JSON_OBJECT(
                'id', sd.id, 
                'name', sd.name, 
                'type', sd.type, 
                'ownCloudPath', sd.ownCloudPath,
                'isOriginalRequested', sd.isOriginalRequested,      -- Added
                'originalFileHolderId', sd.originalFileHolderId   -- Added
                )
             )
             FROM task_documents td
             JOIN documents sd ON td.document_id = sd.id
             WHERE td.task_id = t.id
           ),
           JSON_ARRAY()
         ) AS documentsJson,
         u_assign.name as assignedToName, u_assign.username as assignedToUsername,
         t.createdAt, t.updatedAt
       FROM tasks t
       LEFT JOIN users u_assign ON t.assignedTo = u_assign.id
       WHERE t.id = ?`,
      [taskId]
    );

    if (mainTaskRows.length === 0) return null;
    const mainTaskData = mainTaskRows[0];

    let canAccess = false;
    if (currentUser.role === 'admin' || currentUser.role === 'manager') {
      canAccess = true;
    } else if (currentUser.role === 'staff') {
      canAccess = mainTaskData.assignedTo === currentUser.id;
      if (!canAccess && !mainTaskData.parentId) { 
        const [subtasksOfThisParent]: [any[], any] = await connection.execute(
          'SELECT id FROM tasks WHERE parentId = ? AND assignedTo = ?',
          [mainTaskData.id, currentUser.id]
        );
        if (subtasksOfThisParent.length > 0) canAccess = true;
      }
    } else if (currentUser.role === 'cs') {
      canAccess = (
          (mainTaskData.status === 'To Do' && (mainTaskData.assignedTo === currentUser.id || !mainTaskData.assignedTo)) ||
          mainTaskData.status === 'Approved' ||
          (mainTaskData.status === 'Pending Notarization' && (mainTaskData.assignedTo === currentUser.id || !mainTaskData.assignedTo)) ||
          mainTaskData.status === 'Ready for Notarization' || 
          mainTaskData.status === 'Notarization Complete'
      );
    } else if (currentUser.role === 'notary') {
      canAccess = mainTaskData.status === 'Ready for Notarization' && (mainTaskData.assignedTo === currentUser.id || !mainTaskData.assignedTo);
    }

    if (!canAccess && mainTaskData.parentId && mainTaskData.assignedTo === currentUser.id) {
       canAccess = true;
    } else if (!canAccess && !mainTaskData.parentId) { 
        const [childTasksAssigned]: [any[], any] = await connection.execute(
          `SELECT COUNT(*) as count FROM tasks WHERE parentId = ? AND assignedTo = ?`,
          [mainTaskData.id, currentUser.id]
        );
        if (childTasksAssigned[0].count > 0) {
          canAccess = true;
        }
    }

    if (!canAccess) {
        return { unauthorized: true, task: mainTaskData } as unknown as FetchPageDataResult;
    }

    const [docRows]: [any[], any] = await connection.execute(
      'SELECT id, name, type, ownCloudPath, isOriginalRequested, originalFileHolderId FROM documents ORDER BY name ASC' // Added new fields
    );
    const allAvailableDocuments: BasicDocumentInfo[] = docRows.map((d: any) => ({
      id: d.id,
      name: d.name,
      type: d.type || undefined,
      ownCloudPath: d.ownCloudPath || undefined,
      isOriginalRequested: Boolean(d.isOriginalRequested), // Added
      originalFileHolderId: d.originalFileHolderId,      // Added
    }));

    let taskDocuments: Task['documents'] = [];
    if (mainTaskData.documentsJson) {
        try {
            const parsedDocs = JSON.parse(mainTaskData.documentsJson);
            taskDocuments = Array.isArray(parsedDocs) ? parsedDocs.filter(doc => doc !== null && doc.id !== undefined) : [];
        } catch (e) { 
          console.error("Error parsing documentsJson for main task ID", mainTaskData.id, ":", e);
          taskDocuments = []; 
        }
    }

    const task: Task = {
      id: mainTaskData.id,
      title: mainTaskData.title,
      description: mainTaskData.description || '',
      status: mainTaskData.status as Task['status'],
      dueDate: new Date(mainTaskData.dueDate),
      assignedTo: mainTaskData.assignedTo,
      assignedToName: mainTaskData.assignedToName || mainTaskData.assignedToUsername || null,
      priority: mainTaskData.priority as Task['priority'],
      parentId: mainTaskData.parentId || undefined,
      jobNumber: mainTaskData.job_number || null,
      documents: taskDocuments,
      subtaskIds: [],
      createdAt: mainTaskData.createdAt ? new Date(mainTaskData.createdAt) : undefined,
      updatedAt: mainTaskData.updatedAt ? new Date(mainTaskData.updatedAt) : undefined,
    };

    const [subtaskRows]: [any[], any] = await connection.execute(
      `SELECT
         st.id, st.title, st.description, st.status, st.dueDate, st.assignedTo, st.priority, st.parentId, st.createdAt, st.updatedAt,
         st.job_number,
         COALESCE(
           (
             SELECT JSON_ARRAYAGG(
               JSON_OBJECT(
                'id', ssd.id, 
                'name', ssd.name, 
                'type', ssd.type, 
                'ownCloudPath', ssd.ownCloudPath,
                'isOriginalRequested', ssd.isOriginalRequested,     -- Added
                'originalFileHolderId', ssd.originalFileHolderId  -- Added
                )
             )
             FROM task_documents std
             JOIN documents ssd ON std.document_id = ssd.id
             WHERE std.task_id = st.id
           ),
           JSON_ARRAY()
         ) AS documentsJson,
         u_sub_assign.name as subAssignedToName, u_sub_assign.username as subAssignedToUsername
       FROM tasks st
       LEFT JOIN users u_sub_assign ON st.assignedTo = u_sub_assign.id
       WHERE st.parentId = ?
       ORDER BY st.createdAt ASC`,
      [task.id]
    );

    let fetchedSubtasks: Task[] = subtaskRows.map((row: any) => {
      let subtaskDocuments: Task['documents'] = [];
      if (row.documentsJson) {
        try {
            const parsedDocs = JSON.parse(row.documentsJson);
            subtaskDocuments = Array.isArray(parsedDocs) ? parsedDocs.filter(doc => doc !== null && doc.id !== undefined) : [];
        } catch (e) { 
            console.error("Error parsing documentsJson for subtask ID", row.id, ":", e);
            subtaskDocuments = [];
        }
      }
      return {
        id: row.id,
        title: row.title,
        description: row.description || '',
        status: row.status as Task['status'],
        dueDate: new Date(row.dueDate),
        assignedTo: row.assignedTo,
        assignedToName: row.subAssignedToName || row.subAssignedToUsername || null,
        priority: row.priority as Task['priority'],
        parentId: row.parentId || undefined,
        jobNumber: row.job_number || null,
        documents: subtaskDocuments,
        subtaskIds: [],
        createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
        updatedAt: row.updatedAt ? new Date(row.updatedAt) : undefined,
      };
    });

    if (currentUser.role === 'staff') {
        fetchedSubtasks = fetchedSubtasks.filter(st => st.assignedTo === currentUser.id);
    } else if (currentUser.role === 'cs') {
        fetchedSubtasks = fetchedSubtasks.filter(st =>
            (st.status === 'To Do' && (st.assignedTo === currentUser.id || !st.assignedTo)) ||
            st.status === 'Approved' ||
            (st.status === 'Pending Notarization' && (st.assignedTo === currentUser.id || !st.assignedTo)) ||
            st.status === 'Ready for Notarization' ||
            st.status === 'Notarization Complete'
        );
    } else if (currentUser.role === 'notary') {
        fetchedSubtasks = fetchedSubtasks.filter(st =>
            st.status === 'Ready for Notarization' && (st.assignedTo === currentUser.id || !st.assignedTo)
        );
    }

    task.subtaskIds = fetchedSubtasks.map(st => st.id);

    let parentTaskDocumentDetails: ParentTaskDocumentDetails | null = null;
    if (task.parentId) {
      const [parentRows]: [any[], any] = await connection.execute(
        `SELECT
           pt.id, pt.title,
           COALESCE(
             (
               SELECT JSON_ARRAYAGG(
                 JSON_OBJECT(
                  'id', psd.id, 
                  'name', psd.name, 
                  'type', psd.type, 
                  'ownCloudPath', psd.ownCloudPath,
                  'isOriginalRequested', psd.isOriginalRequested,     -- Added
                  'originalFileHolderId', psd.originalFileHolderId  -- Added
                  )
               )
               FROM task_documents ptd
               JOIN documents psd ON ptd.document_id = psd.id
               WHERE ptd.task_id = pt.id
             ),
             JSON_ARRAY()
           ) AS documentsJson
         FROM tasks pt
         WHERE pt.id = ?`,
        [task.parentId]
      );
      if (parentRows.length > 0) {
        const parentData = parentRows[0];
        let parentDocs: Task['documents'] = [];
        if (parentData.documentsJson) {
          try {
            const parsedDocs = JSON.parse(parentData.documentsJson);
            parentDocs = Array.isArray(parsedDocs) ? parsedDocs.filter(doc => doc !== null && doc.id !== undefined) : [];
          } catch (e) { 
            console.error("Error parsing documentsJson for parent task ID", parentData.id, ":", e);
            parentDocs = [];
           }
        }
        parentTaskDocumentDetails = {
          title: parentData.title,
          documents: parentDocs,
        };
      }
    }

    const allUsers = await fetchUsers();

    return {
        task,
        subtasks: fetchedSubtasks,
        allAvailableDocuments,
        parentTaskDocumentDetails,
        allUsers,
        unauthorized: false,
    };
  } catch (error) {
    console.error('Error fetching task details, documents, and users:', error);
    return null;
  } finally {
    connection.release();
  }
}

export default async function EditTaskPageWrapper({ params }: { params: { id: string } }) {
  const taskId = params.id;
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    redirect('/');
    return null;
  }

  const data = await fetchPageData(taskId, session.user as User);

  if (!data) {
    notFound();
  }

  if (data.unauthorized) {
    console.warn(`User ${session.user.id} (role: ${(session.user as User & {role: UserRole}).role}) unauthorized to access or view task ${taskId}. Task current status: ${data.task?.status}. Assigned to: ${data.task?.assignedTo}`);
    notFound();
  }


  return (
    <div className="container mx-auto px-4 md:px-6 py-6">
      <header className="mb-8 mt-0">
        <div className="flex items-center gap-3">
            <ListChecks className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight text-foreground mt-0">Ubah Tugas</h1>
        </div>
        <p className="mt-2 text-muted-foreground">
          Ubah detail untuk tugas: <span className="font-semibold">{data.task.title}</span>.
        </p>
      </header>
      <EditTaskClientPage
        initialTask={data.task}
        initialSubtasks={data.subtasks}
        allAvailableDocuments={data.allAvailableDocuments}
        parentTaskDocumentDetails={data.parentTaskDocumentDetails}
        allUsers={data.allUsers}
      />
    </div>
  );
}
