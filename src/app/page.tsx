import { LoginForm } from '@/components/auth/login-form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { FileText } from 'lucide-react';
import { Suspense } from 'react';

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-background to-secondary p-4">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <FileText size={32} />
          </div>
          <CardTitle className="text-3xl font-bold tracking-tight">NotaryFlow</CardTitle>
          <CardDescription className="text-muted-foreground">
            Sign in to manage your notary tasks and documents.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div className="flex justify-center items-center py-6">Loading...</div>}>
            <LoginForm />
          </Suspense>
        </CardContent>
      </Card>
      <footer className="mt-8 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} NotaryFlow. All rights reserved.</p>
      </footer>
    </main>
  );
}
