
'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { Task, User, UserRole } from '@/types';
import { TaskForm, type TaskFormValues } from '@/components/tasks/TaskForm';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, GitMerge, PlusCircle, Trash2, Edit3, FileText, FolderOpen, Send, CheckCircle, Archive, AlertCircle, ThumbsDown, FileSignature, Undo2, Download } from 'lucide-react';
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
  markReadyForNotarizationAction, 
  completeNotarizationAction,
  archiveTaskAction,
  revertTaskToPendingNotarizationAction,
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
import { downloadDocumentData } from '@/actions/documentActions';
import { triggerBrowserDownload } from '@/lib/downloadUtils';
import { ScrollArea } from '@/components/ui/scroll-area';


interface BasicDocumentInfo {
  id: string;
  name: string;
  type?: string;
}

interface ParentTaskDocumentDetails {
  title: string;
  documents: Task['documents'] | null;
}

interface EditTaskClientPageProps {
  initialTask: Task | null;
  initialSubtasks: Task[];
  allAvailableDocuments: BasicDocumentInfo[];
  parentTaskDocumentDetails?: ParentTaskDocumentDetails | null; 
  allUsers: Pick<User, 'id' | 'username' | 'email' | 'role' | 'name' | 'createdAt'>[];
}

export function EditTaskClientPage({ 
  initialTask, 
  initialSubtasks, 
  allAvailableDocuments, 
  parentTaskDocumentDetails, 
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
  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null);


  useEffect(() => {
    setTask(initialTask);
    setSubtasks(initialSubtasks.map(st => ({...st, dueDate: new Date(st.dueDate)})));
  }, [initialTask, initialSubtasks]);

  const isTaskFormReadOnly = useCallback(() => {
    if (!task || !currentUserRole || !currentUserId) return true;
    if (task.status === 'Archived') return true; 
    if (currentUserRole === 'admin') return false;

    if (task.parentId) { // Current task IS a subtask
        switch (currentUserRole) {
            case 'staff':
                return !(task.assignedTo === currentUserId && (task.status === 'To Do' || task.status === 'In Progress'));
            case 'cs':
                 return !( (task.status === 'To Do' && (task.assignedTo === currentUserId || !task.assignedTo)) );
            case 'manager':
                return !(task.status === 'Pending Review');
            default: return true;
        }
    } else { // Current task is a PARENT task
        switch (currentUserRole) {
            case 'staff':
              return !(task.assignedTo === currentUserId && (task.status === 'To Do' || task.status === 'In Progress'));
            case 'manager':
              return !(['To Do', 'In Progress', 'Pending Review', 'Approved', 'Pending Notarization'].includes(task.status));
            case 'cs':
              return !(
                (task.status === 'To Do' && (task.assignedTo === currentUserId || !task.assignedTo)) ||
                (task.status === 'Pending Notarization' && (task.assignedTo === currentUserId || !task.assignedTo))
              );
            case 'notary':
              return true; 
            default:
              return true;
          }
    }
  }, [task, currentUserRole, currentUserId]);
  
  const canCurrentUserAddSubtask = () => {
      if (!currentUserRole || !task) return false;
      if (task.status === 'Archived' || task.parentId) return false; 
      if (currentUserRole === 'admin' || currentUserRole === 'manager') {
         const modifiableParentStatuses: Task['status'][] = ['To Do', 'In Progress', 'Pending Review', 'Approved', 'Pending Notarization'];
         return modifiableParentStatuses.includes(task.status);
      }
      return false;
  };

  const canCurrentUserEditSubtask = (subtask: Task) => {
    if (!currentUserRole || !currentUserId) return false;
    if (subtask.status === 'Archived') return false; 
    if (currentUserRole === 'admin' || currentUserRole === 'manager') return true; 
    if (currentUserRole === 'staff' && subtask.assignedTo === currentUserId) {
        return subtask.status === 'To Do' || subtask.status === 'In Progress';
    }
    if (currentUserRole === 'cs' && (subtask.assignedTo === currentUserId || !subtask.assignedTo)) {
        return subtask.status === 'To Do'; 
    }
    return false;
  };

  const canCurrentUserDeleteSubtask = (subtask: Task) => {
    if (!currentUserRole) return false;
    if (subtask.status === 'Archived') return false; 
    return currentUserRole === 'admin' || currentUserRole === 'manager';
  };

  const handleUpdateMainTask = async (values: TaskFormValues) => {
    if (!task) return;
    setIsSubmittingForm(true);
    const result = await updateTaskInDB(task.id, values);
    setIsSubmittingForm(false);

    if (result.success) {
      toast({
        title: 'Tugas Diperbarui',
        description: `Tugas "${values.title}" berhasil diperbarui.`,
      });
      router.refresh();
    } else {
      toast({
        title: 'Error Memperbarui Tugas',
        description: result.error || 'Terjadi kesalahan tak terduga.',
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
        title: 'Subtugas Dibuat',
        description: `Subtugas "${values.title}" berhasil dibuat untuk tugas "${task.title}".`,
      });
      setIsAddSubtaskDialogOpen(false);
      router.refresh();
    } else {
      toast({
        title: 'Error Membuat Subtugas',
        description: result.error || 'Terjadi kesalahan tak terduga.',
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
        title: 'Subtugas Diperbarui',
        description: `Subtugas "${values.title}" berhasil diperbarui.`,
      });
      setIsEditSubtaskDialogOpen(false);
      setEditingSubtask(null);
      router.refresh();
    } else {
      toast({
        title: 'Error Memperbarui Subtugas',
        description: result.error || 'Terjadi kesalahan tak terduga.',
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
        title: 'Subtugas Dihapus',
        description: `Subtugas "${subtaskToDelete.title}" berhasil dihapus.`,
      });
       setSubtaskToDelete(null); 
      router.refresh();
    } else {
      toast({
        title: 'Error Menghapus Subtugas',
        description: result.error || 'Terjadi kesalahan tak terduga.',
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
        toast({ title: "Aksi Alur Kerja Berhasil", description: result.message || "Aksi selesai." });
        router.refresh(); 
    } else {
        toast({ title: "Aksi Alur Kerja Gagal", description: `${result.error || 'Error tidak diketahui'}`, variant: "destructive" });
    }
  };

  const handleDownloadDocument = async (docId: string, docName?: string) => {
    if (!docId) {
        toast({ title: "Error", description: "ID Dokumen hilang.", variant: "destructive" });
        return;
    }
    setDownloadingDocId(docId);
    try {
        const result = await downloadDocumentData(docId);
        if (result.success && result.data && result.fileName && result.mimeType) {
            triggerBrowserDownload(result.fileName, result.mimeType, result.data);
            toast({ title: "Unduhan Dimulai", description: `Mengunduh ${result.fileName}.`});
        } else {
            toast({ title: "Gagal Mengunduh", description: result.error || `Tidak dapat mengunduh ${docName || 'file'}.`, variant: "destructive"});
        }
    } catch (error: any) {
        toast({ title: "Kesalahan Unduh", description: error.message || "Terjadi kesalahan tak terduga.", variant: "destructive"});
    }
    setDownloadingDocId(null);
  };


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

  if (!task && initialTask === null) { 
    return (
      <div className="container mx-auto py-8 px-4 md:px-6 flex justify-center items-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2 text-muted-foreground">Memuat detail tugas...</p>
      </div>
    );
  }
  
  const currentReadOnlyState = isTaskFormReadOnly();
  const parentDocsForMainTaskForm = task?.parentId && parentTaskDocumentDetails ? parentTaskDocumentDetails : null;
  const parentDocsForSubtaskDialog: ParentTaskDocumentDetails | null = task ? {
    title: task.title,
    documents: task.documents,
  } : null;

  const showWorkflowActions = task && task.status !== 'Archived';


  return (
    <>
      {parentDocsForMainTaskForm && parentDocsForMainTaskForm.documents && (
        <Card className="mb-6 bg-muted/30 border-dashed border-accent shadow-sm">
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-accent">
                <FolderOpen className="h-5 w-5" />
                Konteks: Dokumen Tugas Induk ({parentDocsForMainTaskForm.title})
                </CardTitle>
                <CardDescription className="text-xs">
                Dokumen-dokumen ini berasal dari tugas induk dan ditampilkan untuk konteks.
                </CardDescription>
            </CardHeader>
            <CardContent className="text-sm space-y-3 pt-2">
                {parentDocsForMainTaskForm.documents.length > 0 ? (
                <div>
                    <p className="font-semibold text-foreground mt-2">Dokumen Terlampir pada Induk:</p>
                    <ScrollArea className="h-24 mt-1">
                        <ul className="space-y-1 mt-1">
                        {parentDocsForMainTaskForm.documents.map(doc => (
                            <li key={doc.id} className="flex items-center gap-2 p-1.5 rounded-md bg-background/70">
                            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <span className="flex-grow">{doc.name}</span>
                            {doc.type && <Badge variant="outline" className="text-xs flex-shrink-0">{doc.type}</Badge>}
                            {doc.ownCloudPath && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 ml-1 flex-shrink-0"
                                    onClick={() => handleDownloadDocument(doc.id, doc.name)}
                                    disabled={downloadingDocId === doc.id}
                                >
                                    {downloadingDocId === doc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 text-muted-foreground hover:text-primary" />}
                                    <span className="sr-only">Unduh dokumen induk</span>
                                </Button>
                            )}
                            </li>
                        ))}
                        </ul>
                    </ScrollArea>
                </div>
                ) : (
                <p className="text-muted-foreground mt-2">Tidak ada dokumen yang dilampirkan pada induk.</p>
                )}
            </CardContent>
        </Card>
      )}


      <Card className="shadow-lg mx-auto">
        <CardHeader>
          <CardTitle>Detail {task?.parentId ? "Subtugas" : "Tugas"}: {task?.title || 'Memuat...'}</CardTitle>
          <CardDescription>
            {currentReadOnlyState ? `Melihat detail ${task?.parentId ? "subtugas" : "tugas"}.` : `Perbarui informasi untuk ${task?.parentId ? "subtugas" : "tugas"} ini.`}
             {task?.status === 'Archived' && <span className="text-primary font-semibold ml-1">(Diarsipkan - Hanya Baca)</span>}
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
              allUsers={allUsers}
              isReadOnly={currentReadOnlyState || isSubmittingForm}
              parentContextDocuments={parentDocsForMainTaskForm}
            />
          ) : (
            <div className="flex justify-center items-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="ml-2 text-muted-foreground">Memuat formulir...</p>
            </div>
          )}
        </CardContent>
      </Card>

      {task && showWorkflowActions && (
        <Card className="shadow-lg mx-auto mt-8">
          <CardHeader>
            <CardTitle>Aksi Alur Kerja {task.parentId ? "Subtugas" : "Tugas"}</CardTitle>
            <CardDescription>Lakukan aksi berdasarkan status {task.parentId ? "subtugas" : "tugas"} saat ini: <Badge variant={getStatusBadgeVariant(task.status)}>{task.status}</Badge></CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* --- SUBTASK WORKFLOW ACTIONS --- */}
            {task.parentId && (
              <>
                {/* Staff/CS: Submit Subtask for Review */}
                {(currentUserRole === 'staff' || currentUserRole === 'cs') && 
                 task.assignedTo === currentUserId && 
                 (task.status === 'In Progress' || task.status === 'To Do') && (
                  <Button onClick={() => handleWorkflowAction(() => submitTaskForReviewAction(task.id))} disabled={isProcessingAction}>
                    {isProcessingAction ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Kirim untuk Direview
                  </Button>
                )}
                
                {/* Manager: Approve / Request Changes for Subtask */}
                {currentUserRole === 'manager' && task.status === 'Pending Review' && (
                  <div className="flex gap-2 flex-wrap">
                    <Button onClick={() => handleWorkflowAction(() => approveTaskAction(task.id))} disabled={isProcessingAction} className="bg-green-600 hover:bg-green-700 text-white">
                      {isProcessingAction ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />} Setujui Subtugas
                    </Button>
                    <Button variant="outline" onClick={() => handleWorkflowAction(() => requestChangesTaskAction(task.id))} disabled={isProcessingAction}>
                      {isProcessingAction ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ThumbsDown className="mr-2 h-4 w-4" />} Minta Perubahan (Subtugas)
                    </Button>
                  </div>
                )}
                 {!(
                    ((currentUserRole === 'staff' || currentUserRole === 'cs') && task.assignedTo === currentUserId && (task.status === 'In Progress' || task.status === 'To Do')) ||
                    (currentUserRole === 'manager' && task.status === 'Pending Review')
                 ) && task.status !== 'Approved' && task.status !== 'Archived' && task.status !== 'Blocked' && (
                    <p className="text-sm text-muted-foreground">Tidak ada aksi alur kerja spesifik yang tersedia untuk Anda pada subtugas ini dalam status saat ini.</p>
                 )}
                 { (task.status === 'Approved' || task.status === 'Archived') && (
                    <p className="text-sm text-muted-foreground">Subtugas ini telah {task.status === 'Approved' ? 'disetujui' : 'diarsipkan'} dan tidak memerlukan aksi alur kerja lebih lanjut.</p>
                 )}
              </>
            )}

            {/* --- PARENT TASK WORKFLOW ACTIONS (No parentId means it's a parent task) --- */}
            {!task.parentId && (
              <>
                {/* Staff (Parent): Submit for Review */}
                {currentUserRole === 'staff' && task.assignedTo === currentUserId && (task.status === 'In Progress' || task.status === 'To Do') && (
                  <Button onClick={() => handleWorkflowAction(() => submitTaskForReviewAction(task.id))} disabled={isProcessingAction}>
                    {isProcessingAction ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Kirim untuk Direview
                  </Button>
                )}

                {/* CS (Parent): Submit for Manager Review (if task is 'To Do') */}
                {currentUserRole === 'cs' && task.status === 'To Do' && (task.assignedTo === currentUserId || !task.assignedTo) && (
                  <Button onClick={() => handleWorkflowAction(() => submitTaskForReviewAction(task.id))} disabled={isProcessingAction}>
                    {isProcessingAction ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Kirim untuk Direview Manajer
                  </Button>
                )}
                
                {/* Manager (Parent): Approve / Request Changes (if task 'Pending Review') */}
                {currentUserRole === 'manager' && task.status === 'Pending Review' && (
                  <div className="flex gap-2 flex-wrap">
                    <Button onClick={() => handleWorkflowAction(() => approveTaskAction(task.id))} disabled={isProcessingAction} className="bg-green-600 hover:bg-green-700 text-white">
                      {isProcessingAction ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />} Setujui Tugas
                    </Button>
                    <Button variant="outline" onClick={() => handleWorkflowAction(() => requestChangesTaskAction(task.id))} disabled={isProcessingAction}>
                      {isProcessingAction ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ThumbsDown className="mr-2 h-4 w-4" />} Minta Perubahan
                    </Button>
                  </div>
                )}

                {/* Manager (Parent): Send to CS for Notary Prep (if task 'Approved') */}
                {currentUserRole === 'manager' && task.status === 'Approved' && (
                  <Button onClick={() => handleWorkflowAction(() => sendToNotaryAction(task.id))} disabled={isProcessingAction}>
                    {isProcessingAction ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Kirim untuk Persiapan Notaris (ke CS)
                  </Button>
                )}

                {/* CS (Parent): Mark Ready for Notarization (if task 'Pending Notarization') */}
                {currentUserRole === 'cs' && task.status === 'Pending Notarization' && (task.assignedTo === currentUserId || !task.assignedTo) && (
                  <Button onClick={() => handleWorkflowAction(() => markReadyForNotarizationAction(task.id /*, optionalNotaryId */))} disabled={isProcessingAction} className="bg-blue-500 hover:bg-blue-600 text-white">
                    {isProcessingAction ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSignature className="mr-2 h-4 w-4" />} Tandai Siap untuk Notarisasi
                  </Button>
                )}

                {/* Notary (Parent): Mark Notarization Complete OR Send Back to CS (if task 'Ready for Notarization') */}
                {currentUserRole === 'notary' && task.status === 'Ready for Notarization' && (task.assignedTo === currentUserId || !task.assignedTo) && ( 
                  <div className="flex gap-2 flex-wrap">
                    <Button onClick={() => handleWorkflowAction(() => completeNotarizationAction(task.id))} disabled={isProcessingAction} className="bg-green-600 hover:bg-green-700 text-white">
                       {isProcessingAction ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />} Tandai Notarisasi Selesai
                    </Button>
                    <Button variant="outline" onClick={() => handleWorkflowAction(() => revertTaskToPendingNotarizationAction(task.id))} disabled={isProcessingAction}>
                      {isProcessingAction ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Undo2 className="mr-2 h-4 w-4" />} Kirim Kembali ke CS (Revisi)
                    </Button>
                  </div>
                )}
                
                {/* CS (Parent): Archive Task (if task 'Notarization Complete') */}
                {currentUserRole === 'cs' && task.status === 'Notarization Complete' && (
                   <Button onClick={() => handleWorkflowAction(() => archiveTaskAction(task.id))} disabled={isProcessingAction}>
                    {isProcessingAction ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Archive className="mr-2 h-4 w-4" />} Arsipkan Tugas
                  </Button>
                )}
                
                { task.status === 'Blocked' && (currentUserRole === 'admin' || currentUserRole === 'manager') && (
                     <p className="text-sm text-destructive flex items-center"><AlertCircle className="mr-2 h-4 w-4" /> Tugas ini sedang Diblokir. Selesaikan masalah dan perbarui status melalui formulir di atas.</p>
                )}
                              
                 {!isProcessingAction && 
                    !(
                      (currentUserRole === 'staff' && task.assignedTo === currentUserId && (task.status === 'In Progress' || task.status === 'To Do')) ||
                      (currentUserRole === 'cs' && task.status === 'To Do' && (task.assignedTo === currentUserId || !task.assignedTo)) ||
                      (currentUserRole === 'manager' && task.status === 'Pending Review') ||
                      (currentUserRole === 'manager' && task.status === 'Approved') || 
                      (currentUserRole === 'cs' && task.status === 'Pending Notarization' && (task.assignedTo === currentUserId || !task.assignedTo)) ||
                      (currentUserRole === 'notary' && task.status === 'Ready for Notarization' && (task.assignedTo === currentUserId || !task.assignedTo)) ||
                      (currentUserRole === 'cs' && task.status === 'Notarization Complete') ||
                      (task.status === 'Blocked' && (currentUserRole === 'admin' || currentUserRole === 'manager'))
                    ) && task.status !== 'Archived' && ( 
                    <p className="text-sm text-muted-foreground">Tidak ada aksi alur kerja spesifik yang tersedia untuk Anda pada tugas ini dalam status saat ini.</p>
                 )}
              </>
            )}


          </CardContent>
        </Card>
      )}


      <Dialog open={isAddSubtaskDialogOpen} onOpenChange={setIsAddSubtaskDialogOpen}>
        <DialogContent className="sm:max-w-[625px]">
          <DialogHeader>
            <DialogTitle>Tambah Subtugas Baru</DialogTitle>
            <DialogDescription>
              Isi detail untuk subtugas baru untuk "{task?.title}".
            </DialogDescription>
          </DialogHeader>
          <TaskForm
            key={task ? task.id + '-new-subtask' : 'new-subtask-form'}
            onSubmit={handleAddSubtask}
            onCancel={() => setIsAddSubtaskDialogOpen(false)}
            allAvailableDocuments={allAvailableDocuments}
            allUsers={allUsers}
            isReadOnly={isSubmittingForm} 
            parentContextDocuments={parentDocsForSubtaskDialog} 
          />
        </DialogContent>
      </Dialog>

      <Dialog open={isEditSubtaskDialogOpen} onOpenChange={(isOpen) => {
        setIsEditSubtaskDialogOpen(isOpen);
        if (!isOpen) setEditingSubtask(null);
      }}>
        <DialogContent className="sm:max-w-[625px]">
          <DialogHeader>
            <DialogTitle>Ubah Subtugas: {editingSubtask?.title}</DialogTitle>
            <DialogDescription>Perbarui detail untuk subtugas ini.</DialogDescription>
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
                allUsers={allUsers}
                isReadOnly={isSubmittingForm || !canCurrentUserEditSubtask(editingSubtask)}
                parentContextDocuments={parentDocsForSubtaskDialog} 
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
              <CardTitle>Subtugas</CardTitle>
            </div>
             {canCurrentUserAddSubtask() && (
                <Button variant="outline" size="sm" onClick={() => setIsAddSubtaskDialogOpen(true)} disabled={isProcessingAction || currentReadOnlyState}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Tambah Subtugas
                </Button>
             )}
          </div>
          <CardDescription>
            {subtasks && subtasks.length > 0 ? `Tugas ini memiliki ${subtasks.length} subtugas.` : 'Belum ada subtugas untuk tugas ini atau yang relevan untuk Anda.'}
             {task?.status === 'Archived' && subtasks && subtasks.length > 0 && <span className="text-primary font-semibold ml-1">(Diarsipkan)</span>}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {subtasks && subtasks.length > 0 ? (
            <ul className="space-y-3">
              {subtasks.map(sub => (
                <li key={sub.id} className="p-3 border rounded-md bg-muted/50 flex justify-between items-start group">
                  <div>
                    <h4 className="font-semibold text-foreground">{sub.title}</h4>
                    <p className="text-sm text-muted-foreground mt-1">Ditugaskan kepada: {allUsers.find(u => u.id === sub.assignedTo)?.name || allUsers.find(u => u.id === sub.assignedTo)?.username || sub.assignedTo || 'N/A'}</p>
                    <p className="text-sm text-muted-foreground" suppressHydrationWarning={true}>Tenggat: {format(new Date(sub.dueDate), 'MMM d, yyyy')}</p>
                    <Badge variant={getStatusBadgeVariant(sub.status)} className="mt-1 text-xs">{sub.status}</Badge>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {canCurrentUserEditSubtask(sub) && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:bg-primary/10" onClick={() => handleOpenEditSubtaskDialog(sub)} disabled={isProcessingAction}>
                        <Edit3 className="h-4 w-4" />
                        <span className="sr-only">Ubah Subtugas</span>
                        </Button>
                    )}
                    {canCurrentUserDeleteSubtask(sub) && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => setSubtaskToDelete(sub)} disabled={isProcessingAction}>
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Hapus Subtugas</span>
                        </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
                {canCurrentUserAddSubtask() ? 'Klik "Tambah Subtugas" untuk membuatnya.' : 'Tidak ada subtugas yang ditugaskan atau tersedia untuk dilihat.'}
            </p>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!subtaskToDelete} onOpenChange={(open) => !open && setSubtaskToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apakah Anda yakin ingin menghapus subtugas ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Subtugas: "{subtaskToDelete?.title}"<br />
              Tindakan ini tidak dapat dibatalkan dan akan menghapus subtugas secara permanen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSubtaskToDelete(null)} disabled={isProcessingAction || isSubmittingForm}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSubtask}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isProcessingAction || isSubmittingForm || !subtaskToDelete || !canCurrentUserDeleteSubtask(subtaskToDelete)}
            >
              {(isProcessingAction || isSubmittingForm) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Hapus Subtugas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
