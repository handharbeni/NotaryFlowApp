
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
import { useToast } from '@/hooks/use-toast';
import { getJobNumberPattern, updateJobNumberPattern } from '@/actions/settingsActions';
import { Save, AlertCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

const jobNumberPatternFormSchema = z.object({
  pattern: z.string().min(3, { message: 'Pola nomor pekerjaan harus minimal 3 karakter.' })
            .refine(val => val.includes('{{SEQ}}'), { message: "Pola harus menyertakan placeholder {{SEQ}} untuk nomor urut."})
            .refine(val => val.includes('{{YYYY}}') || val.includes('{{YY}}'), { message: "Pola sebaiknya menyertakan placeholder tahun seperti {{YYYY}} atau {{YY}}."}),
});

type JobNumberPatternFormValues = z.infer<typeof jobNumberPatternFormSchema>;

interface JobNumberPatternFormProps {
  initialPattern: string | null;
}

export function JobNumberPatternForm({ initialPattern }: JobNumberPatternFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentPattern, setCurrentPattern] = useState(initialPattern);

  const form = useForm<JobNumberPatternFormValues>({
    resolver: zodResolver(jobNumberPatternFormSchema),
    defaultValues: {
      pattern: initialPattern || 'NA/{{YYYY}}/{{MM}}/{{SEQ}}',
    },
  });

  useEffect(() => {
    form.setValue('pattern', initialPattern || 'NA/{{YYYY}}/{{MM}}/{{SEQ}}');
    setCurrentPattern(initialPattern);
  }, [initialPattern, form]);

  async function onSubmit(values: JobNumberPatternFormValues) {
    setIsSubmitting(true);
    form.clearErrors();

    const result = await updateJobNumberPattern(values.pattern);

    if (result.success) {
      toast({
        title: 'Pola Nomor Pekerjaan Diperbarui',
        description: 'Pola nomor pekerjaan telah berhasil disimpan.',
      });
      const updatedPattern = await getJobNumberPattern();
      setCurrentPattern(updatedPattern);
      form.reset({ pattern: updatedPattern || '' });
    } else {
      toast({
        title: 'Gagal Memperbarui Pola',
        description: result.error || 'Terjadi kesalahan tak terduga.',
        variant: 'destructive',
      });
    }
    setIsSubmitting(false);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="pattern"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Pola Nomor Akta/Pekerjaan</FormLabel>
              <FormControl>
                <Input placeholder="cth: NA/{{YYYY}}/{{MM}}/{{SEQ}}" {...field} />
              </FormControl>
              <FormDescription>
                Gunakan placeholder untuk nilai dinamis:
              </FormDescription>
              <ul className="list-disc list-inside text-xs text-muted-foreground pl-5 space-y-1 mt-1">
                <li><code>{'{{SEQ}}'}</code>: Nomor urut (wajib ada).</li>
                <li><code>{'{{YYYY}}'}</code>: Tahun 4 digit (cth: 2024).</li>
                <li><code>{'{{YY}}'}</code>: Tahun 2 digit (cth: 24).</li>
                <li><code>{'{{MM}}'}</code>: Bulan 2 digit (cth: 01, 12).</li>
                <li><code>{'{{DD}}'}</code>: Tanggal 2 digit (cth: 01, 31).</li>
                <li>Teks statis lainnya (cth: NA/, /JOB/).</li>
              </ul>
              <FormMessage />
            </FormItem>
          )}
        />
        <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Penting!</AlertTitle>
            <AlertDescription>
                Mengubah pola ini tidak akan mengubah nomor pekerjaan yang sudah ada. Ini hanya berlaku untuk nomor pekerjaan yang akan dibuat di masa mendatang.
                Pastikan logika pembuatan nomor urut (<code>{'{{SEQ}}'}</code>) diimplementasikan dengan benar di sistem Anda saat menggunakan pola ini.
            </AlertDescription>
        </Alert>
        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={isSubmitting}>
            <Save className="mr-2 h-4 w-4" /> {isSubmitting ? 'Menyimpan...' : 'Simpan Pola'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
