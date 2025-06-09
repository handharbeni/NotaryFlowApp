
import { fetchArchivedTasks } from '@/actions/taskActions';
import type { Task } from '@/types';
import { ArchivedTaskListClient } from '@/components/archive/ArchivedTaskListClient';
import { ArchiveIcon } from 'lucide-react'; // Using a generic archive icon

export default async function ArchivePage() {
  const archivedTasks: Task[] = await fetchArchivedTasks();

  return (
    <div className="container mx-auto px-4 md:px-6 py-6">
      <header className="mb-8 mt-0">
        <div className="flex items-center gap-3">
          <ArchiveIcon className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight text-foreground mt-0">Arsip Tugas</h1>
        </div>
        <p className="mt-2 text-muted-foreground">
          Lihat daftar tugas yang telah diarsipkan. Tugas di sini bersifat hanya-baca.
        </p>
      </header>
      <ArchivedTaskListClient initialTasks={archivedTasks} />
    </div>
  );
}
