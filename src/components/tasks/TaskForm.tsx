
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
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { CalendarIcon, Save, XCircle, UploadCloud, Users, FileText, FolderOpen } from 'lucide-react';
import type { Document, Task, User, UserRole } from '@/types';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { DocumentUploadForm } from '@/components/documents/DocumentUploadForm';
import { ScrollArea } from '@/components/ui/scroll-area';
import { createTaskInDB } from '@/actions/taskActions'; 
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription as UiCardDescription } from '@/components/ui/card'; // Renamed to avoid conflict
import { Badge } from '@/components/ui/badge';


interface BasicDocumentInfo {
  id: string;
  name: string;
  type?: string;
}

interface ParentTaskDocumentContext {
  title: string;
  primaryDocument: Task['primaryDocument'] | null;
  supportingDocuments: Task['supportingDocuments'] | null;
}

const taskStatusEnum = z.enum([
  'To Do', 
  'In Progress', 
  'Pending Review', 
  'Approved', 
  'Pending Notarization', 
  'Notarization Complete', 
  'Archived', 
  'Blocked'
]);

const taskFormSchema = z.object({
  title: z.string().min(3, { message: 'Title must be at least 3 characters.' }),
  description: z.string().optional().default(''),
  status: taskStatusEnum,
  dueDate: z.date({ required_error: 'Due date is required.' }),
  assignedTo: z.string().optional().nullable().default(''), 
  priority: z.enum(['Low', 'Medium', 'High']),
  primaryDocumentId: z.string().optional().nullable().default(''),
  supportingDocumentIds: z.array(z.string()).optional().default([]),
});

export type TaskFormValues = z.infer<typeof taskFormSchema>;

interface TaskFormProps {
  initialData?: Task | null;
  onSubmit?: (values: TaskFormValues) => Promise<void>; 
  onCancel?: () => void;
  availableDocuments?: BasicDocumentInfo[];
  globallyUsedPrimaryDocIds?: string[]; 
  globallyUsedSupportingDocIds?: string[];
  allUsers?: Pick<User, 'id' | 'name' | 'username' | 'role'>[];
  isReadOnly?: boolean; 
  parentContextDocuments?: ParentTaskDocumentContext | null; // Documents from the parent task
}

