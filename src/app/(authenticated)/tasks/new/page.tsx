
import { TaskForm } from '@/components/tasks/TaskForm';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ListChecks } from 'lucide-react';
import pool from '@/lib/db';
import { fetchUsers } from '@/actions/userActions';
import type { User } from '@/types';

interface BasicDocumentInfo {
  id: string;
  name: string;
  type?: string;
  ownCloudPath?: string; 
  isOriginalRequested?: boolean; // Added
  originalFileHolderId?: string | null; // Added
}

async function getPageData(): Promise<{
  availableDocs: BasicDocumentInfo[];
  allUsers: Pick<User, 'id' | 'username' | 'email' | 'role' | 'name' | 'createdAt'>[];
}> {
  const connection = await pool.getConnection();
  try {
    const [docRows]: [any[], any] = await connection.execute(
      'SELECT id, name, type, ownCloudPath, isOriginalRequested, originalFileHolderId FROM documents ORDER BY name ASC' // Added new fields
    );
    const availableDocs: BasicDocumentInfo[] = docRows.map((d: any) => ({
      id: d.id,
      name: d.name,
      type: d.type || undefined,
      ownCloudPath: d.ownCloudPath || undefined,
      isOriginalRequested: Boolean(d.isOriginalRequested), // Added
      originalFileHolderId: d.originalFileHolderId,      // Added
    }));

    const allUsers = await fetchUsers(); // Fetch all users

    return { availableDocs, allUsers };
  } catch (error) {
    console.error("Error fetching data for new task form:", error);
    return { availableDocs: [], allUsers: [] };
  } finally {
    connection.release();
  }
}


// This page needs to be a Server Component to fetch initial data
export default async function NewTaskPage() {
  const { availableDocs, allUsers } = await getPageData();

  return (
    <div className="container mx-auto px-4 md:px-6 py-6">
      <header className="mb-8 mt-0">
        <div className="flex items-center gap-3">
            <ListChecks className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight text-foreground mt-0">Create New Task</h1>
        </div>
        <p className="mt-2 text-muted-foreground">
          Fill in the details below to add a new task to the system.
        </p>
      </header>
      <Card className="shadow-lg max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Task Details</CardTitle>
          <CardDescription>Provide all necessary information for the new task.</CardDescription>
        </CardHeader>
        <CardContent>
          <TaskForm 
            availableDocuments={availableDocs}
            allUsers={allUsers}
            // No onSubmit prop, TaskForm handles create via internal Server Action call
          />
        </CardContent>
      </Card>
    </div>
  );
}
