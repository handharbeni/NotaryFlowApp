
import type { Task, User as SessionUser, UserRole } from '@/types';
import { Button } from '@/components/ui/button';
import { PlusCircle, ListChecks } from 'lucide-react';
import Link from 'next/link';
// Removed pool import as fetchTasksFromDB will be imported
import { TaskListClient } from '@/components/tasks/TaskListClient';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';
import { fetchTasksFromDB } from '@/actions/taskActions'; // Import the shared action

// Removed the local fetchTasksFromDB function definition that was here

export default async function TasksPage() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    redirect('/');
    return null;
  }
  const currentUser = session.user as SessionUser & { role: UserRole };

  const allTasksFromDB = await fetchTasksFromDB(); // Use the imported action
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
    tasksForClient = allTasksFromDB.filter(task =>
      (task.status === 'To Do' && (task.assignedTo === currentUser.id || !task.assignedTo)) ||
      task.status === 'Approved' ||
      (task.status === 'Pending Notarization' && (task.assignedTo === currentUser.id || !task.assignedTo)) || // CS handles these for file collection
      task.status === 'Ready for Notarization' || // CS can view tasks ready for notary
      task.status === 'Notarization Complete'
    );
  } else if (currentUser.role === 'notary') {
    tasksForClient = allTasksFromDB.filter(task =>
      task.status === 'Ready for Notarization' && (task.assignedTo === currentUser.id || !task.assignedTo)
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
          { (currentUser.role === 'admin' || currentUser.role === 'manager' || currentUser.role === 'cs') && (
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
           currentUser.role === 'cs' ? 'Prepare tasks, manage documents, process notarization requests, and handle completed notarizations for archival.' :
           currentUser.role === 'notary' ? 'View tasks ready for notarization.' :
           'Your tasks overview.'
          }
        </p>
      </header>

      <TaskListClient initialTasks={tasksForClient} />

    </div>
  );
}