export function TaskForm({ 
  initialData, 
  onSubmit, 
  onCancel, 
  availableDocuments = [],
  globallyUsedPrimaryDocIds = [], 
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

  useEffect(() => {
    setIsClient(true);
  }, []);

  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: initialData?.title || '',
      description: initialData?.description || '',
      status: initialData?.status || 'To Do',
      dueDate: undefined, 
      assignedTo: initialData?.assignedTo || '', 
      priority: initialData?.priority || 'Medium',
      primaryDocumentId: initialData?.primaryDocumentId || '',
      supportingDocumentIds: initialData?.supportingDocuments?.map(doc => doc.id) || [],
    },
  });
  
  useEffect(() => {
    if (isClient) {
      form.reset({
        title: initialData?.title || '',
        description: initialData?.description || '',
        status: initialData?.status || 'To Do',
        dueDate: initialData?.dueDate ? new Date(initialData.dueDate) : new Date(),
        assignedTo: initialData?.assignedTo || '', 
        priority: initialData?.priority || 'Medium',
        primaryDocumentId: initialData?.primaryDocument?.id || initialData?.primaryDocumentId || '',
        supportingDocumentIds: initialData?.supportingDocuments?.map(doc => doc.id) || [],
      });
      setNewlyUploadedDocuments([]); 
    }
  }, [initialData, form, isClient]);

  const assignableUsers = useMemo(() => {
    if (!allUsers || allUsers.length === 0) return [];
    if (currentUserRole === 'admin') {
      return allUsers; 
    }
    if (currentUserRole === 'manager') {
      const managerId = session?.user?.id;
      return allUsers.filter(user => user.role === 'staff' || user.id === managerId);
    }
    if (currentUserRole === 'cs' && !initialData) { 
      return allUsers; 
    }
    return allUsers; 
  }, [allUsers, currentUserRole, session?.user?.id, initialData]);


  const internalHandleSubmit = async (values: TaskFormValues) => {
    if (isReadOnly && !initialData) return; 

    const submissionValues = {
      ...values,
      primaryDocumentId: values.primaryDocumentId === 'NONE' || values.primaryDocumentId === '' ? null : values.primaryDocumentId,
      assignedTo: values.assignedTo === 'UNASSIGNED' || values.assignedTo === '' ? null : values.assignedTo,
    };

    if (onSubmit) { 
      await onSubmit(submissionValues);
    } else if (!initialData) { 
      const result = await createTaskInDB(submissionValues); 
      if (result.success && result.taskId) {
        toast({
          title: 'Task Created',
          description: `Task "${values.title}" has been successfully created.`,
        });
        router.push(`/tasks/${result.taskId}/edit`); 
        router.refresh(); 
      } else {
        toast({
          title: 'Error Creating Task',
          description: result.error || 'An unexpected error occurred.',
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
        return [...prev, { id: newDoc.id, name: newDoc.name, type: newDoc.type }];
      });
      toast({
        title: "Document Uploaded",
        description: `"${newDoc.name}" is now available for selection. Please select it as primary or supporting if needed.`,
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

  const isAssignedToFieldEditable = !isReadOnly && (
    currentUserRole === 'admin' || 
    currentUserRole === 'manager' ||
    (currentUserRole === 'cs' && !initialData) 
  );

  const isStatusFieldEditable = !isReadOnly && (
    currentUserRole === 'admin' || 
    currentUserRole === 'manager' ||
    (currentUserRole === 'staff' && (initialData?.status === 'To Do' || initialData?.status === 'In Progress') && initialData?.assignedTo === currentUserId) ||
    (currentUserRole === 'cs' && !initialData) 
  );


  return (
    <>
      {parentContextDocuments && (
        <Card className="mb-6 bg-muted/30 border-dashed border-accent shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-accent">
              <FolderOpen className="h-5 w-5" />
              Context: Parent Task Documents ({parentContextDocuments.title})
            </CardTitle>
            <UiCardDescription className="text-xs">
              These documents are from the parent task and are shown for context.
            </UiCardDescription>
          </CardHeader>
          <CardContent className="text-sm space-y-3 pt-2">
            {parentContextDocuments.primaryDocument ? (
              <div>
                <p className="font-semibold text-foreground">Primary Document:</p>
                <div className="flex items-center gap-2 p-2 rounded-md bg-background/70">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span>{parentContextDocuments.primaryDocument.name}</span>
                  {parentContextDocuments.primaryDocument.type && (
                    <Badge variant="outline" className="text-xs">{parentContextDocuments.primaryDocument.type}</Badge>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">No primary document attached to parent.</p>
            )}
            {parentContextDocuments.supportingDocuments && parentContextDocuments.supportingDocuments.length > 0 ? (
              <div>
                <p className="font-semibold text-foreground mt-2">Supporting Documents:</p>
                <ScrollArea className="h-24 mt-1">
                  <ul className="space-y-1">
                    {parentContextDocuments.supportingDocuments.map(doc => (
                      <li key={doc.id} className="flex items-center gap-2 p-1.5 rounded-md bg-background/70">
                        <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span>{doc.name}</span>
                        {doc.type && <Badge variant="outline" className="text-xs">{doc.type}</Badge>}
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>
            ) : (
              <p className="text-muted-foreground mt-2">No supporting documents attached to parent.</p>
            )}
          </CardContent>
        </Card>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(internalHandleSubmit)} className="space-y-6">
          <fieldset disabled={isReadOnly && !!initialData && !form.formState.isSubmitting} className="space-y-6">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter task title" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Enter task description (optional)" {...field} rows={3} />
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
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="To Do">To Do</SelectItem>
                        <SelectItem value="In Progress">In Progress</SelectItem>
                        <SelectItem value="Pending Review">Pending Review</SelectItem>
                        {(currentUserRole === 'admin' || currentUserRole === 'manager' || (initialData?.status === 'Approved')) && <SelectItem value="Approved">Approved</SelectItem>}
                        {(currentUserRole === 'admin' || currentUserRole === 'manager' || (initialData?.status === 'Pending Notarization')) && <SelectItem value="Pending Notarization">Pending Notarization</SelectItem>}
                        {(currentUserRole === 'admin' || currentUserRole === 'manager' || (initialData?.status === 'Notarization Complete') ) && <SelectItem value="Notarization Complete">Notarization Complete</SelectItem>}
                        {(currentUserRole === 'admin' || currentUserRole === 'manager' || (initialData?.status === 'Archived')) && <SelectItem value="Archived">Archived</SelectItem>}
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
                    <FormLabel>Priority</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isReadOnly && !!initialData}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select priority" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Low">Low</SelectItem>
                        <SelectItem value="Medium">Medium</SelectItem>
                        <SelectItem value="High">High</SelectItem>
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
                    <FormLabel>Due Date</FormLabel>
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
                            {field.value ? format(field.value, 'PPP') : <span>Pick a date</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus disabled={isReadOnly && !!initialData} />
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
                        Assigned To
                    </FormLabel>
                    <Select 
                        onValueChange={field.onChange} 
                        value={field.value || 'UNASSIGNED'}
                        defaultValue={field.value || 'UNASSIGNED'}
                        disabled={!isAssignedToFieldEditable}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select user to assign" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="UNASSIGNED">Unassigned</SelectItem>
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
              name="primaryDocumentId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Primary Document</FormLabel>
                  <FormDescription>
                    Select one primary document.
                  </FormDescription>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value || 'NONE'} 
                    defaultValue={field.value || 'NONE'}
                    disabled={isReadOnly && !!initialData}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a primary document (optional)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="NONE">No Primary Document</SelectItem>
                      {allDisplayableDocuments.map((doc) => {
                        const isCurrentlyThisTasksPrimary = initialData?.primaryDocument?.id === doc.id || initialData?.primaryDocumentId === doc.id;
                        const isUnavailable = globallyUsedPrimaryDocIds?.includes(doc.id) && !isCurrentlyThisTasksPrimary;
                        return (
                          <SelectItem key={doc.id} value={doc.id} disabled={isUnavailable}>
                            {doc.name} 
                            <span className="text-xs text-muted-foreground ml-1">({doc.type || 'N/A'})</span>
                            {isUnavailable && <span className="text-xs text-destructive ml-1">(Primary for other task)</span>}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="supportingDocumentIds"
              render={() => (
                <FormItem>
                  <div className="mb-4">
                    <FormLabel className="text-base">Supporting Documents</FormLabel>
                    <FormDescription>
                      Select any supporting documents relevant to this task.
                    </FormDescription>
                  </div>
                  <ScrollArea className="h-40 w-full rounded-md border p-4">
                    {allDisplayableDocuments.length > 0 ? allDisplayableDocuments.map((doc) => (
                      <FormField
                        key={doc.id}
                        control={form.control}
                        name="supportingDocumentIds"
                        render={({ field }) => {
                          return (
                            <FormItem
                              key={doc.id}
                              className="flex flex-row items-start space-x-3 space-y-0 py-1"
                            >
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(doc.id)}
                                  onCheckedChange={(checked) => {
                                    if (isReadOnly && !!initialData) return;
                                    return checked
                                      ? field.onChange([...(field.value || []), doc.id])
                                      : field.onChange(
                                          (field.value || []).filter(
                                            (value) => value !== doc.id
                                          )
                                        );
                                  }}
                                  disabled={isReadOnly && !!initialData}
                                />
                              </FormControl>
                              <FormLabel className="text-sm font-normal">
                                {doc.name} <span className="text-xs text-muted-foreground">({doc.type || 'N/A'})</span>
                              </FormLabel>
                            </FormItem>
                          );
                        }}
                      />
                    )) : <p className="text-sm text-muted-foreground">No documents available. Upload one below.</p>}
                  </ScrollArea>
                  <FormMessage />
                </FormItem>
              )}
            />
          </fieldset>
          
          {!(isReadOnly && !!initialData) && ( 
              <Dialog open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen}>
              <DialogTrigger asChild>
                  <Button type="button" variant="outline" className="w-full" onClick={() => setIsUploadModalOpen(true)}>
                  <UploadCloud className="mr-2 h-4 w-4" /> Upload & Prepare New Document
                  </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[625px]">
                  <DialogHeader>
                  <DialogTitle>Upload New Document</DialogTitle>
                  <DialogDescription>
                      The uploaded document will become available for selection as primary or supporting.
                  </DialogDescription>
                  </DialogHeader>
                  <DocumentUploadForm onUploadSuccessInContext={handleDocumentUploadedInModal} />
              </DialogContent>
              </Dialog>
          )}
          
          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="outline" onClick={handleCancelClick}>
              <XCircle className="mr-2 h-4 w-4" /> {(isReadOnly && !!initialData) ? 'Close' : 'Cancel'}
            </Button>
            {!(isReadOnly && !!initialData) && (
              <Button type="submit" disabled={form.formState.isSubmitting || (!!initialData && form.formState.isSubmitted && !form.formState.isDirty) }>
                <Save className="mr-2 h-4 w-4" /> {form.formState.isSubmitting ? 'Saving...' : (initialData ? 'Save Changes' : 'Create Task')}
              </Button>
            )}
          </div>
        </form>
      </Form>
    </>
  );
}
