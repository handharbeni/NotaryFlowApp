
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, Controller } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { CalendarIcon, Save, XCircle, UploadCloud, Users, FileText, FolderOpen, Download, Loader2, Hash, Send } from 'lucide-react';
import type { Document, Task, User, UserRole } from '@/types';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { DocumentUploadForm } from '@/components/documents/DocumentUploadForm';
import { ScrollArea } from '@/components/ui/scroll-area';
import { createTaskInDB } from '@/actions/taskActions';
import { requestOriginalDocument, downloadDocumentData } from '@/actions/documentActions';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription as UiCardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { triggerBrowserDownload } from '@/lib/downloadUtils';


interface BasicDocumentInfo {
  id: string;
  name: string;
  type?: string;
  ownCloudPath?: string;
  isOriginalRequested?: boolean;
  originalFileHolderId?: string | null;
}

interface ParentTaskDocumentContext {
  title: string;
  documents: Task['documents'] | null;
}

const taskStatusEnum = z.enum([
  'To Do',
  'In Progress',
  'Pending Review',
  'Approved',
  'Pending Notarization',
  'Ready for Notarization',
  'Notarization Complete',
  'Archived',
  'Blocked'
]);

const taskFormSchema = z.object({
  title: z.string().min(3, { message: 'Judul harus minimal 3 karakter.' }),
  description: z.string().optional().default(''),
  status: taskStatusEnum,
  dueDate: z.date({ required_error: 'Tanggal jatuh tempo diperlukan.' }),
  assignedTo: z.string().optional().nullable().default(''),
  priority: z.enum(['Low', 'Medium', 'High']),
  documentIds: z.array(z.string()).optional().default([]),
});

export type TaskFormValues = z.infer<typeof taskFormSchema>;

interface TaskFormProps {
  initialData?: Task | null;
  onSubmit?: (values: TaskFormValues) => Promise<void>;
  onCancel?: () => void;
  availableDocuments?: BasicDocumentInfo[];
  allUsers?: Pick<User, 'id' | 'name' | 'username' | 'role'>[];
  isReadOnly?: boolean;
  parentContextDocuments?: ParentTaskDocumentContext | null;
}

const statusToExpectedRoles: Record<Task['status'], UserRole[]> = {
  'To Do': ['staff', 'cs', 'admin', 'manager'],
  'In Progress': ['staff', 'cs', 'admin', 'manager'],
  'Pending Review': ['manager', 'admin'],
  'Approved': ['manager', 'cs', 'admin'],
  'Pending Notarization': ['cs', 'admin', 'manager'],
  'Ready for Notarization': ['notary', 'admin', 'manager', 'cs'],
  'Notarization Complete': ['cs', 'admin', 'manager', 'notary'],
  'Archived': ['admin', 'manager', 'cs'],
  'Blocked': ['staff', 'cs', 'manager', 'admin', 'notary'],
};


