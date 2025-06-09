
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
import { useToast } from '@/hooks/use-toast';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, Mail } from 'lucide-react';
import { signIn } from 'next-auth/react';
import { useEffect } from 'react';

const loginFormSchema = z.object({
  email: z.string().email({ message: 'Silakan masukkan alamat email yang valid.' }),
  password: z.string().min(1, { message: 'Kata sandi diperlukan.' }),
});

type LoginFormValues = z.infer<typeof loginFormSchema>;

export function LoginForm() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const error = searchParams?.get('error');
    if (error) {
      let errorMessage = 'Terjadi kesalahan tak terduga saat login.';
      if (error === 'CredentialsSignin') {
        errorMessage = 'Email atau kata sandi tidak valid. Silakan coba lagi.';
      } else if (error === 'Missing email or password.') {
        errorMessage = 'Email dan kata sandi diperlukan.';
      }
      toast({
        title: 'Login Gagal',
        description: errorMessage,
        variant: 'destructive',
      });
      router.replace('/', { scroll: false });
    }
  }, [searchParams, toast, router]);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  async function onSubmit(values: LoginFormValues) {
    form.clearErrors();
    
    const result = await signIn('credentials', {
      redirect: false,
      email: values.email,
      password: values.password,
    });

    if (result?.error) {
      let errorMessage = 'Email atau kata sandi tidak valid. Silakan coba lagi.';
      if (result.error === 'CredentialsSignin') {
        errorMessage = 'Email atau kata sandi tidak valid. Silakan coba lagi.';
      } else if (result.error === 'Missing email or password.') {
        errorMessage = 'Email dan kata sandi diperlukan.';
      }
      
      toast({
        title: 'Login Gagal',
        description: errorMessage,
        variant: 'destructive',
      });
      form.setError("password", { type: "manual", message: errorMessage });
    } else if (result?.ok && !result.error) {
      toast({
        title: 'Login Berhasil',
        description: 'Selamat datang kembali! Mengarahkan ke dasbor...',
      });
      router.push('/dashboard');
      router.refresh();
    } else {
        toast({
            title: 'Percobaan Login',
            description: 'Terjadi masalah. Silakan periksa kredensial atau coba lagi.',
            variant: 'destructive',
          });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-muted-foreground">Alamat Email</FormLabel>
              <FormControl>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="anda@contoh.com" {...field} className="pl-10" />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-muted-foreground">Kata Sandi</FormLabel>
              <FormControl>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input type="password" placeholder="••••••••" {...field} className="pl-10" />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button 
          type="submit" 
          className="w-full bg-primary text-primary-foreground hover:bg-primary"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? 'Masuk...' : 'Masuk'}
        </Button>
      </form>
    </Form>
  );
}
