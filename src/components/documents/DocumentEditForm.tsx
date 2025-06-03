
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea'; // For tags or description
import { Save, XCircle } from 'lucide-react';
import type { Document } from '@/types';
import { useRouter } from 'next/navigation';

const documentEditFormSchema = z.object({
  name: z.string().min(3, { message: 'Document name must be at least 3 characters.' }),
  type: z.string().min(2, { message: 'Document type is required.' }),
  status: z.enum(['Draft', 'Pending Review', 'Notarized', 'Archived']),
  tags: z.string().optional().transform(val => val ? val.split(',').map(tag => tag.trim()).filter(tag => tag) : []), // Comma-separated tags
});

export type DocumentEditFormValues = z.infer<typeof documentEditFormSchema>;

interface DocumentEditFormProps {
  document: Document;
  onSubmit: (values: DocumentEditFormValues) => Promise<void>;
}

export function DocumentEditForm({ document, onSubmit }: DocumentEditFormProps) {
  const router = useRouter();
  const form = useForm<DocumentEditFormValues>({
    resolver: zodResolver(documentEditFormSchema),
    defaultValues: {
      name: document.name || '',
      type: document.type || '',
      status: document.status as Document['status'] || 'Draft', // Ensure it's one of the enum values
      tags: document.tags?.join(', ') || '',
    },
  });

  const handleSubmit = async (values: DocumentEditFormValues) => {
    await onSubmit(values);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Document Name</FormLabel>
              <FormControl>
                <Input placeholder="Enter document name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Document Type</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Agreement, Affidavit" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Draft">Draft</SelectItem>
                  <SelectItem value="Pending Review">Pending Review</SelectItem>
                  <SelectItem value="Notarized">Notarized</SelectItem>
                  <SelectItem value="Archived">Archived</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="tags"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tags (comma-separated)</FormLabel>
              <FormControl>
                <Textarea placeholder="e.g., client, legal, important" {...field} value={Array.isArray(field.value) ? field.value.join(', ') : field.value} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end space-x-3 pt-4">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            <XCircle className="mr-2 h-4 w-4" /> Cancel
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            <Save className="mr-2 h-4 w-4" /> {form.formState.isSubmitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
