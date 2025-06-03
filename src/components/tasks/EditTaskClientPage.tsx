
'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { Task, User, UserRole } from '@/types';
import { TaskForm, type TaskFormValues } from '@/components/tasks/TaskForm';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, GitMerge, PlusCircle, Trash2, Edit3, FileText, FolderOpen, Send, CheckCircle, Archive, AlertCircle, ThumbsDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { 
  createSubtaskInDB, 
  deleteSubtaskInDB, 
  updateTaskInDB,
  submitTaskForReviewAction,
  approveTaskAction,
  requestChangesTaskAction,
  sendToNotaryAction,
  completeNotarizationAction,
  archiveTaskAction,
} from '@/actions/taskActions';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { Separator } from '@/components/ui/separator';
import { useSession } from 'next-auth/react';


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

interface EditTaskClientPageProps {
  initialTask: Task | null;
  initialSubtasks: Task[];
  allAvailableDocuments: BasicDocumentInfo[];
  parentTaskDocumentDetails?: ParentTaskDocumentDetails | null; // For when initialTask is a subtask
  globallyUsedPrimaryDocIds: string[];
  globallyUsedSupportingDocIds: string[];
  allUsers: Pick<User, 'id' | 'username' | 'email' | 'role' | 'name' | 'createdAt'>[];
}

