
import { TrackTaskClient } from '@/components/public/TrackTaskClient';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { FileSearch } from 'lucide-react';
import Link from 'next/link';

export default function TrackTaskPage() {
  return (
    <main className="flex flex-col items-center w-full max-w-xl">
      <Card className="w-full shadow-2xl">
        <CardHeader className="text-center">
          <Link href="/" passHref className="inline-block mx-auto mb-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground cursor-pointer hover:bg-primary/90 transition-colors">
                <FileSearch size={32} />
            </div>
          </Link>
          <CardTitle className="text-3xl font-bold tracking-tight">Lacak Progres Tugas</CardTitle>
          <CardDescription className="text-muted-foreground">
            Masukkan Nomor Pekerjaan Anda untuk melihat status tugas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TrackTaskClient />
        </CardContent>
      </Card>
       <footer className="mt-8 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} NotaryFlow. Hak cipta dilindungi.</p>
        <p className="mt-1">
          <Link href="/" className="hover:underline text-primary">Masuk ke Akun Anda</Link>
        </p>
      </footer>
    </main>
  );
}
