
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
import { updateUserPassword } from '@/actions/settingsActions';
import { Save, LockKeyhole } from 'lucide-react';
import { useState } from 'react';

const updatePasswordFormSchema = z.object({
  currentPassword: z.string().min(1, { message: 'Kata sandi saat ini diperlukan.' }),
  newPassword: z.string().min(6, { message: 'Kata sandi baru harus minimal 6 karakter.' }),
  confirmPassword: z.string().min(6, { message: 'Konfirmasi kata sandi baru harus minimal 6 karakter.' }),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "Kata sandi baru dan konfirmasi kata sandi tidak cocok.",
  path: ["confirmPassword"],
});

type UpdatePasswordFormValues = z.infer<typeof updatePasswordFormSchema>;

export function UpdatePasswordForm() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<UpdatePasswordFormValues>({
    resolver: zodResolver(updatePasswordFormSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  async function onSubmit(values: UpdatePasswordFormValues) {
    setIsSubmitting(true);
    form.clearErrors();

    const result = await updateUserPassword(values.currentPassword, values.newPassword);

    if (result.success) {
      toast({
        title: 'Kata Sandi Diperbarui',
        description: 'Kata sandi Anda telah berhasil diperbarui.',
      });
      form.reset();
    } else {
      toast({
        title: 'Gagal Memperbarui Kata Sandi',
        description: result.error || 'Terjadi kesalahan tak terduga.',
        variant: 'destructive',
      });
      if (result.error?.toLowerCase().includes('sandi saat ini')) {
        form.setError('currentPassword', { type: 'manual', message: result.error });
      }
    }
    setIsSubmitting(false);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="currentPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Kata Sandi Saat Ini</FormLabel>
              <FormControl>
                <div className="relative">
                    <LockKeyhole className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input type="password" placeholder="Masukkan kata sandi Anda saat ini" {...field} className="pl-10" />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="newPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Kata Sandi Baru</FormLabel>
              <FormControl>
                 <div className="relative">
                    <LockKeyhole className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input type="password" placeholder="Masukkan kata sandi baru Anda" {...field} className="pl-10" />
                </div>
              </FormControl>
              <FormDescription>Minimal 6 karakter.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Konfirmasi Kata Sandi Baru</FormLabel>
              <FormControl>
                <div className="relative">
                    <LockKeyhole className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input type="password" placeholder="Ketik ulang kata sandi baru Anda" {...field} className="pl-10" />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={isSubmitting}>
            <Save className="mr-2 h-4 w-4" /> {isSubmitting ? 'Menyimpan...' : 'Simpan Kata Sandi'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

    