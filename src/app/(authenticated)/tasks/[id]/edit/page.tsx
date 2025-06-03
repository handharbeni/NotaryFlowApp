
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
}

interface ParentTaskDocumentDetails {
  title: string;
  primaryDocument: Task['primaryDocument'] | null;
  supportingDocuments: Task['supportingDocuments'] | null;
}

interface FetchPageDataResult {
  task: Task; 
  subtasks: Task[]; 
  allAvailableDocuments: BasicDocumentInfo[];
  parentTaskDocumentDetails?: ParentTaskDocumentDetails | null; // For when initialTask is a subtask
  globallyUsedPrimaryDocIds: string[]; 
  globallyUsedSupportingDocIds: string[]; 
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
         t.primary_document_id,
         pd.name AS primary_document_name,
         pd.type AS primary_document_type,
         pd.ownCloudPath AS primary_document_ownCloudPath,
         (
           SELECT JSON_ARRAYAGG(
             JSON_OBJECT('id', sd.id, 'name', sd.name, 'type', sd.type, 'ownCloudPath', sd.ownCloudPath)
           )
           FROM task_documents td
           JOIN documents sd ON td.document_id = sd.id
           WHERE td.task_id = t.id
         ) AS supportingDocumentsJson,
         u_assign.name as assignedToName, u_assign.username as assignedToUsername
       FROM tasks t
       LEFT JOIN documents pd ON t.primary_document_id = pd.id
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
    } else if (currentUser.role === 'cs' || currentUser.role === 'notary') {
       // CS can see 'To Do' (if assigned/unassigned), 'Approved', 'Notarization Complete'
       // Notary can see 'Pending Notarization' (if assigned/unassigned)
      if (currentUser.role === 'cs') {
        canAccess = (mainTaskData.status === 'To Do' && (mainTaskData.assignedTo === currentUser.id || !mainTaskData.assignedTo)) ||
                    mainTaskData.status === 'Approved' ||
                    mainTaskData.status === 'Notarization Complete';
      } else if (currentUser.role === 'notary') {
        canAccess = mainTaskData.status === 'Pending Notarization' && (mainTaskData.assignedTo === currentUser.id || !mainTaskData.assignedTo);
      }
    }
    
    if (!canAccess) {
      if (mainTaskData.parentId && mainTaskData.assignedTo === currentUser.id) {
         canAccess = true; 
      } else {
          const [childTasksAssigned]: [any[], any] = await connection.execute(
            `SELECT COUNT(*) as count FROM tasks WHERE parentId = ? AND assignedTo = ?`,
            [mainTaskData.id, currentUser.id]
          );
          if (childTasksAssigned[0].count > 0) {
            canAccess = true; 
          }
      }
    }

    if (!canAccess) {
        return { unauthorized: true, task: mainTaskData } as unknown as FetchPageDataResult;
    }

    const [docRows]: [any[], any] = await connection.execute(
      'SELECT id, name, type FROM documents ORDER BY name ASC'
    );
    const allAvailableDocuments: BasicDocumentInfo[] = docRows.map((d: any) => ({ 
      id: d.id, 
      name: d.name, 
      type: d.type || undefined 
    }));

    const [usedPrimaryRows]: [any[], any] = await connection.execute(
      'SELECT DISTINCT primary_document_id FROM tasks WHERE primary_document_id IS NOT NULL AND id != ?', 
      [taskId]
    );
    const globallyUsedPrimaryDocIds: string[] = usedPrimaryRows.map((row: any) => row.primary_document_id);

     const [usedSupportingRows]: [any[], any] = await connection.execute(
      `SELECT DISTINCT document_id FROM task_documents WHERE task_id != ?`, 
      [taskId]
    );
    const globallyUsedSupportingDocIds: string[] = usedSupportingRows.map((row: any) => row.document_id);

    let primaryDocForMainTask: Task['primaryDocument'] = null;
    if (mainTaskData.primary_document_id && mainTaskData.primary_document_name) {
      primaryDocForMainTask = {
        id: mainTaskData.primary_document_id,
        name: mainTaskData.primary_document_name,
        type: mainTaskData.primary_document_type || undefined,
        ownCloudPath: mainTaskData.primary_document_ownCloudPath || undefined,
      };
    }
    let supportingDocsForMainTask: Task['supportingDocuments'] = [];
    if (mainTaskData.supportingDocumentsJson) {
        try {
            const parsed = JSON.parse(mainTaskData.supportingDocumentsJson);
            supportingDocsForMainTask = Array.isArray(parsed) ? parsed.filter(doc => doc !== null) : [];
        } catch (e) { console.error("Error parsing supporting docs for main task", e); }
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
      primaryDocumentId: mainTaskData.primary_document_id || undefined,
      primaryDocument: primaryDocForMainTask,
      supportingDocuments: supportingDocsForMainTask,
      subtaskIds: [], 
    };

    const [subtaskRows]: [any[], any] = await connection.execute(
      `SELECT 
         st.id, st.title, st.description, st.status, st.dueDate, st.assignedTo, st.priority, st.parentId,
         st.primary_document_id,
         spd.name AS primary_document_name,
         spd.type AS primary_document_type,
         spd.ownCloudPath AS primary_document_ownCloudPath,
         (
           SELECT JSON_ARRAYAGG(
             JSON_OBJECT('id', ssd.id, 'name', ssd.name, 'type', ssd.type, 'ownCloudPath', ssd.ownCloudPath)
           )
           FROM task_documents std
           JOIN documents ssd ON std.document_id = ssd.id
           WHERE std.task_id = st.id
         ) AS supportingDocumentsJson,
         u_sub_assign.name as subAssignedToName, u_sub_assign.username as subAssignedToUsername
       FROM tasks st
       LEFT JOIN documents spd ON st.primary_document_id = spd.id
       LEFT JOIN users u_sub_assign ON st.assignedTo = u_sub_assign.id
       WHERE st.parentId = ?
       ORDER BY st.createdAt ASC`,
      [task.id] 
    );
    
    let fetchedSubtasks: Task[] = subtaskRows.map((row: any) => {
      let primaryDocForSubtask: Task['primaryDocument'] = null;
      if (row.primary_document_id && row.primary_document_name) {
        primaryDocForSubtask = {
          id: row.primary_document_id,
          name: row.primary_document_name,
          type: row.primary_document_type || undefined,
          ownCloudPath: row.primary_document_ownCloudPath || undefined,
        };
      }
      let supportingDocsForSubtask: Task['supportingDocuments'] = [];
      if (row.supportingDocumentsJson) {
        try {
            const parsed = JSON.parse(row.supportingDocumentsJson);
            supportingDocsForSubtask = Array.isArray(parsed) ? parsed.filter(doc => doc !== null) : [];
        } catch (e) { console.error("Error parsing supporting docs for subtask", row.id, e); }
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
        primaryDocumentId: row.primary_document_id || undefined,
        primaryDocument: primaryDocForSubtask,
        supportingDocuments: supportingDocsForSubtask,
        subtaskIds: [], 
      };
    });

    if (currentUser.role === 'staff') {
        fetchedSubtasks = fetchedSubtasks.filter(st => st.assignedTo === currentUser.id);
    } else if (currentUser.role === 'cs') {
        fetchedSubtasks = fetchedSubtasks.filter(st => 
            (st.status === 'To Do' && (st.assignedTo === currentUser.id || !st.assignedTo)) ||
            st.status === 'Approved' ||
            st.status === 'Notarization Complete'
        );
    } else if (currentUser.role === 'notary') {
        fetchedSubtasks = fetchedSubtasks.filter(st => 
            st.status === 'Pending Notarization' && (st.assignedTo === currentUser.id || !st.assignedTo)
        );
    }
    // Admins and Managers see all subtasks of the main task


    task.subtaskIds = fetchedSubtasks.map(st => st.id);


    let parentTaskDocumentDetails: ParentTaskDocumentDetails | null = null;
    if (task.parentId) {
      const [parentRows]: [any[], any] = await connection.execute(
        `SELECT 
           pt.id, pt.title,
           pt.primary_document_id,
           ppd.name AS primary_document_name,
           ppd.type AS primary_document_type,
           ppd.ownCloudPath AS primary_document_ownCloudPath,
           (
             SELECT JSON_ARRAYAGG(
               JSON_OBJECT('id', psd.id, 'name', psd.name, 'type', psd.type, 'ownCloudPath', psd.ownCloudPath)
             )
             FROM task_documents ptd
             JOIN documents psd ON ptd.document_id = psd.id
             WHERE ptd.task_id = pt.id
           ) AS supportingDocumentsJson
         FROM tasks pt
         LEFT JOIN documents ppd ON pt.primary_document_id = ppd.id
         WHERE pt.id = ?`,
        [task.parentId]
      );
      if (parentRows.length > 0) {
        const parentData = parentRows[0];
        let primaryDocForParent: Task['primaryDocument'] = null;
        if (parentData.primary_document_id && parentData.primary_document_name) {
          primaryDocForParent = {
            id: parentData.primary_document_id,
            name: parentData.primary_document_name,
            type: parentData.primary_document_type || undefined,
            ownCloudPath: parentData.primary_document_ownCloudPath || undefined,
          };
        }
        let supportingDocsForParent: Task['supportingDocuments'] = [];
        if (parentData.supportingDocumentsJson) {
          try {
            const parsed = JSON.parse(parentData.supportingDocumentsJson);
            supportingDocsForParent = Array.isArray(parsed) ? parsed.filter(doc => doc !== null) : [];
          } catch (e) { console.error("Error parsing supporting docs for parent task", e); }
        }
        parentTaskDocumentDetails = {
          title: parentData.title,
          primaryDocument: primaryDocForParent,
          supportingDocuments: supportingDocsForParent,
        };
      }
    }

    const allUsers = await fetchUsers(); 

    return { 
        task, 
        subtasks: fetchedSubtasks, 
        allAvailableDocuments, 
        parentTaskDocumentDetails, 
        globallyUsedPrimaryDocIds,
        globallyUsedSupportingDocIds,
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
    console.warn(`User ${session.user.id} (role: ${(session.user as User & {role: UserRole}).role}) unauthorized to access or view task ${taskId}`);
    notFound(); 
  }


  return (
    <div className="container mx-auto px-4 md:px-6 py-6">
      <header className="mb-8 mt-0">
        <div className="flex items-center gap-3">
            <ListChecks className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight text-foreground mt-0">Edit Task</h1>
        </div>
        <p className="mt-2 text-muted-foreground">
          Modify the details for task: <span className="font-semibold">{data.task.title}</span>.
        </p>
      </header>
      <EditTaskClientPage 
        initialTask={data.task} 
        initialSubtasks={data.subtasks}
        allAvailableDocuments={data.allAvailableDocuments}
        parentTaskDocumentDetails={data.parentTaskDocumentDetails} // This is for the parent of initialTask
        globallyUsedPrimaryDocIds={data.globallyUsedPrimaryDocIds}
        globallyUsedSupportingDocIds={data.globallyUsedSupportingDocIds}
        allUsers={data.allUsers}
      />
    </div>
  );
}
