
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
  email: z.string().email({ message: 'Please enter a valid email address.' }),
  password: z.string().min(1, { message: 'Password is required.' }),
});

type LoginFormValues = z.infer<typeof loginFormSchema>;

export function LoginForm() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const error = searchParams?.get('error');
    if (error) {
      let errorMessage = 'An unexpected error occurred during login.';
      if (error === 'CredentialsSignin') {
        errorMessage = 'Invalid email or password. Please try again.';
      } else if (error === 'Missing email or password.') {
        errorMessage = 'Email and password are required.';
      }
      // You can add more specific error messages if NextAuth provides them
      toast({
        title: 'Login Failed',
        description: errorMessage,
        variant: 'destructive',
      });
      // Clear the error from the URL to prevent re-toasting on refresh
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
      redirect: false, // We handle redirection manually or let NextAuth do it via middleware
      email: values.email,
      password: values.password,
    });

    if (result?.error) {
      let errorMessage = 'Invalid email or password. Please try again.';
      if (result.error === 'CredentialsSignin') {
        errorMessage = 'Invalid email or password. Please try again.';
      } else if (result.error === 'Missing email or password.') {
        errorMessage = 'Email and password are required.';
      }
      // Potentially other errors from your authorize function
      
      toast({
        title: 'Login Failed',
        description: errorMessage,
        variant: 'destructive',
      });
      form.setError("password", { type: "manual", message: errorMessage });
    } else if (result?.ok && !result.error) {
      // Successful sign in
      toast({
        title: 'Login Successful',
        description: 'Welcome back! Redirecting to dashboard...',
      });
      router.push('/dashboard'); // Or let middleware handle this
      router.refresh(); // Good practice after auth change
    } else {
        // Should not happen if result.error is handled
        toast({
            title: 'Login Attempted',
            description: 'An issue occurred. Please check credentials or try again.',
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
              <FormLabel className="text-muted-foreground">Email Address</FormLabel>
              <FormControl>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="you@example.com" {...field} className="pl-10" />
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
              <FormLabel className="text-muted-foreground">Password</FormLabel>
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
          className="w-full bg-primary text-primary-foreground hover:bg-primary" /* Simplified hover class */
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? 'Signing In...' : 'Sign In'}
        </Button>
      </form>
    </Form>
  );
}