export function TaskForm({
  initialData,
  onSubmit,
  onCancel,
  availableDocuments = [],
  allUsers = [],
  isReadOnly = false,
  parentContextDocuments,
}: TaskFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { data: session } = useSession();
  const currentUserRole = session?.user?.role as UserRole | undefined;
  const currentUserId = session?.user?.id;

  const [isClient, setIsClient] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [newlyUploadedDocuments, setNewlyUploadedDocuments] = useState<BasicDocumentInfo[]>([]);
  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null);
  const [requestingDocId, setRequestingDocId] = useState<string | null>(null);
  const [selectedDocsForOriginalRequest, setSelectedDocsForOriginalRequest] = useState<string[]>([]);
  const [isBatchRequesting, setIsBatchRequesting] = useState(false);


  useEffect(() => {
    setIsClient(true);
  }, []);

  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: initialData?.title || '',
      description: initialData?.description || '',
      status: initialData?.status || 'To Do',
      dueDate: initialData?.dueDate ? new Date(initialData.dueDate) : new Date(),
      assignedTo: initialData?.assignedTo || 'UNASSIGNED',
      priority: initialData?.priority || 'Medium',
      documentIds: initialData?.documents?.map(doc => doc.id) || [],
    },
  });

  useEffect(() => {
    if (isClient) {
      form.reset({
        title: initialData?.title || '',
        description: initialData?.description || '',
        status: initialData?.status || 'To Do',
        dueDate: initialData?.dueDate ? new Date(initialData.dueDate) : new Date(),
        assignedTo: initialData?.assignedTo || 'UNASSIGNED',
        priority: initialData?.priority || 'Medium',
        documentIds: initialData?.documents?.map(doc => doc.id) || [],
      });
      setNewlyUploadedDocuments([]);
      setSelectedDocsForOriginalRequest([]);
    }
  }, [initialData, form, isClient]);

  const watchedStatus = form.watch('status');

  useEffect(() => {
    if (!isClient || isReadOnly || !allUsers.length || !watchedStatus) return;

    const currentAssignedToId = form.getValues('assignedTo');
    const newStatus = watchedStatus;

    if (currentAssignedToId && currentAssignedToId !== 'UNASSIGNED' && currentAssignedToId !== '') {
      const assignedUser = allUsers.find(user => user.id === currentAssignedToId);
      if (assignedUser && assignedUser.role) {
        const userRole = assignedUser.role as UserRole;
        const expectedRolesForNewStatus = statusToExpectedRoles[newStatus];
        if (expectedRolesForNewStatus && !expectedRolesForNewStatus.includes(userRole)) {
          form.setValue('assignedTo', 'UNASSIGNED', { shouldValidate: true, shouldDirty: true });
          toast({
            title: "Penerima Tugas Direset",
            description: `Penerima tugas direset menjadi 'Tidak Ditugaskan' karena perubahan status ke '${newStatus}' menyiratkan serah terima peran.`,
            variant: "default",
            duration: 5000,
          });
        }
      }
    }
  }, [watchedStatus, isClient, isReadOnly, allUsers, form, toast]);


  const assignableUsers = useMemo(() => {
    if (!allUsers || !allUsers.length) return [];
    const statusToConsider = watchedStatus || initialData?.status || 'To Do';

    const expectedRoles = statusToExpectedRoles[statusToConsider];
    if (!expectedRoles) return allUsers; 

    return allUsers.filter(user => expectedRoles.includes(user.role as UserRole));

  }, [allUsers, watchedStatus, initialData?.status]);


  const internalHandleSubmit = async (values: TaskFormValues) => {
    if (isReadOnly && !initialData) return;

    const submissionValues: TaskFormValues = {
      ...values,
      assignedTo: values.assignedTo === 'UNASSIGNED' || values.assignedTo === '' ? null : values.assignedTo,
      documentIds: values.documentIds || [],
    };

    if (onSubmit) {
      await onSubmit(submissionValues);
    } else if (!initialData) { // Create mode
      const result = await createTaskInDB(submissionValues);
      if (result.success && result.taskId) {
        toast({
          title: 'Tugas Dibuat',
          description: `Tugas "${submissionValues.title}" berhasil dibuat.`,
        });
        router.push(`/tasks/${result.taskId}/edit`);
        router.refresh();
      } else {
        toast({
          title: 'Gagal Membuat Tugas',
          description: result.error || 'Terjadi kesalahan tak terduga.',
          variant: 'destructive',
        });
      }
    }
  };

  const handleCancelClick = () => {
    if (onCancel) {
      onCancel();
    } else {
      router.back();
    }
  };

  const handleDocumentUploadedInModal = (newDoc: Document) => {
    if (newDoc && newDoc.id && newDoc.name) {
      setNewlyUploadedDocuments(prev => {
        if (prev.find(d => d.id === newDoc.id)) return prev;
        return [...prev, { 
            id: newDoc.id, 
            name: newDoc.name, 
            type: newDoc.type, 
            ownCloudPath: newDoc.ownCloudPath,
            isOriginalRequested: newDoc.isOriginalRequested,
            originalFileHolderId: newDoc.originalFileHolderId
        }];
      });
      
      const currentDocIds = form.getValues('documentIds') || [];
      if (!currentDocIds.includes(newDoc.id)) {
        form.setValue('documentIds', [...currentDocIds, newDoc.id], { shouldDirty: true, shouldValidate: true });
      }
      
      toast({
        title: "Dokumen Diunggah & Dipilih",
        description: `"${newDoc.name}" telah diunggah dan dipilih secara otomatis untuk tugas ini.`,
      });
    }
    setIsUploadModalOpen(false);
  };

  const allDisplayableDocuments = useMemo(() => {
    const combined = [...availableDocuments, ...newlyUploadedDocuments];
    const uniqueMap = new Map<string, BasicDocumentInfo>();
    combined.forEach(doc => uniqueMap.set(doc.id, doc));
    return Array.from(uniqueMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [availableDocuments, newlyUploadedDocuments]);

  const isAssignedToFieldEditable = useMemo(() => {
      if (isReadOnly && !!initialData) return false; 
      if (!initialData && isReadOnly) return false; 

      const statusToConsider = watchedStatus || initialData?.status;
      if (!currentUserRole || !statusToConsider) return false;

      if (currentUserRole === 'admin' || currentUserRole === 'manager') return true;
      if (currentUserRole === 'cs') {
          return statusToConsider === 'To Do' || statusToConsider === 'Pending Notarization' || statusToConsider === 'Ready for Notarization';
      }
      return false;
  }, [isReadOnly, currentUserRole, watchedStatus, initialData]);


  const isStatusFieldEditable = useMemo(() => {
    if (isReadOnly && !!initialData) return false;
    if (!initialData && isReadOnly) return false;

    if (!currentUserRole || !initialData?.status) { 
        return !isReadOnly;
    }
    if (currentUserRole === 'admin' || currentUserRole === 'manager') return true;

    if (currentUserRole === 'staff') {
        return (initialData.status === 'To Do' || initialData.status === 'In Progress') && initialData.assignedTo === currentUserId;
    }
    if (currentUserRole === 'cs') {
        return (initialData.status === 'To Do' && (initialData.assignedTo === currentUserId || !initialData.assignedTo)) ||
               (initialData.status === 'Pending Notarization' && (initialData.assignedTo === currentUserId || !initialData.assignedTo));
    }
    return false;
  }, [isReadOnly, currentUserRole, initialData, currentUserId]);


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

  const handleRequestOriginalDocumentInTaskForm = async (documentId: string) => {
    if (!currentUserId) {
      toast({ title: "Error", description: "User tidak terautentikasi.", variant: "destructive"});
      return;
    }
    setRequestingDocId(documentId);
    try {
      const result = await requestOriginalDocument(documentId, currentUserId);

      if (result.success) {
        toast({ title: "Permintaan Terkirim", description: "Permintaan dokumen asli telah dikirim."});
        router.refresh(); 
      } else {
        toast({ title: "Gagal Mengirim Permintaan", description: result.error || "Terjadi kesalahan.", variant: "destructive"});
      }
    } catch (error: any) {
      toast({ title: "Kesalahan Permintaan", description: error.message || "Terjadi kesalahan tak terduga.", variant: "destructive"});
    }
    setRequestingDocId(null);
  };

  const handleRequestSelectedOriginals = async () => {
    if (!currentUserId || selectedDocsForOriginalRequest.length === 0) return;
    setIsBatchRequesting(true);
    let successCount = 0;
    let failCount = 0;

    for (const docId of selectedDocsForOriginalRequest) {
        try {
            const result = await requestOriginalDocument(docId, currentUserId);
            if (result.success) {
                successCount++;
            } else {
                failCount++;
                console.error(`Gagal meminta ${docId}: ${result.error}`);
            }
        } catch (error) {
            failCount++;
            console.error(`Error meminta ${docId}:`, error);
        }
    }
    setIsBatchRequesting(false);
    setSelectedDocsForOriginalRequest([]); // Clear selection
    toast({
        title: "Permintaan Dokumen Asli Terkirim",
        description: `${successCount} permintaan berhasil, ${failCount} gagal. Halaman akan dimuat ulang.`,
        duration: 5000,
    });
    if (successCount > 0) router.refresh();
  };

  const handleRequestAllAvailableOriginals = async () => {
    if (!currentUserId) return;
    const attachedDocIds = form.getValues('documentIds') || [];
    const eligibleDocs = allDisplayableDocuments.filter(doc =>
        attachedDocIds.includes(doc.id) &&
        doc.isOriginalRequested === false &&
        session?.user?.id !== doc.originalFileHolderId
    );

    if (eligibleDocs.length === 0) {
        toast({ title: "Tidak Ada Dokumen", description: "Tidak ada dokumen terlampir yang tersedia untuk diminta.", variant: "default"});
        return;
    }
    setIsBatchRequesting(true);
    let successCount = 0;
    let failCount = 0;

    for (const doc of eligibleDocs) {
        try {
            const result = await requestOriginalDocument(doc.id, currentUserId);
            if (result.success) {
                successCount++;
            } else {
                failCount++;
                console.error(`Gagal meminta ${doc.id}: ${result.error}`);
            }
        } catch (error) {
            failCount++;
            console.error(`Error meminta ${doc.id}:`, error);
        }
    }
    setIsBatchRequesting(false);
    toast({
        title: "Permintaan Semua Dokumen Asli Tersedia Terkirim",
        description: `${successCount} permintaan berhasil, ${failCount} gagal. Halaman akan dimuat ulang.`,
        duration: 5000,
    });
    if (successCount > 0) router.refresh();
  };


  return (
    <>
      {parentContextDocuments && (
        <Card className="mb-6 bg-muted/30 border-dashed border-accent shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-accent">
              <FolderOpen className="h-5 w-5" />
              Konteks: Dokumen Tugas Induk ({parentContextDocuments.title})
            </CardTitle>
            <UiCardDescription className="text-xs">
              Dokumen-dokumen ini berasal dari tugas induk dan ditampilkan untuk konteks.
            </UiCardDescription>
          </CardHeader>
          <CardContent className="text-sm space-y-3 pt-2">
            {parentContextDocuments.documents && parentContextDocuments.documents.length > 0 ? (
              <div>
                <p className="font-semibold text-foreground mt-2">Dokumen Terlampir pada Induk:</p>
                <ScrollArea className="h-24 mt-1">
                  <ul className="space-y-1">
                    {parentContextDocuments.documents.map(doc => (
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

      <Form {...form}>
        <form onSubmit={form.handleSubmit(internalHandleSubmit)} className="space-y-6">
          <fieldset disabled={(isReadOnly && !!initialData && !form.formState.isSubmitting) || (!initialData && isReadOnly)} className="space-y-6">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Judul</FormLabel>
                  <FormControl>
                    <Input placeholder="Masukkan judul tugas" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {initialData?.jobNumber && (
                <div className="space-y-2">
                    <Label className="text-sm font-medium flex items-center gap-1">
                        <Hash className="h-4 w-4 text-muted-foreground" />
                        Nomor Akta/Pekerjaan
                    </Label>
                    <div className="flex h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground">
                        {initialData.jobNumber}
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Nomor ini dibuat secara otomatis dan tidak dapat diubah.
                    </p>
                </div>
            )}

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Deskripsi</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Masukkan deskripsi tugas (opsional)" {...field} rows={3} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value} disabled={!isStatusFieldEditable}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="To Do">To Do</SelectItem>
                        <SelectItem value="In Progress">In Progress</SelectItem>
                        <SelectItem value="Pending Review">Pending Review</SelectItem>
                        {(currentUserRole === 'admin' || currentUserRole === 'manager' || initialData?.status === 'Approved') && <SelectItem value="Approved">Approved</SelectItem>}
                        {(currentUserRole === 'admin' || currentUserRole === 'manager' || currentUserRole === 'cs' || initialData?.status === 'Pending Notarization') && <SelectItem value="Pending Notarization">Pending Notarization</SelectItem>}
                        {(currentUserRole === 'admin' || currentUserRole === 'manager' || currentUserRole === 'cs' || initialData?.status === 'Ready for Notarization') && <SelectItem value="Ready for Notarization">Ready for Notarization</SelectItem>}
                        {(currentUserRole === 'admin' || currentUserRole === 'manager' || currentUserRole === 'notary' || initialData?.status === 'Notarization Complete') && <SelectItem value="Notarization Complete">Notarization Complete</SelectItem>}
                        {(currentUserRole === 'admin' || currentUserRole === 'manager' || initialData?.status === 'Archived') && <SelectItem value="Archived">Archived</SelectItem>}
                        <SelectItem value="Blocked">Blocked</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prioritas</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isReadOnly && !!initialData}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih prioritas" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Low">Rendah</SelectItem>
                        <SelectItem value="Medium">Sedang</SelectItem>
                        <SelectItem value="High">Tinggi</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="dueDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Tanggal Jatuh Tempo</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            suppressHydrationWarning={true}
                            variant={'outline'}
                            className={cn(
                              'w-full pl-3 text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                            disabled={isReadOnly && !!initialData}
                          >
                            {field.value ? format(new Date(field.value), 'PPP') : <span>Pilih tanggal</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={field.value ? new Date(field.value) : undefined} onSelect={field.onChange} initialFocus disabled={isReadOnly && !!initialData} />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="assignedTo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Ditugaskan Kepada
                    </FormLabel>
                    <Select
                        onValueChange={field.onChange}
                        value={field.value || 'UNASSIGNED'}
                        defaultValue={field.value || 'UNASSIGNED'}
                        disabled={!isAssignedToFieldEditable}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih pengguna untuk ditugaskan" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="UNASSIGNED">Tidak Ditugaskan</SelectItem>
                        {assignableUsers && assignableUsers.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.name || user.username} ({user.role})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="documentIds"
              render={() => (
                <FormItem>
                  <div className="mb-4">
                    <FormLabel className="text-base">Lampiran Dokumen</FormLabel>
                    <FormDescription>
                      Pilih dokumen yang relevan untuk dilampirkan pada tugas ini.
                    </FormDescription>
                  </div>
                  <ScrollArea className="h-48 w-full rounded-md border p-4">
                    {allDisplayableDocuments.length > 0 ? allDisplayableDocuments.map((doc) => {
                      const docFullInfo = allDisplayableDocuments.find(d => d.id === doc.id);
                      const canRequestThisDoc = docFullInfo && !docFullInfo.isOriginalRequested && session?.user?.id !== docFullInfo.originalFileHolderId && !(isReadOnly && !!initialData);
                      const isAttachedToTask = form.getValues('documentIds')?.includes(doc.id);

                      return (
                      <FormField
                        key={doc.id}
                        control={form.control}
                        name="documentIds"
                        render={({ field }) => {
                          return (
                            <FormItem
                              key={doc.id}
                              className="flex flex-row items-center space-x-3 space-y-0 py-2 border-b last:border-b-0"
                            >
                              <FormControl>
                                <Checkbox
                                  checked={isAttachedToTask}
                                  onCheckedChange={(checked) => {
                                    if (isReadOnly && !!initialData) return;
                                    const currentIds = field.value || [];
                                    const newIds = checked
                                      ? [...currentIds, doc.id]
                                      : currentIds.filter((value) => value !== doc.id);
                                    field.onChange(newIds);
                                    if (!checked) { // If unchecking from task, also uncheck from original request selection
                                        setSelectedDocsForOriginalRequest(prev => prev.filter(id => id !== doc.id));
                                    }
                                  }}
                                  disabled={isReadOnly && !!initialData}
                                />
                              </FormControl>
                              <div className="flex-grow flex items-center justify-between">
                                <div className="flex-grow">
                                    <FormLabel className="text-sm font-normal cursor-pointer">
                                        {doc.name} <span className="text-xs text-muted-foreground">({doc.type || 'N/A'})</span>
                                    </FormLabel>
                                    {docFullInfo?.isOriginalRequested && <Badge variant="outline" className="ml-2 text-xs bg-yellow-100 text-yellow-700 border-yellow-300">Diminta</Badge>}
                                    {docFullInfo?.originalFileHolderId === session?.user?.id && !docFullInfo?.isOriginalRequested && <Badge variant="outline" className="ml-2 text-xs bg-green-100 text-green-700 border-green-300">Di Tangan Anda</Badge>}
                                </div>
                                <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                                    {isAttachedToTask && canRequestThisDoc && (
                                        <div className="flex items-center">
                                            <Checkbox
                                                id={`req-orig-${doc.id}`}
                                                checked={selectedDocsForOriginalRequest.includes(doc.id)}
                                                onCheckedChange={(checked) => {
                                                    setSelectedDocsForOriginalRequest(prev =>
                                                        checked
                                                            ? [...prev, doc.id]
                                                            : prev.filter(id => id !== doc.id)
                                                    );
                                                }}
                                                disabled={isReadOnly && !!initialData || isBatchRequesting}
                                                className="mr-1 h-3.5 w-3.5"
                                            />
                                            <Label htmlFor={`req-orig-${doc.id}`} className="text-xs font-normal mr-2 cursor-pointer">Pilih Ori</Label>
                                        </div>
                                    )}
                                    {isAttachedToTask && !canRequestThisDoc && docFullInfo?.isOriginalRequested !== true && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-7 px-2 py-1 text-xs"
                                            onClick={() => handleRequestOriginalDocumentInTaskForm(doc.id)}
                                            disabled={requestingDocId === doc.id || (isReadOnly && !!initialData) || docFullInfo?.originalFileHolderId === session?.user?.id}
                                        >
                                            {requestingDocId === doc.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Send className="mr-1 h-3 w-3" />}
                                            Minta Ori
                                        </Button>
                                    )}
                                    {isAttachedToTask && doc.ownCloudPath && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            onClick={() => handleDownloadDocument(doc.id, doc.name)}
                                            disabled={downloadingDocId === doc.id}
                                        >
                                            {downloadingDocId === doc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 text-muted-foreground hover:text-primary" />}
                                            <span className="sr-only">Unduh lampiran</span>
                                        </Button>
                                    )}
                                </div>
                              </div>
                            </FormItem>
                          );
                        }}
                      />
                    );
                    }) : <p className="text-sm text-muted-foreground">Tidak ada dokumen tersedia. Unggah di bawah ini.</p>}
                  </ScrollArea>
                  <FormMessage />
                  {!(isReadOnly && !!initialData) && (
                        <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleRequestSelectedOriginals}
                                disabled={isBatchRequesting || selectedDocsForOriginalRequest.length === 0}
                            >
                                {isBatchRequesting && selectedDocsForOriginalRequest.length > 0 ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                                Minta Ori Terpilih ({selectedDocsForOriginalRequest.length})
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleRequestAllAvailableOriginals}
                                disabled={isBatchRequesting || allDisplayableDocuments.filter(d => form.getValues('documentIds')?.includes(d.id) && d.isOriginalRequested === false && session?.user?.id !== d.originalFileHolderId).length === 0}
                            >
                                {isBatchRequesting && selectedDocsForOriginalRequest.length === 0 ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                                Minta Semua Ori Tersedia
                            </Button>
                        </div>
                    )}
                </FormItem>
              )}
            />
          </fieldset>

          {!(isReadOnly && !!initialData) && (
              <Dialog open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen}>
              <DialogTrigger asChild>
                  <Button type="button" variant="outline" className="w-full" onClick={() => setIsUploadModalOpen(true)} disabled={isReadOnly}>
                  <UploadCloud className="mr-2 h-4 w-4" /> Unggah & Siapkan Dokumen Baru
                  </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[625px]">
                  <DialogHeader>
                  <DialogTitle>Unggah Dokumen Baru</DialogTitle>
                  <DialogDescription>
                      Dokumen yang diunggah akan tersedia untuk dipilih sebagai lampiran.
                  </DialogDescription>
                  </DialogHeader>
                  <DocumentUploadForm onUploadSuccessInContext={handleDocumentUploadedInModal} />
              </DialogContent>
              </Dialog>
          )}

          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="outline" onClick={handleCancelClick}>
              <XCircle className="mr-2 h-4 w-4" /> {(isReadOnly && !!initialData) ? 'Tutup' : 'Batal'}
            </Button>
            {!(isReadOnly && !!initialData) && (
              <Button type="submit" disabled={form.formState.isSubmitting || (!!initialData && form.formState.isSubmitted && !form.formState.isDirty) }>
                <Save className="mr-2 h-4 w-4" /> {form.formState.isSubmitting ? 'Menyimpan...' : (initialData ? 'Simpan Perubahan' : 'Buat Tugas')}
              </Button>
            )}
          </div>
        </form>
      </Form>
    </>
  );
}

