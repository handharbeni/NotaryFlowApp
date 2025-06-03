
'use client';

import React from 'react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { createUser, updateUser, type CreateUserInput, type UpdateUserInput } from '@/actions/userActions';
import { Save, XCircle } from 'lucide-react';
import type { UserRole } from '@/types';

const userRoles: [UserRole, ...UserRole[]] = ['admin', 'cs', 'manager', 'staff', 'notary'];

// Schema for creation
const createUserFormSchema = z.object({
  name: z.string().optional(),
  username: z.string().min(3, { message: 'Username must be at least 3 characters.' }),
  email: z.string().email({ message: 'Please enter a valid email address.' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters long.' }),
  role: z.enum(userRoles).default('staff'),
});

// Schema for editing (password is optional)
const updateUserFormSchema = z.object({
  name: z.string().optional(),
  username: z.string().min(3, { message: 'Username must be at least 3 characters.' }),
  email: z.string().email({ message: 'Please enter a valid email address.' }),
  password: z.string().optional().refine(val => !val || val.length === 0 || val.length >= 6, {
    message: 'New password must be at least 6 characters long if provided.',
  }),
  role: z.enum(userRoles).default('staff'),
});

export type UserFormValues = z.infer<typeof createUserFormSchema>; 
export type UpdateUserFormValues = z.infer<typeof updateUserFormSchema>;


interface UserFormProps {
  initialData?: UserFormValues & { id: string }; 
}

export function UserForm({ initialData }: UserFormProps) {
  const { toast } = useToast();
  const router = useRouter();
  const isEditMode = !!initialData?.id;

  const formSchema = isEditMode ? updateUserFormSchema : createUserFormSchema;

  const form = useForm<UserFormValues>({ 
    resolver: zodResolver(formSchema),
    defaultValues: initialData ? {
        ...initialData,
        role: initialData.role as UserRole, // Ensure role is correctly typed
        password: '', 
    } : {
      name: '',
      username: '',
      email: '',
      password: '',
      role: 'staff',
    },
  });


  async function onSubmit(values: UserFormValues) { 
    form.clearErrors();

    if (isEditMode && initialData?.id) {
      const updateValues: UpdateUserInput = {
        name: values.name,
        username: values.username,
        email: values.email,
        role: values.role as UserRole,
      };
      if (values.password && values.password.length > 0) {
        updateValues.password = values.password;
      }

      const result = await updateUser(initialData.id, updateValues);
      if (result.success) {
        toast({
          title: 'User Updated',
          description: `User "${values.username}" has been successfully updated.`,
        });
        router.push('/admin/users');
        router.refresh();
      } else {
        toast({
          title: 'Error Updating User',
          description: result.error || 'An unexpected error occurred.',
          variant: 'destructive',
        });
        if (result.error?.includes('username')) {
            form.setError('username', { type: 'manual', message: result.error });
        } else if (result.error?.includes('email')) {
            form.setError('email', { type: 'manual', message: result.error });
        }
      }
    } else {
      // Create mode
      const createValues: CreateUserInput = {
        ...values,
        role: values.role as UserRole,
      };
      const result = await createUser(createValues);
      if (result.success && result.userId) {
        toast({
          title: 'User Created',
          description: `User "${values.username}" has been successfully created.`,
        });
        router.push('/admin/users');
        router.refresh();
      } else {
        toast({
          title: 'Error Creating User',
          description: result.error || 'An unexpected error occurred.',
          variant: 'destructive',
        });
        if (result.error?.includes('username')) {
          form.setError('username', { type: 'manual', message: result.error });
        } else if (result.error?.includes('email')) {
           form.setError('email', { type: 'manual', message: result.error });
        }
      }
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full Name (Optional)</FormLabel>
              <FormControl>
                <Input placeholder="Enter user's full name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <Input placeholder="Enter username" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email Address</FormLabel>
              <FormControl>
                <Input type="email" placeholder="user@example.com" {...field} />
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
                <FormLabel>{isEditMode ? 'New Password (Optional)' : 'Password'}</FormLabel>
                <FormControl>
                  <Input type="password" placeholder={isEditMode ? "Leave blank to keep current password" : "Enter password"} {...field} />
                </FormControl>
                <FormDescription>
                  {isEditMode ? 'If you want to change the password, enter a new one (min. 6 characters).' : 'Minimum 6 characters.'}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select user role" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {userRoles.map(role => (
                    <SelectItem key={role} value={role}>
                      {role.charAt(0).toUpperCase() + role.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end space-x-3 pt-4">
          <Button type="button" variant="outline" onClick={() => router.push('/admin/users')}>
            <XCircle className="mr-2 h-4 w-4" /> Cancel
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            <Save className="mr-2 h-4 w-4" /> 
            {form.formState.isSubmitting ? 'Saving...' : (isEditMode ? 'Save Changes' : 'Create User')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