export function EditTaskClientPage({ 
  initialTask, 
  initialSubtasks, 
  allAvailableDocuments, 
  parentTaskDocumentDetails, // This is for the parent of initialTask (if initialTask is a subtask)
  globallyUsedPrimaryDocIds,
  globallyUsedSupportingDocIds,
  allUsers
}: EditTaskClientPageProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { data: session } = useSession();
  const currentUserRole = session?.user?.role as UserRole | undefined;
  const currentUserId = session?.user?.id;

  const [task, setTask] = useState<Task | null>(initialTask);
  const [subtasks, setSubtasks] = useState<Task[]>(initialSubtasks);

  const [isAddSubtaskDialogOpen, setIsAddSubtaskDialogOpen] = useState(false);
  const [editingSubtask, setEditingSubtask] = useState<Task | null>(null);
  const [isEditSubtaskDialogOpen, setIsEditSubtaskDialogOpen] = useState(false);
  const [subtaskToDelete, setSubtaskToDelete] = useState<Task | null>(null);

  const [isSubmittingForm, setIsSubmittingForm] = useState(false);
  const [isProcessingAction, setIsProcessingAction] = useState(false);


  useEffect(() => {
    setTask(initialTask);
    setSubtasks(initialSubtasks.map(st => ({...st, dueDate: new Date(st.dueDate)})));
  }, [initialTask, initialSubtasks]);

  const isMainFormReadOnly = useCallback(() => {
    if (!task || !currentUserRole || !currentUserId) return true;
    if (currentUserRole === 'admin') return false;

    switch (currentUserRole) {
      case 'staff':
        return !(task.assignedTo === currentUserId && (task.status === 'To Do' || task.status === 'In Progress'));
      case 'manager':
        // Managers can edit tasks in these states, e.g., to assign or update details before approval
        return !(['To Do', 'In Progress', 'Pending Review', 'Approved'].includes(task.status));
      case 'cs':
        // CS can edit tasks they are preparing ('To Do' and assigned to them or unassigned)
        // Once submitted or in other states, form is read-only for them; actions are via buttons.
        return !(task.status === 'To Do' && (task.assignedTo === currentUserId || !task.assignedTo));
      case 'notary':
        // Notaries generally don't edit task details; actions are via buttons.
        return true; 
      default:
        return true;
    }
  }, [task, currentUserRole, currentUserId]);
  
  const canCurrentUserAddSubtask = () => {
      if (!currentUserRole || !task) return false;
      // Only Admin and Manager can add subtasks
      if (currentUserRole === 'admin' || currentUserRole === 'manager') {
         // And only if the parent task is in a state where subtasks make sense
         const modifiableParentStatuses: Task['status'][] = ['To Do', 'In Progress', 'Pending Review', 'Approved'];
         return modifiableParentStatuses.includes(task.status);
      }
      return false;
  };

  const canCurrentUserEditSubtask = (subtask: Task) => {
    if (!currentUserRole || !currentUserId) return false;
    if (currentUserRole === 'admin' || currentUserRole === 'manager') return true; 
    if (currentUserRole === 'staff' && subtask.assignedTo === currentUserId) {
        return subtask.status === 'To Do' || subtask.status === 'In Progress';
    }
    return false;
  };

  const canCurrentUserDeleteSubtask = (subtask: Task) => {
    if (!currentUserRole) return false;
    // Only Admin and Manager can delete subtasks
    return currentUserRole === 'admin' || currentUserRole === 'manager';
  };

  const handleUpdateMainTask = async (values: TaskFormValues) => {
    if (!task) return;
    setIsSubmittingForm(true);
    const result = await updateTaskInDB(task.id, values);
    setIsSubmittingForm(false);

    if (result.success) {
      toast({
        title: 'Task Updated',
        description: `Task "${values.title}" has been successfully updated.`,
      });
      router.refresh();
    } else {
      toast({
        title: 'Error Updating Task',
        description: result.error || 'An unexpected error occurred.',
        variant: 'destructive',
      });
    }
  };

  const handleAddSubtask = async (values: TaskFormValues) => {
    if (!task) return;
    setIsSubmittingForm(true);
    const result = await createSubtaskInDB(values, task.id);
    setIsSubmittingForm(false);

    if (result.success && result.subtaskId) {
      toast({
        title: 'Subtask Created',
        description: `Subtask "${values.title}" has been successfully created for task "${task.title}".`,
      });
      setIsAddSubtaskDialogOpen(false);
      router.refresh();
    } else {
      toast({
        title: 'Error Creating Subtask',
        description: result.error || 'An unexpected error occurred.',
        variant: 'destructive',
      });
    }
  };

  const handleOpenEditSubtaskDialog = (subtaskToEdit: Task) => {
    setEditingSubtask({...subtaskToEdit, dueDate: new Date(subtaskToEdit.dueDate)});
    setIsEditSubtaskDialogOpen(true);
  };

  const handleUpdateSubtask = async (values: TaskFormValues) => {
    if (!editingSubtask) return;
    setIsSubmittingForm(true);
    const result = await updateTaskInDB(editingSubtask.id, values);
    setIsSubmittingForm(false);

    if (result.success) {
      toast({
        title: 'Subtask Updated',
        description: `Subtask "${values.title}" has been successfully updated.`,
      });
      setIsEditSubtaskDialogOpen(false);
      setEditingSubtask(null);
      router.refresh();
    } else {
      toast({
        title: 'Error Updating Subtask',
        description: result.error || 'An unexpected error occurred.',
        variant: 'destructive',
      });
    }
  };


  const handleDeleteSubtask = async () => {
    if (!subtaskToDelete) return;
    setIsProcessingAction(true); 
    const result = await deleteSubtaskInDB(subtaskToDelete.id);
    setIsProcessingAction(false);

    if (result.success) {
      toast({
        title: 'Subtask Deleted',
        description: `Subtask "${subtaskToDelete.title}" has been successfully deleted.`,
      });
       setSubtaskToDelete(null); 
      router.refresh();
    } else {
      toast({
        title: 'Error Deleting Subtask',
        description: result.error || 'An unexpected error occurred.',
        variant: 'destructive',
      });
    }
  };
  
  const handleWorkflowAction = async (
    action: () => Promise<{success: boolean, error?: string, message?: string }>, 
  ) => {
    if (!task) return;
    setIsProcessingAction(true);
    const result = await action();
    setIsProcessingAction(false);
    if (result.success) {
        toast({ title: "Workflow Action Successful", description: result.message || "Action completed." });
        router.refresh(); // This re-fetches data for the page, including task and subtasks
    } else {
        toast({ title: "Workflow Action Failed", description: `${result.error || 'Unknown error'}`, variant: "destructive" });
    }
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

  if (!task && initialTask === null) { 
    return (
      <div className="container mx-auto py-8 px-4 md:px-6 flex justify-center items-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2 text-muted-foreground">Loading task details...</p>
      </div>
    );
  }
  
  const currentReadOnlyState = isMainFormReadOnly();

  // Contextual documents from the parent of the main task (if initialTask is a subtask)
  const parentDocsForMainTaskForm = task?.parentId && parentTaskDocumentDetails ? parentTaskDocumentDetails : null;

  // Contextual documents for the subtask edit dialog (documents of 'task', which is the parent of 'editingSubtask')
  const parentDocsForSubtaskDialog: ParentTaskDocumentDetails | null = task ? {
    title: task.title,
    primaryDocument: task.primaryDocument,
    supportingDocuments: task.supportingDocuments,
  } : null;


  return (
    <>
      {/* Display documents of parent if the main task is a subtask */}
      {parentDocsForMainTaskForm && (
        <Card className="mb-6 bg-muted/30 border-dashed border-accent shadow-sm">
            <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2 text-accent">
                <FolderOpen className="h-5 w-5" />
                Context: Parent Task Documents ({parentDocsForMainTaskForm.title})
                </CardTitle>
                <CardDescription className="text-xs">
                These documents are from this task's parent.
                </CardDescription>
            </CardHeader>
            <CardContent className="text-sm space-y-3">
                {parentDocsForMainTaskForm.primaryDocument ? (
                <div>
                    <p className="font-semibold text-foreground">Primary Document:</p>
                    <div className="flex items-center gap-2 p-2 rounded-md bg-background/70">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span>{parentDocsForMainTaskForm.primaryDocument.name}</span>
                    {parentDocsForMainTaskForm.primaryDocument.type && (
                        <Badge variant="outline" className="text-xs">{parentDocsForMainTaskForm.primaryDocument.type}</Badge>
                    )}
                    </div>
                </div>
                ) : (
                <p className="text-muted-foreground">No primary document attached to parent.</p>
                )}
                {parentDocsForMainTaskForm.supportingDocuments && parentDocsForMainTaskForm.supportingDocuments.length > 0 ? (
                <div>
                    <p className="font-semibold text-foreground mt-2">Supporting Documents:</p>
                    <ul className="space-y-1 mt-1">
                    {parentDocsForMainTaskForm.supportingDocuments.map(doc => (
                        <li key={doc.id} className="flex items-center gap-2 p-1.5 rounded-md bg-background/70">
                        <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span>{doc.name}</span>
                        {doc.type && <Badge variant="outline" className="text-xs">{doc.type}</Badge>}
                        </li>
                    ))}
                    </ul>
                </div>
                ) : (
                <p className="text-muted-foreground mt-2">No supporting documents attached to parent.</p>
                )}
            </CardContent>
        </Card>
      )}


      <Card className="shadow-lg mx-auto">
        <CardHeader>
          <CardTitle>Task Details: {task?.title || 'Loading...'}</CardTitle>
          <CardDescription>
            {currentReadOnlyState ? "Viewing task details." : "Update the information for this task."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {task ? (
            <TaskForm
              key={task.id} 
              initialData={task}
              onSubmit={handleUpdateMainTask}
              onCancel={() => router.back()} 
              allAvailableDocuments={allAvailableDocuments}
              globallyUsedPrimaryDocIds={globallyUsedPrimaryDocIds}
              globallyUsedSupportingDocIds={globallyUsedSupportingDocIds}
              allUsers={allUsers}
              isReadOnly={currentReadOnlyState || isSubmittingForm}
              // parentContextDocuments is not for the main form here, but for subtask forms in dialogs
            />
          ) : (
            <div className="flex justify-center items-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="ml-2 text-muted-foreground">Loading form...</p>
            </div>
          )}
        </CardContent>
      </Card>

      {task && (
        <Card className="shadow-lg mx-auto mt-8">
          <CardHeader>
            <CardTitle>Workflow Actions</CardTitle>
            <CardDescription>Perform actions based on the current task status: <Badge variant={getStatusBadgeVariant(task.status)}>{task.status}</Badge></CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {currentUserRole === 'staff' && task.assignedTo === currentUserId && (task.status === 'In Progress' || task.status === 'To Do') && (
              <Button onClick={() => handleWorkflowAction(() => submitTaskForReviewAction(task.id))} disabled={isProcessingAction}>
                {isProcessingAction ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Submit for Review
              </Button>
            )}

            {currentUserRole === 'cs' && task.status === 'To Do' && (task.assignedTo === currentUserId || !task.assignedTo) && (
              <Button onClick={() => handleWorkflowAction(() => submitTaskForReviewAction(task.id))} disabled={isProcessingAction}>
                {isProcessingAction ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Submit for Manager Review
              </Button>
            )}

            {currentUserRole === 'manager' && task.status === 'Pending Review' && (
              <div className="flex gap-2 flex-wrap">
                <Button onClick={() => handleWorkflowAction(() => approveTaskAction(task.id))} disabled={isProcessingAction} className="bg-green-600 hover:bg-green-700 text-white">
                  {isProcessingAction ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />} Approve Task
                </Button>
                <Button variant="outline" onClick={() => handleWorkflowAction(() => requestChangesTaskAction(task.id))} disabled={isProcessingAction}>
                  {isProcessingAction ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ThumbsDown className="mr-2 h-4 w-4" />} Request Changes
                </Button>
              </div>
            )}

            {currentUserRole === 'cs' && task.status === 'Approved' && (
              <Button onClick={() => handleWorkflowAction(() => sendToNotaryAction(task.id))} disabled={isProcessingAction}>
                {isProcessingAction ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Send to Notary Pool
              </Button>
            )}

            {currentUserRole === 'notary' && task.status === 'Pending Notarization' && (task.assignedTo === currentUserId || !task.assignedTo) && ( 
              <Button onClick={() => handleWorkflowAction(() => completeNotarizationAction(task.id))} disabled={isProcessingAction} className="bg-blue-600 hover:bg-blue-700 text-white">
                 {isProcessingAction ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />} Mark Notarization Complete
              </Button>
            )}
            
            {currentUserRole === 'cs' && task.status === 'Notarization Complete' && (
               <Button onClick={() => handleWorkflowAction(() => archiveTaskAction(task.id))} disabled={isProcessingAction}>
                {isProcessingAction ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Archive className="mr-2 h-4 w-4" />} Archive Task
              </Button>
            )}
            
            { task.status === 'Blocked' && (currentUserRole === 'admin' || currentUserRole === 'manager') && (
                 <p className="text-sm text-destructive flex items-center"><AlertCircle className="mr-2 h-4 w-4" /> This task is currently Blocked. Resolve the issue and update status via the form above.</p>
            )}
             { task.status === 'Archived' && (
                 <p className="text-sm text-green-600 flex items-center"><CheckCircle className="mr-2 h-4 w-4" /> This task has been Archived.</p>
            )}
             
             {!isProcessingAction && 
                !(
                  (currentUserRole === 'staff' && task.assignedTo === currentUserId && (task.status === 'In Progress' || task.status === 'To Do')) ||
                  (currentUserRole === 'cs' && task.status === 'To Do' && (task.assignedTo === currentUserId || !task.assignedTo)) ||
                  (currentUserRole === 'manager' && task.status === 'Pending Review') ||
                  (currentUserRole === 'cs' && task.status === 'Approved') ||
                  (currentUserRole === 'notary' && task.status === 'Pending Notarization' && (task.assignedTo === currentUserId || !task.assignedTo)) ||
                  (currentUserRole === 'cs' && task.status === 'Notarization Complete') ||
                  (task.status === 'Blocked' && (currentUserRole === 'admin' || currentUserRole === 'manager')) ||
                  task.status === 'Archived' 
                ) && (
                <p className="text-sm text-muted-foreground">No specific workflow actions available for you on this task in its current state.</p>
             )}


          </CardContent>
        </Card>
      )}


      <Dialog open={isAddSubtaskDialogOpen} onOpenChange={setIsAddSubtaskDialogOpen}>
        <DialogContent className="sm:max-w-[625px]">
          <DialogHeader>
            <DialogTitle>Add New Subtask</DialogTitle>
            <DialogDescription>
              Fill in the details for the new subtask for "{task?.title}".
            </DialogDescription>
          </DialogHeader>
          <TaskForm
            key={task ? task.id + '-new-subtask' : 'new-subtask-form'}
            onSubmit={handleAddSubtask}
            onCancel={() => setIsAddSubtaskDialogOpen(false)}
            allAvailableDocuments={allAvailableDocuments}
            globallyUsedPrimaryDocIds={globallyUsedPrimaryDocIds} 
            globallyUsedSupportingDocIds={globallyUsedSupportingDocIds}
            allUsers={allUsers}
            isReadOnly={isSubmittingForm} 
            parentContextDocuments={parentDocsForSubtaskDialog} // Pass parent (main task) documents here
          />
        </DialogContent>
      </Dialog>

      <Dialog open={isEditSubtaskDialogOpen} onOpenChange={(isOpen) => {
        setIsEditSubtaskDialogOpen(isOpen);
        if (!isOpen) setEditingSubtask(null);
      }}>
        <DialogContent className="sm:max-w-[625px]">
          <DialogHeader>
            <DialogTitle>Edit Subtask: {editingSubtask?.title}</DialogTitle>
            <DialogDescription>Update the details for this subtask.</DialogDescription>
          </DialogHeader>
          {editingSubtask && (
            <>
              <TaskForm
                key={editingSubtask.id} 
                initialData={editingSubtask}
                onSubmit={handleUpdateSubtask}
                onCancel={() => { 
                  setIsEditSubtaskDialogOpen(false);
                  setEditingSubtask(null);
                }}
                allAvailableDocuments={allAvailableDocuments}
                globallyUsedPrimaryDocIds={globallyUsedPrimaryDocIds}
                globallyUsedSupportingDocIds={globallyUsedSupportingDocIds}
                allUsers={allUsers}
                isReadOnly={isSubmittingForm || !canCurrentUserEditSubtask(editingSubtask)}
                parentContextDocuments={parentDocsForSubtaskDialog} // Pass parent (main task) documents here
              />
            </>
          )}
        </DialogContent>
      </Dialog>


      <Card className="shadow-lg mx-auto mt-8">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <GitMerge className="h-6 w-6 text-primary" />
              <CardTitle>Subtasks</CardTitle>
            </div>
             {canCurrentUserAddSubtask() && (
                <Button variant="outline" size="sm" onClick={() => setIsAddSubtaskDialogOpen(true)} disabled={isProcessingAction || currentReadOnlyState}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Add Subtask
                </Button>
             )}
          </div>
          <CardDescription>
            {subtasks && subtasks.length > 0 ? `This task has ${subtasks.length} subtask(s).` : 'No subtasks yet for this task or relevant to you.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {subtasks && subtasks.length > 0 ? (
            <ul className="space-y-3">
              {subtasks.map(sub => (
                <li key={sub.id} className="p-3 border rounded-md bg-muted/50 flex justify-between items-start group">
                  <div>
                    <h4 className="font-semibold text-foreground">{sub.title}</h4>
                    <p className="text-sm text-muted-foreground mt-1">Assigned to: {allUsers.find(u => u.id === sub.assignedTo)?.name || allUsers.find(u => u.id === sub.assignedTo)?.username || sub.assignedTo || 'N/A'}</p>
                    <p className="text-sm text-muted-foreground" suppressHydrationWarning={true}>Due: {format(new Date(sub.dueDate), 'MMM d, yyyy')}</p>
                    <Badge variant={getStatusBadgeVariant(sub.status)} className="mt-1 text-xs">{sub.status}</Badge>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {canCurrentUserEditSubtask(sub) && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:bg-primary/10" onClick={() => handleOpenEditSubtaskDialog(sub)} disabled={isProcessingAction}>
                        <Edit3 className="h-4 w-4" />
                        <span className="sr-only">Edit Subtask</span>
                        </Button>
                    )}
                    {canCurrentUserDeleteSubtask(sub) && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => setSubtaskToDelete(sub)} disabled={isProcessingAction}>
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Delete Subtask</span>
                        </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
                {canCurrentUserAddSubtask() ? 'Click "Add Subtask" to create the first one.' : 'No subtasks assigned or available for viewing.'}
            </p>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!subtaskToDelete} onOpenChange={(open) => !open && setSubtaskToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete this subtask?</AlertDialogTitle>
            <AlertDialogDescription>
              Subtask: "{subtaskToDelete?.title}"<br />
              This action cannot be undone and will permanently remove the subtask.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSubtaskToDelete(null)} disabled={isProcessingAction || isSubmittingForm}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSubtask}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isProcessingAction || isSubmittingForm || !canCurrentUserDeleteSubtask(subtaskToDelete!)}
            >
              {(isProcessingAction || isSubmittingForm) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete Subtask
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
