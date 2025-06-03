
import { fetchUserById } from '@/actions/userActions';
import { UserForm, type UserFormValues } from '@/components/admin/UserForm';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Edit3 } from 'lucide-react';
import { notFound } from 'next/navigation';

interface EditUserPageProps {
  params: { id: string };
}

export default async function EditUserPage({ params }: EditUserPageProps) {
  const userId = params.id;
  const user = await fetchUserById(userId);

  if (!user) {
    notFound();
  }

  // Prepare initialData for the form, password should not be pre-filled for editing
  const initialData: UserFormValues & { id: string } = {
    id: user.id,
    name: user.name || '',
    username: user.username,
    email: user.email,
    role: user.role as 'staff' | 'admin',
    // Do not include password in initialData for editing
  };

  return (
    <div className="container mx-auto px-4 md:px-6 py-6">
      <header className="mb-8 mt-0">
        <div className="flex items-center gap-3">
            <Edit3 className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight text-foreground mt-0">Edit User</h1>
        </div>
        <p className="mt-2 text-muted-foreground">
          Modify the details for user: <span className="font-semibold">{user.username}</span>.
        </p>
      </header>
      <Card className="shadow-lg max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>User Details</CardTitle>
          <CardDescription>Update the user's information. Leave password blank to keep it unchanged.</CardDescription>
        </CardHeader>
        <CardContent>
          <UserForm initialData={initialData} />
        </CardContent>
      </Card>
    </div>
  );
}
