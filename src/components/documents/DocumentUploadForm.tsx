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
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { UploadCloud, FileCheck } from 'lucide-react';
import { useState, type ChangeEvent } from 'react';
import { Progress } from '@/components/ui/progress';
import type { Document } from '@/types';
import { uploadDocumentAndCreateRecord, type UploadDocumentResult } from '@/actions/documentActions'; // Import Server Action
import { useToast } from '@/hooks/use-toast'; // For displaying results
import { useRouter } from 'next/navigation';


const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB (adjust as needed for OwnCloud/server limits)
const ACCEPTED_FILE_TYPES = [
    'application/pdf', 
    'application/msword', 
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'text/plain',
];

const uploadFormSchema = z.object({
  documentFile: z.custom<FileList>() // Use FileList for input type="file"
    .refine(files => files && files.length > 0, "File is required.")
    .refine(files => files && files[0].size <= MAX_FILE_SIZE, `Max file size is ${MAX_FILE_SIZE / (1024*1024)}MB.`)
    .refine(
      files => files && ACCEPTED_FILE_TYPES.includes(files[0].type),
      ".pdf, .doc, .docx, .jpg, .png, .txt files are accepted."
    ),
  documentName: z.string().optional().default(''),
  documentType: z.string().optional().default(''),
});

type UploadFormValues = z.infer<typeof uploadFormSchema>;

interface DocumentUploadFormProps {
  onUploadComplete?: (result: UploadDocumentResult) => void; // Callback for parent
  onUploadSuccessInContext?: (document: Document) => void; // Callback for specific context like TaskForm
}

export function DocumentUploadForm({ onUploadComplete, onUploadSuccessInContext }: DocumentUploadFormProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileNameDisplay, setFileNameDisplay] = useState<string>('');
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState<boolean>(false);

  const form = useForm<UploadFormValues>({
    resolver: zodResolver(uploadFormSchema),
    defaultValues: {
        documentName: '',
        documentType: '',
    }
  });

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setFileNameDisplay(file.name);
      form.setValue('documentFile', event.target.files as FileList);
      form.trigger('documentFile'); 
    } else {
      setSelectedFile(null);
      setFileNameDisplay('');
      form.setValue('documentFile', undefined as any, { shouldValidate: true });
    }
  };

  async function onSubmit(values: UploadFormValues) {
    if (!values.documentFile || values.documentFile.length === 0) {
      toast({ title: "Error", description: "Please select a file.", variant: "destructive"});
      return;
    }
    
    setIsUploading(true);
    setUploadProgress(30); 

    const formData = new FormData();
    formData.append('documentFile', values.documentFile[0]);
    if (values.documentName) {
        formData.append('documentName', values.documentName);
    }
    if (values.documentType) {
        formData.append('documentType', values.documentType);
    }
    
    const result = await uploadDocumentAndCreateRecord(formData);
    setUploadProgress(100);

    if (result.success && result.document) {
      toast({
        title: 'Document Uploaded',
        description: `${result.document.name} has been processed.`,
      });
      if (onUploadSuccessInContext) {
        onUploadSuccessInContext(result.document);
      } else if (onUploadComplete) {
        onUploadComplete(result);
      } else {
        router.push('/documents'); 
      }
    } else {
      toast({
        title: 'Upload Failed',
        description: result.error || 'An unexpected error occurred.',
        variant: 'destructive',
      });
    }
    
    setIsUploading(false);
    setSelectedFile(null);
    setFileNameDisplay('');
    form.reset(); 
    setUploadProgress(0);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="documentName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Document Name (Optional)</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Client Contract Q3" {...field} disabled={isUploading} />
              </FormControl>
              <FormDescription>If left blank, the original file name will be used.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
         <FormField
          control={form.control}
          name="documentType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Document Category/Type (Optional)</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Legal Agreement, Invoice, Identification" {...field} disabled={isUploading} />
              </FormControl>
              <FormDescription>Helps in organizing documents. Examples: Invoice, Agreement, Report.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="documentFile"
          render={({ field }) => ( 
            <FormItem>
              <FormLabel>Select Document</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input
                    type="file"
                    id="documentFile-input" 
                    accept={ACCEPTED_FILE_TYPES.join(',')}
                    onChange={handleFileChange}
                    className="hidden" 
                    disabled={isUploading}
                  />
                  <label
                    htmlFor="documentFile-input"
                    className={`flex items-center justify-center w-full px-3 py-6 border-2 border-dashed rounded-md cursor-pointer
                                ${form.formState.errors.documentFile ? 'border-destructive' : 'border-input'}
                                ${isUploading ? 'bg-muted cursor-not-allowed' : 'hover:border-primary bg-muted/20'}`}
                  >
                    {fileNameDisplay ? (
                      <div className="flex flex-col items-center text-sm text-center">
                        <FileCheck className="w-10 h-10 mb-2 text-green-500" />
                        <span>{fileNameDisplay}</span>
                        <span className="text-xs text-muted-foreground">Click to change file</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center text-sm text-muted-foreground text-center">
                        <UploadCloud className="w-10 h-10 mb-2" />
                        <span>Click to browse or drag & drop</span>
                        <span className="text-xs mt-1">PDF, DOC(X), JPG, PNG, TXT (Max {MAX_FILE_SIZE / (1024*1024)}MB)</span>
                      </div>
                    )}
                  </label>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {isUploading && (
            <Progress value={uploadProgress} className="w-full h-2 mt-2" />
        )}
        <Button type="submit" className="w-full mt-4" disabled={isUploading || !selectedFile || !form.formState.isValid}>
          {isUploading ? `Uploading ${Math.round(uploadProgress)}%...` : <><UploadCloud className="mr-2 h-4 w-4" /> Upload Document</>}
        </Button>
      </form>
    </Form>
  );
}