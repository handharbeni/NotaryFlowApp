
import type { Task, User as SessionUser, UserRole } from '@/types';
import { Button } from '@/components/ui/button';
import { PlusCircle, ListChecks } from 'lucide-react';
import Link from 'next/link';
import pool from '@/lib/db';
import { TaskListClient } from '@/components/tasks/TaskListClient';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';

async function fetchTasksFromDB(): Promise<Task[]> {
  try {
    const query = `
      SELECT 
        t.id, t.title, t.description, t.status, t.dueDate, t.assignedTo, t.priority, t.parentId, 
        t.createdAt, t.updatedAt, 
        u_assign.name as assignedToName, u_assign.username as assignedToUsername,
        t.primary_document_id,
        pd.name AS primary_document_name,
        pd.type AS primary_document_type,
        pd.ownCloudPath AS primary_document_ownCloudPath,
        (
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', sd.id, 
              'name', sd.name, 
              'type', sd.type, 
              'ownCloudPath', sd.ownCloudPath
            )
          )
          FROM task_documents td
          JOIN documents sd ON td.document_id = sd.id
          WHERE td.task_id = t.id
        ) AS supportingDocumentsJson
      FROM tasks t
      LEFT JOIN documents pd ON t.primary_document_id = pd.id
      LEFT JOIN users u_assign ON t.assignedTo = u_assign.id
      ORDER BY t.createdAt DESC;
    `;
    const [rows] = await pool.query(query);

    const taskMap = new Map<string, Task>();
    const allTasksFromDBInput = (rows as any[]).map(row => {
      let primaryDocument: Task['primaryDocument'] = null;
      if (row.primary_document_id && row.primary_document_name) {
        primaryDocument = {
          id: row.primary_document_id,
          name: row.primary_document_name,
          type: row.primary_document_type || undefined,
          ownCloudPath: row.primary_document_ownCloudPath || undefined,
        };
      }

      let supportingDocuments: Task['supportingDocuments'] = [];
      if (row.supportingDocumentsJson) {
        try {
          const parsedSupporting = JSON.parse(row.supportingDocumentsJson);
          supportingDocuments = Array.isArray(parsedSupporting) ? parsedSupporting.filter(doc => doc !== null) : [];
        } catch (e) {
          console.error("Failed to parse supportingDocumentsJson for task ID", row.id, ":", e);
          supportingDocuments = [];
        }
      }

      const task: Task = {
        id: row.id,
        title: row.title,
        description: row.description,
        status: row.status as Task['status'],
        dueDate: new Date(row.dueDate),
        assignedTo: row.assignedTo, // User ID
        assignedToName: row.assignedToName || row.assignedToUsername || null, // User's name or username
        priority: row.priority as Task['priority'],
        parentId: row.parentId || undefined,
        primaryDocumentId: row.primary_document_id || undefined,
        primaryDocument: primaryDocument,
        supportingDocuments: supportingDocuments,
        subtaskIds: [],
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


export default async function TasksPage() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    redirect('/');
    return null;
  }
  const currentUser = session.user as SessionUser & { role: UserRole };

  const allTasksFromDB = await fetchTasksFromDB();
  let tasksForClient: Task[];

  if (currentUser.role === 'admin' || currentUser.role === 'manager') {
    tasksForClient = allTasksFromDB;
  } else if (currentUser.role === 'staff') {
    const userTaskAndParentMap = new Map<string, Task>();
    const parentsOfAssignedSubtasks = new Set<string>();

    allTasksFromDB.forEach(task => {
      if (task.assignedTo === currentUser.id) {
        userTaskAndParentMap.set(task.id, { ...task, subtaskIds: task.subtaskIds || [] });
        if (task.parentId) {
          parentsOfAssignedSubtasks.add(task.parentId);
        }
      }
    });

    parentsOfAssignedSubtasks.forEach(parentId => {
      if (!userTaskAndParentMap.has(parentId)) {
        const parentTask = allTasksFromDB.find(t => t.id === parentId);
        if (parentTask) {
          userTaskAndParentMap.set(parentId, { ...parentTask, subtaskIds: parentTask.subtaskIds || [] });
        }
      }
    });

    tasksForClient = Array.from(userTaskAndParentMap.values()).map(taskInMap => {
      let filteredSubtaskIdsForThisTask: string[] = [];
      if (taskInMap.subtaskIds && taskInMap.subtaskIds.length > 0) {
        filteredSubtaskIdsForThisTask = taskInMap.subtaskIds.filter(subId =>
          userTaskAndParentMap.has(subId)
        );
      }
      return { ...taskInMap, subtaskIds: filteredSubtaskIdsForThisTask };
    });
  } else if (currentUser.role === 'cs') {
    // CS sees tasks they are preparing ('To Do' and assigned to them or unassigned),
    // tasks ready to send to notary ('Approved'), 
    // and tasks ready to archive ('Notarization Complete').
    tasksForClient = allTasksFromDB.filter(task =>
      (task.status === 'To Do' && (task.assignedTo === currentUser.id || !task.assignedTo)) ||
      task.status === 'Approved' ||
      task.status === 'Notarization Complete'
    );
  } else if (currentUser.role === 'notary') {
    // Notaries see tasks 'Pending Notarization' (assigned to them or unassigned for pool).
    tasksForClient = allTasksFromDB.filter(task =>
      task.status === 'Pending Notarization' && (task.assignedTo === currentUser.id || !task.assignedTo)
    );
  } else {
    tasksForClient = [];
  }

  return (
    <div className="container mx-auto px-4 md:px-6 py-6">
      <header className="mb-8 mt-0">
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div className="flex items-center gap-3">
            <ListChecks className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight text-foreground mt-0">Task Management</h1>
          </div>
          {(currentUser.role === 'admin' || currentUser.role === 'manager' || currentUser.role === 'cs') && (
            <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Link href="/tasks/new">
                <PlusCircle className="mr-2 h-4 w-4" /> Add New Task
              </Link>
            </Button>
          )}
        </div>
        <p className="mt-2 text-muted-foreground">
          {currentUser.role === 'admin' ? 'Organize, track, and manage all notarial tasks.' :
            currentUser.role === 'manager' ? 'Manage and assign tasks to your team.' :
              currentUser.role === 'staff' ? 'Your assigned notarial tasks.' :
                currentUser.role === 'cs' ? 'Prepare tasks, manage documents, and process completed notarizations for archival.' :
                  currentUser.role === 'notary' ? 'View tasks pending notarization.' :
                    'Your tasks overview.'
          }
        </p>
      </header>

      <TaskListClient initialTasks={tasksForClient} />

    </div>
  );
}

