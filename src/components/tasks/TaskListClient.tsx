
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import type { Task } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ListChecks, MoreHorizontal, Eye, Trash2, GitMerge, Loader2, User, CornerDownRight, Hash, ChevronRight, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { id as localeID } from 'date-fns/locale';
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

interface TaskWithFormattedDate extends Task {
  formattedDueDate?: string;
}

interface TaskListClientProps {
  initialTasks: Task[];
}

// Predefined order for statuses
const TASK_STATUS_ORDER: Task['status'][] = [
  'To Do',
  'In Progress',
  'Pending Review',
  'Approved',
  'Pending Notarization',
  'Ready for Notarization',
  'Notarization Complete',
  'Blocked',
  // Archived tasks are typically on their own page, but can be included if needed
  // 'Archived' 
];

interface TaskGroup {
  status: Task['status'];
  displayName: string;
  tasks: TaskWithFormattedDate[]; // Top-level tasks for this status
  count: number;
}

export function TaskListClient({ initialTasks }: TaskListClientProps) {
  const [allTasks, setAllTasks] = useState<TaskWithFormattedDate[]>([]); // Holds ALL tasks (parents and subtasks)
  const [taskGroups, setTaskGroups] = useState<TaskGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});
  const [defaultAccordionOpen, setDefaultAccordionOpen] = useState<string[]>([]);


  useEffect(() => {
    setIsLoading(true);
    const processedTasks = initialTasks.map(task => ({
      ...task,
      dueDate: new Date(task.dueDate),
      createdAt: task.createdAt ? new Date(task.createdAt) : new Date(0),
      subtaskIds: task.subtaskIds || [],
      formattedDueDate: format(new Date(task.dueDate), 'MMM d, yyyy', { locale: localeID }),
    }));
    setAllTasks(processedTasks); // Store all tasks

    const groups: TaskGroup[] = [];
    const openByDefault: string[] = [];

    TASK_STATUS_ORDER.forEach(statusKey => {
      const topLevelTasksInStatus = processedTasks
        .filter(task => !task.parentId && task.status === statusKey)
        .sort((a, b) => { // Sort top-level tasks within the group
          const dueDateComparison = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
          if (dueDateComparison !== 0) return dueDateComparison;
          const createdAtA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const createdAtB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return createdAtA - createdAtB;
        });

      if (topLevelTasksInStatus.length > 0) {
        groups.push({
          status: statusKey,
          displayName: `${statusKey} (${topLevelTasksInStatus.length})`,
          tasks: topLevelTasksInStatus,
          count: topLevelTasksInStatus.length,
        });
        if (statusKey === 'To Do' || statusKey === 'In Progress') { // Example: open 'To Do' and 'In Progress' by default
             openByDefault.push(statusKey);
        }
      }
    });
    setTaskGroups(groups);
    setDefaultAccordionOpen(openByDefault);
    setIsLoading(false);
  }, [initialTasks]);

  const toggleTaskExpansion = (taskId: string) => {
    setExpandedTasks(prev => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  const saveTasksToLocalStorage = (updatedTasks: Task[]) => {
    localStorage.setItem('notaryflow_tasks', JSON.stringify(updatedTasks));
    console.warn("Mock delete: Updated localStorage. Implement Server Action for DB delete for tasks.");
  };

  const handleDeleteTask = () => {
    if (!taskToDelete) return;

    let tasksToDeleteIds = [taskToDelete.id];
    // If deleting a parent task, also mark its subtasks for "deletion" from the view
    if (!taskToDelete.parentId && taskToDelete.subtaskIds && taskToDelete.subtaskIds.length > 0) {
       const subtasksOfDeletingParent = allTasks.filter(t => t.parentId === taskToDelete.id);
       tasksToDeleteIds = [...tasksToDeleteIds, ...subtasksOfDeletingParent.map(st => st.id)];
    }

    const remainingTasks = allTasks.filter(task => !tasksToDeleteIds.includes(task.id));
    
    const updatedTasksFinal = remainingTasks.map(task => {
      if (task.subtaskIds) {
        const newSubtaskIds = task.subtaskIds.filter(subId => !tasksToDeleteIds.includes(subId));
        // Check if subtaskIds actually changed before creating a new object
        if (newSubtaskIds.length !== task.subtaskIds.length) {
          return { ...task, subtaskIds: newSubtaskIds };
        }
      }
      return task;
    });

    setAllTasks(updatedTasksFinal); // This will trigger re-calculation of taskGroups in the next effect cycle or by re-passing initialTasks
    // For a purely client-side delete, we'd also update taskGroups here.
    // However, a server action would be better, followed by router.refresh() which re-runs useEffect.
    saveTasksToLocalStorage(updatedTasksFinal); // Mock

    toast({ title: 'Task "Deleted" (Locally)', description: `Task "${taskToDelete.title}" and its direct subtasks (if any) removed from view. DB delete pending.` });
    setTaskToDelete(null);
    // To refresh groups, it's better to call router.refresh() if using server actions.
    // For now, re-triggering the effect with a dependency on allTasks (if saveTasksToLocalStorage modified it indirectly)
    // or by forcing a re-fetch if this were a full server delete.
    // A simple way for client-side only for demo:
    const newInitialTasks = initialTasks.filter(t => !tasksToDeleteIds.includes(t.id));
    // This line would be: router.refresh() if delete was a server action
    // For now, to re-trigger the useEffect and grouping:
    const event = new CustomEvent('tasksUpdated', { detail: newInitialTasks });
    window.dispatchEvent(event); // This is a bit of a hack for client-side demo.
                                 // In a real app, server action + router.refresh() is cleaner.
  };

  // This useEffect is a placeholder for how you might re-process if tasks change client-side
  // In a real app with server actions, router.refresh() would lead to new initialTasks prop.
  useEffect(() => {
    const handleTasksUpdated = (event: Event) => {
        const updatedInitialTasks = (event as CustomEvent).detail;
        // Re-run the grouping logic (copied from the main useEffect)
        setIsLoading(true);
        const processedTasks = updatedInitialTasks.map((task: Task) => ({
          ...task,
          dueDate: new Date(task.dueDate),
          createdAt: task.createdAt ? new Date(task.createdAt) : new Date(0),
          subtaskIds: task.subtaskIds || [],
          formattedDueDate: format(new Date(task.dueDate), 'MMM d, yyyy', { locale: localeID }),
        }));
        setAllTasks(processedTasks);

        const groups: TaskGroup[] = [];
        const openByDefault: string[] = [];
        TASK_STATUS_ORDER.forEach(statusKey => {
          const topLevelTasksInStatus = processedTasks
            .filter((task: TaskWithFormattedDate) => !task.parentId && task.status === statusKey)
            .sort((a: TaskWithFormattedDate, b: TaskWithFormattedDate) => {
              const dueDateComparison = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
              if (dueDateComparison !== 0) return dueDateComparison;
              const createdAtA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
              const createdAtB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
              return createdAtA - createdAtB;
            });
          if (topLevelTasksInStatus.length > 0) {
            groups.push({
              status: statusKey,
              displayName: `${statusKey} (${topLevelTasksInStatus.length})`,
              tasks: topLevelTasksInStatus,
              count: topLevelTasksInStatus.length,
            });
            if (statusKey === 'To Do' || statusKey === 'In Progress') {
                 openByDefault.push(statusKey);
            }
          }
        });
        setTaskGroups(groups);
        setDefaultAccordionOpen(openByDefault);
        setIsLoading(false);
    };
    window.addEventListener('tasksUpdated', handleTasksUpdated);
    return () => window.removeEventListener('tasksUpdated', handleTasksUpdated);
  }, []);


  const getStatusBadgeVariant = (status: Task['status']) => {
    switch (status) {
      case 'To Do': return 'outline';
      case 'In Progress': return 'secondary';
      case 'Pending Review': return 'default';
      case 'Approved': return 'default';
      case 'Pending Notarization': return 'secondary';
      case 'Ready for Notarization': return 'default';
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
          <CardDescription>
            {taskGroups.length > 0 ? `Tasks are grouped by status. ${allTasks.filter(t => !t.parentId).length} top-level tasks shown across all groups.` : 'No tasks found.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {taskGroups.length > 0 ? (
            <Accordion type="multiple" defaultValue={defaultAccordionOpen} className="w-full">
              {taskGroups.map((group) => (
                <AccordionItem value={group.status} key={group.status}>
                  <AccordionTrigger className="hover:no-underline text-lg font-medium py-3 px-2 hover:bg-muted/50 rounded-md">
                    <div className="flex items-center gap-2">
                        <Badge variant={getStatusBadgeVariant(group.status)} className="text-xs px-2 py-0.5">{group.status}</Badge>
                        <span>{group.status}</span>
                        <Badge variant="outline" className="text-xs">{group.count}</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pt-1 pb-3">
                    {group.tasks.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-foreground">Title</TableHead>
                          <TableHead className="text-foreground">Job Number</TableHead>
                          <TableHead className="text-foreground">Priority</TableHead>
                          <TableHead className="text-foreground">Due Date</TableHead>
                          <TableHead className="flex items-center gap-1 text-foreground"><User className="h-4 w-4" />Assigned To</TableHead>
                          <TableHead className="text-foreground">Subtasks</TableHead>
                          <TableHead className="text-right text-foreground">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.tasks.map((parentTask) => (
                          <React.Fragment key={parentTask.id}>
                            <TableRow className="hover:bg-muted/50">
                              <TableCell className="font-medium text-foreground">
                                <div className="flex items-center gap-1">
                                  {parentTask.subtaskIds && parentTask.subtaskIds.length > 0 ? (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 p-0 hover:bg-accent/50"
                                      onClick={() => toggleTaskExpansion(parentTask.id)}
                                    >
                                      {expandedTasks[parentTask.id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                    </Button>
                                  ) : (
                                    <span className="inline-block w-6"></span>
                                  )}
                                  <Link href={`/tasks/${parentTask.id}/edit`} className="hover:underline text-primary ml-1">
                                    {parentTask.title}
                                  </Link>
                                </div>
                              </TableCell>
                              <TableCell className="text-foreground">
                                  {parentTask.jobNumber ? (
                                      <Badge variant="outline" className="flex items-center gap-1 text-xs">
                                          <Hash className="h-3 w-3" />
                                          {parentTask.jobNumber}
                                      </Badge>
                                  ) : (
                                      <span className="text-xs text-foreground">N/A</span>
                                  )}
                              </TableCell>
                              <TableCell>
                                <Badge variant={getPriorityBadgeVariant(parentTask.priority)}>{parentTask.priority}</Badge>
                              </TableCell>
                              <TableCell className="text-foreground" suppressHydrationWarning>{parentTask.formattedDueDate || <Loader2 className="h-3 w-3 animate-spin inline-block" />}</TableCell>
                              <TableCell className="text-foreground">{parentTask.assignedToName || parentTask.assignedTo || 'Unassigned'}</TableCell>
                              <TableCell className="text-center text-foreground">
                                {parentTask.subtaskIds && parentTask.subtaskIds.length > 0 ? (
                                  <Badge variant="outline" className="flex items-center gap-1">
                                    <GitMerge className="h-3 w-3" />
                                    {parentTask.subtaskIds.length}
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
                                      <Link href={`/tasks/${parentTask.id}/edit`}><Eye className="mr-2 h-4 w-4" />View/Edit Details</Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => setTaskToDelete(parentTask)} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                                      <Trash2 className="mr-2 h-4 w-4" />Delete Task
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                            {expandedTasks[parentTask.id] &&
                              allTasks
                                .filter(subtask => subtask.parentId === parentTask.id)
                                .sort((a,b) => { // Sort subtasks
                                    const createdAtA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                                    const createdAtB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                                    return createdAtA - createdAtB;
                                })
                                .map(subtask => (
                                  <TableRow key={subtask.id} className="bg-muted/30 hover:bg-muted/50">
                                    <TableCell className="font-medium text-foreground pl-10">
                                      <div className="flex items-center">
                                        <CornerDownRight className="h-4 w-4 text-muted-foreground mr-2" />
                                        <Link href={`/tasks/${subtask.id}/edit`} className="hover:underline text-primary">
                                          {subtask.title}
                                        </Link>
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-foreground">
                                        {subtask.jobNumber ? (
                                            <Badge variant="outline" className="flex items-center gap-1 text-xs">
                                                <Hash className="h-3 w-3" />
                                                {subtask.jobNumber}
                                            </Badge>
                                        ) : (
                                            <span className="text-xs text-foreground">N/A</span>
                                        )}
                                    </TableCell>
                                     <TableCell>
                                      <Badge variant={getPriorityBadgeVariant(subtask.priority)}>{subtask.priority}</Badge>
                                    </TableCell>
                                    <TableCell className="text-foreground" suppressHydrationWarning>{subtask.formattedDueDate || <Loader2 className="h-3 w-3 animate-spin inline-block" />}</TableCell>
                                    <TableCell className="text-foreground">{subtask.assignedToName || subtask.assignedTo || 'Unassigned'}</TableCell>
                                    <TableCell className="text-center text-foreground">-</TableCell> 
                                    <TableCell className="text-right">
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button variant="ghost" size="icon" className="h-8 w-8">
                                            <MoreHorizontal className="h-4 w-4" />
                                            <span className="sr-only">Subtask actions</span>
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                          <DropdownMenuItem asChild>
                                            <Link href={`/tasks/${subtask.id}/edit`}><Eye className="mr-2 h-4 w-4" />View/Edit Details</Link>
                                          </DropdownMenuItem>
                                          <DropdownMenuSeparator />
                                          <DropdownMenuItem onClick={() => setTaskToDelete(subtask)} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                                            <Trash2 className="mr-2 h-4 w-4" />Delete Subtask
                                          </DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </TableCell>
                                  </TableRow>
                                ))}
                          </React.Fragment>
                        ))}
                      </TableBody>
                    </Table>
                     ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">No tasks in "{group.status}" status.</p>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
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
            <AlertDialogTitle>Are you sure you want to delete this {taskToDelete?.parentId ? 'subtask' : 'task'}?</AlertDialogTitle>
            <AlertDialogDescription>
              Task: "{taskToDelete?.title}"<br />
              This action cannot be undone (locally for now){!taskToDelete?.parentId && taskToDelete?.subtaskIds && taskToDelete.subtaskIds.length > 0 ? " and will also \"delete\" its direct subtasks." : "."} Database delete pending.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setTaskToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTask} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete {taskToDelete?.parentId ? 'Subtask' : 'Task'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
