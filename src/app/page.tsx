
import { LoginForm } from '@/components/auth/login-form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { FileText, SearchCheck } from 'lucide-react';
import Link from 'next/link';
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
            Masuk untuk mengelola tugas dan dokumen notaris Anda.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div className="flex justify-center p-4">Loading...</div>}>
            <LoginForm />
          </Suspense>
        </CardContent>
      </Card>
      <div className="mt-6 text-center">
        <Link href="/track-task" className="text-sm text-primary hover:underline hover:text-primary/90 flex items-center justify-center gap-1">
            <SearchCheck className="h-4 w-4" />
            Lacak Progres Tugas Secara Publik
        </Link>
      </div>
      <footer className="mt-8 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} NotaryFlow. Hak cipta dilindungi.</p>
      </footer>
    </main>
  );
}
