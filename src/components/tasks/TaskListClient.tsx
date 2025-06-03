
'use client';

import { useState, useEffect } from 'react';
import type { Task } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { ListChecks, MoreHorizontal, Eye, Trash2, GitMerge, Loader2, User, CornerDownRight } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface TaskListClientProps {
  initialTasks: Task[];
}

export function TaskListClient({ initialTasks }: TaskListClientProps) {
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);

  useEffect(() => {
    setIsLoading(true);
    const processedTasksWithDateObjects = initialTasks.map(task => ({
      ...task,
      dueDate: new Date(task.dueDate),
      createdAt: task.createdAt ? new Date(task.createdAt) : new Date(0), // Default to epoch if undefined
      subtaskIds: task.subtaskIds || [],
    }));

    const taskMap = new Map<string, Task>();
    processedTasksWithDateObjects.forEach(task => taskMap.set(task.id, task));

    const topLevelTasks = processedTasksWithDateObjects.filter(task => !task.parentId);

    topLevelTasks.sort((a, b) => {
      const dueDateComparison = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      if (dueDateComparison !== 0) return dueDateComparison;
      const createdAtA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const createdAtB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (createdAtA !== createdAtB) return createdAtA - createdAtB;
      return a.title.localeCompare(b.title);
    });

    const orderedDisplayTasks: Task[] = [];

    for (const parentTask of topLevelTasks) {
      orderedDisplayTasks.push(parentTask);

      if (parentTask.subtaskIds && parentTask.subtaskIds.length > 0) {
        const subtasksOfThisParent = parentTask.subtaskIds
          .map(subId => taskMap.get(subId))
          .filter((sub): sub is Task => sub !== undefined);

        subtasksOfThisParent.sort((a, b) => {
          const createdAtA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const createdAtB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          if (createdAtA !== createdAtB) return createdAtA - createdAtB;
          const dueDateComparison = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
          if (dueDateComparison !== 0) return dueDateComparison;
          return a.title.localeCompare(b.title);
        });
        orderedDisplayTasks.push(...subtasksOfThisParent);
      }
    }

    setAllTasks(orderedDisplayTasks);
    setIsLoading(false);
  }, [initialTasks]);

  const saveTasksToLocalStorage = (updatedTasks: Task[]) => {
    localStorage.setItem('notaryflow_tasks', JSON.stringify(updatedTasks));
    console.warn("Mock delete: Updated localStorage. Implement Server Action for DB delete for tasks.");
  };

  const handleDeleteTask = () => {
    if (!taskToDelete) return;

    let tasksToDeleteIds = [taskToDelete.id];
    // If deleting a parent, also mark its direct subtasks for deletion from the view
    if (!taskToDelete.parentId && taskToDelete.subtaskIds && taskToDelete.subtaskIds.length > 0) {
      const subtasksOfDeletingParent = allTasks.filter(t => t.parentId === taskToDelete.id);
      tasksToDeleteIds = [...tasksToDeleteIds, ...subtasksOfDeletingParent.map(st => st.id)];
    }


    const remainingTasks = allTasks.filter(task => !tasksToDeleteIds.includes(task.id));

    // Update subtaskIds on any remaining parent tasks if their children were deleted
    const updatedTasksFinal = remainingTasks.map(task => {
      if (task.subtaskIds) {
        const newSubtaskIds = task.subtaskIds.filter(subId => !tasksToDeleteIds.includes(subId));
        if (newSubtaskIds.length !== task.subtaskIds.length) {
          return { ...task, subtaskIds: newSubtaskIds };
        }
      }
      return task;
    });


    setAllTasks(updatedTasksFinal);
    saveTasksToLocalStorage(updatedTasksFinal);

    toast({ title: 'Task "Deleted" (Locally)', description: `Task "${taskToDelete.title}" and its direct subtasks (if any) removed from view. DB delete pending.` });
    setTaskToDelete(null);
  };

  const getStatusBadgeVariant = (status: Task['status']) => {
    switch (status) {
      case 'To Do': return 'outline';
      case 'In Progress': return 'secondary';
      case 'Pending Review': return 'default';
      case 'Approved': return 'default';
      case 'Pending Notarization': return 'secondary';
      case 'Notarization Complete': return 'default';
      case 'Archived': return 'outline';
      case 'Blocked': return 'destructive';
      default: return 'outline';
    }
  };

  const getPriorityBadgeVariant = (priority: Task['priority']) => {
    switch (priority) {
      case 'Low': return 'outline';
      case 'Medium': return 'secondary';
      case 'High': return 'destructive';
      default: return 'outline';
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 px-4 md:px-6 flex justify-center items-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2 text-muted-foreground">Loading tasks...</p>
      </div>
    );
  }

  return (
    <>
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Task List</CardTitle>
          <CardDescription>Showing {allTasks.length} task(s) relevant to you. Subtasks are indented.</CardDescription>
        </CardHeader>
        <CardContent>
          {allTasks.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="flex items-center gap-1"><User className="h-4 w-4 text-muted-foreground" />Assigned To</TableHead>
                  <TableHead>Subtasks</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allTasks.map((task) => (
                  <TableRow key={task.id} className={task.parentId ? 'bg-muted/30 hover:bg-muted/50' : 'hover:bg-muted/50'}>
                    <TableCell className="font-medium">
                      <div className="flex items-center">
                        {task.parentId && (
                          <CornerDownRight className="h-4 w-4 mr-2 text-muted-foreground flex-shrink-0" />
                        )}
                        <span>{task.title}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(task.status)}>{task.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getPriorityBadgeVariant(task.priority)}>{task.priority}</Badge>
                    </TableCell>
                    <TableCell>{format(new Date(task.dueDate), 'MMM d, yyyy')}</TableCell>
                    <TableCell>{task.assignedToName || task.assignedTo || 'Unassigned'}</TableCell>
                    <TableCell className="text-center">
                      {!task.parentId && task.subtaskIds && task.subtaskIds.length > 0 ? (
                        <Badge variant="outline" className="flex items-center gap-1">
                          <GitMerge className="h-3 w-3" />
                          {task.subtaskIds.length}
                        </Badge>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Task actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/tasks/${task.id}/edit`}><Eye className="mr-2 h-4 w-4" />View/Edit Details</Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setTaskToDelete(task)} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                            <Trash2 className="mr-2 h-4 w-4" />Delete Task
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="py-10 text-center">
              <ListChecks className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-xl font-semibold">No Tasks Found</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {initialTasks.length === 0 ? "You have no tasks assigned or visible to you." : "No tasks match your current filters (if any applicable)."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      <AlertDialog open={!!taskToDelete} onOpenChange={(open) => !open && setTaskToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete this task?</AlertDialogTitle>
            <AlertDialogDescription>
              Task: "{taskToDelete?.title}"<br />
              This action cannot be undone (locally for now) and will also "delete" its direct subtasks if it's a parent task. Database delete pending.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setTaskToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTask} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete Task
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

