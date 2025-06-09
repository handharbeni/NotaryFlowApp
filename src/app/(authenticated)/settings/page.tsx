
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import type { User } from '@/types';
import { Settings as SettingsIcon } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UpdatePasswordForm } from '@/components/settings/UpdatePasswordForm';
import { JobNumberPatternForm } from '@/components/settings/JobNumberPatternForm';
import { getJobNumberPattern } from '@/actions/settingsActions';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  const user = session?.user as User | undefined;
  let currentJobNumberPattern: string | null = null;

  if (user?.role === 'admin') {
    currentJobNumberPattern = await getJobNumberPattern();
  }

  return (
    <div className="container mx-auto px-4 md:px-6 py-6">
      <header className="mb-8 mt-0">
        <div className="flex items-center gap-3">
          <SettingsIcon className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight text-foreground mt-0">Pengaturan</h1>
        </div>
        <p className="mt-2 text-muted-foreground">
          Kelola pengaturan akun dan preferensi sistem Anda.
        </p>
      </header>

      <Tabs defaultValue="password" className="w-full">
        <TabsList className={`grid w-full grid-cols-1 ${user?.role === 'admin' ? 'md:grid-cols-2' : 'md:grid-cols-1'} max-w-md mx-auto md:max-w-lg mb-6`}>
          <TabsTrigger value="password">Ubah Kata Sandi</TabsTrigger>
          {user?.role === 'admin' && (
            <TabsTrigger value="job_pattern">Pola Nomor Akta</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="password">
          <Card className="max-w-xl mx-auto shadow-lg">
            <CardHeader>
              <CardTitle>Ubah Kata Sandi Anda</CardTitle>
              <CardDescription>
                Untuk keamanan akun Anda, gunakan kata sandi yang kuat dan unik.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UpdatePasswordForm />
            </CardContent>
          </Card>
        </TabsContent>

        {user?.role === 'admin' && (
          <TabsContent value="job_pattern">
            <Card className="max-w-xl mx-auto shadow-lg">
              <CardHeader>
                <CardTitle>Konfigurasi Pola Nomor Akta</CardTitle>
                <CardDescription>
                  Atur pola untuk pembuatan nomor akta/pekerjaan secara otomatis.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <JobNumberPatternForm initialPattern={currentJobNumberPattern} />
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

    