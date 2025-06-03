
import { StatisticCard } from '@/components/dashboard/StatisticCard';
import { WorkloadChart, type WorkloadChartDataPoint } from '@/components/dashboard/WorkloadChart';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FilePlus, ListChecks, UserCheck, Clock, Users, Activity, FolderArchive, CheckSquare, FileWarning, Building } from 'lucide-react';
import Link from 'next/link';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import type { UserRole, User as SessionUser } from '@/types';
import { fetchActionableTasksCountForUser } from '@/actions/taskActions';
import { fetchUsers } from '@/actions/userActions'; // For admin stats
import pool from '@/lib/db'; 
import type { RowDataPacket } from 'mysql2';
import { formatDistanceToNow } from 'date-fns';


interface DashboardStat {
  title: string;
  value: string;
  icon: React.ElementType;
  change?: string;
  changeType?: 'positive' | 'negative';
  description: string;
}

async function getDashboardStatsForRole(currentUser: SessionUser & { role: UserRole }): Promise<DashboardStat[]> {
  const userId = currentUser.id;
  const role = currentUser.role;

  let stats: DashboardStat[] = [];

  const actionableTasksCount = await fetchActionableTasksCountForUser(userId, role);
  
  switch (role) {
    case 'admin':
      const allUsers = await fetchUsers();
      const [taskRows] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) as count FROM tasks');
      const [docRows] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) as count FROM documents');
      stats = [
        { title: 'Total Users', value: allUsers.length.toString(), icon: Users, description: 'All registered users in the system' },
        { title: 'Total Tasks', value: taskRows[0].count.toString(), icon: ListChecks, description: 'All tasks, across all statuses' },
        { title: 'Documents in System', value: docRows[0].count.toString(), icon: FolderArchive, description: 'Total documents managed' },
        { title: 'System Health', value: 'Online', icon: Activity, description: 'Current system operational status' },
      ];
      break;
    case 'manager':
      const [pendingReviewRows] = await pool.query<RowDataPacket[]>(
        "SELECT COUNT(*) as count FROM tasks WHERE status = 'Pending Review'"
      );
      const tasksPendingReviewCount = pendingReviewRows[0].count || 0;

      const [staffUserRows] = await pool.query<RowDataPacket[]>(
        "SELECT id FROM users WHERE role = 'staff'"
      );
      const staffUserIds = staffUserRows.map(row => row.id);
      
      let teamActiveTasksCount = 0;
      if (staffUserIds.length > 0) {
        const [teamActiveTaskRows] = await pool.query<RowDataPacket[]>(
          "SELECT COUNT(*) as count FROM tasks WHERE status IN ('To Do', 'In Progress') AND assignedTo IN (?)",
          [staffUserIds]
        );
        teamActiveTasksCount = teamActiveTaskRows[0].count || 0;
      }

      let staffWithMostTasks = 'N/A';
      if (staffUserIds.length > 0) {
        const [mostActiveStaffRows] = await pool.query<RowDataPacket[]>(
          `SELECT u.name as staffName, COUNT(t.id) as taskCount 
           FROM tasks t 
           JOIN users u ON t.assignedTo = u.id 
           WHERE t.status IN ('To Do', 'In Progress') AND t.assignedTo IN (?) 
           GROUP BY t.assignedTo, u.name 
           ORDER BY taskCount DESC 
           LIMIT 1`,
          [staffUserIds]
        );
        if (mostActiveStaffRows.length > 0) {
          staffWithMostTasks = `${mostActiveStaffRows[0].staffName} (${mostActiveStaffRows[0].taskCount} tasks)`;
        }
      }

      stats = [
        { title: 'Tasks Pending Your Review', value: tasksPendingReviewCount.toString(), icon: FileWarning, description: 'Tasks submitted by staff or CS awaiting your approval' },
        { title: 'Team Active Tasks', value: teamActiveTasksCount.toString(), icon: ListChecks, description: 'Active tasks assigned to your staff members' },
        { title: 'Busiest Staff Member', value: staffWithMostTasks, icon: UserCheck, description: 'Staff with the highest current active workload' },
        { title: 'Avg. Task Completion', value: 'N/A', icon: Clock, description: 'Team average for task completion (placeholder)' },
      ];
      break;
    case 'staff':
      const [staffOverdueTasks] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) as count FROM tasks WHERE assignedTo = ? AND status IN ('To Do', 'In Progress') AND dueDate < NOW()", [userId]);

      stats = [
        { title: 'Your Active Tasks', value: actionableTasksCount.toString(), icon: ListChecks, description: 'Tasks assigned to you that are "To Do" or "In Progress"' },
        { title: 'Your Overdue Tasks', value: staffOverdueTasks[0].count.toString(), icon: Clock, changeType: 'negative', description: 'Your tasks past their due date' },
        { title: 'Upcoming Deadlines', value: 'N/A', icon: FileWarning, description: 'Tasks due in the next 7 days (placeholder)' }, 
        { title: 'Your Completed (Month)', value: 'N/A', icon: CheckSquare, description: 'Tasks you completed this month (placeholder)' },
      ];
      break;
    case 'cs':
      const [tasksToPrepForManager] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) as count FROM tasks WHERE status = 'To Do' AND (assignedTo = ? OR assignedTo IS NULL)", [userId]);
      const [tasksToSendToNotary] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) as count FROM tasks WHERE status = 'Approved'"); 
      const [tasksToArchive] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) as count FROM tasks WHERE status = 'Notarization Complete'"); 

      stats = [
        { title: 'Tasks to Prepare for Manager', value: tasksToPrepForManager[0].count.toString(), icon: FilePlus, description: "New tasks you're preparing or need to submit" },
        { title: 'Tasks to Send to Notary', value: tasksToSendToNotary[0].count.toString(), icon: CheckSquare, description: "Tasks approved and ready for notary assignment" },
        { title: 'Tasks to Archive', value: tasksToArchive[0].count.toString(), icon: FolderArchive, description: "Tasks with notarization complete, ready for archival" },
        { title: 'Docs Processed Today', value: 'N/A', icon: FilePlus, description: 'Documents handled by CS today (placeholder)' },
      ];
      break;
    case 'notary':
      stats = [
        { title: 'Tasks Pending Notarization', value: actionableTasksCount.toString(), icon: Building, description: 'Tasks ready for you to notarize (unassigned or assigned to you)' },
        { title: 'Notarizations This Month', value: 'N/A', icon: CheckSquare, description: 'Total notarizations you completed this month (placeholder)' },
        { title: 'Available Slots Today', value: 'N/A', icon: UserCheck, description: 'Your available appointment slots (placeholder)' },
        { title: 'Avg. Notarization Time', value: 'N/A', icon: Clock, description: 'Your average time per notarization (placeholder)' },
      ];
      break;
    default: 
      stats = [
        { title: 'Active Tasks', value: actionableTasksCount.toString(), icon: ListChecks, description: 'Your currently active tasks' },
        { title: 'System Status', value: 'Online', icon: Activity, description: 'Current system operational status' },
      ];
  }
  return stats;
}

// For Workload Chart (Managers/Admins)
async function getWorkloadDistribution(): Promise<WorkloadChartDataPoint[]> {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(`
      SELECT u.name as staffName, COUNT(t.id) as activeTasks
      FROM users u
      JOIN tasks t ON u.id = t.assignedTo
      WHERE u.role = 'staff' AND t.status IN ('To Do', 'In Progress')
      GROUP BY u.id, u.name
      ORDER BY activeTasks DESC
      LIMIT 7; 
    `);
    return rows.map(row => ({ name: row.staffName, tasks: row.activeTasks as number }));
  } catch (error) {
    console.error("Error fetching workload distribution data:", error);
    return [];
  }
}

// For Recent Activity (Managers/Admins)
interface RecentActivityItem {
  id: string; // task id
  title: string;
  status: string;
  updatedAt: Date;
  assignedToName: string | null;
  icon: React.ElementType; 
}

async function getRecentActivities(): Promise<RecentActivityItem[]> {
  try {
    const [taskRows] = await pool.query<RowDataPacket[]>(`
      SELECT t.id, t.title, t.status, t.updatedAt, u.name as assignedToName, u.username as assignedToUsername
      FROM tasks t
      LEFT JOIN users u ON t.assignedTo = u.id
      ORDER BY t.updatedAt DESC
      LIMIT 5;
    `);

    return taskRows.map(row => ({
      id: row.id,
      title: row.title,
      status: row.status,
      updatedAt: new Date(row.updatedAt),
      assignedToName: row.assignedToName || row.assignedToUsername || 'Unassigned',
      icon: ListChecks, 
    }));
  } catch (error) {
    console.error("Error fetching recent activities:", error);
    return [];
  }
}


export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return <p>Access Denied. Please log in.</p>;
  }
  const currentUser = session.user as SessionUser & { role: UserRole };
  const dashboardStats = await getDashboardStatsForRole(currentUser);

  let workloadChartData: WorkloadChartDataPoint[] = [];
  let recentActivitiesData: RecentActivityItem[] = [];

  if (currentUser.role === 'admin' || currentUser.role === 'manager') {
    workloadChartData = await getWorkloadDistribution();
    recentActivitiesData = await getRecentActivities();
  }

  const welcomeMessages: Record<UserRole, { title: string, subtitle: string }> = {
    admin: { title: "Admin Dashboard", subtitle: "Oversee the entire NotaryFlow system." },
    manager: { title: "Manager Dashboard", subtitle: "Manage your team's tasks and performance." },
    staff: { title: "Your Dashboard", subtitle: "Here's an overview of your assigned tasks." },
    cs: { title: "Customer Service Dashboard", subtitle: "Manage client documents, prepare tasks, and oversee archival." },
    notary: { title: "Notary Dashboard", subtitle: "Track your notarization tasks and schedule." },
  };

  const { title: welcomeTitle, subtitle: welcomeSubtitle } = welcomeMessages[currentUser.role] || { title: "Welcome to NotaryFlow", subtitle: "Here's an overview of your activities." };


  return (
    <div className="container mx-auto px-4 md:px-6 py-6">
      <header className="mb-8 mt-0">
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground mt-0">{welcomeTitle}</h1>
            <p className="text-muted-foreground">{welcomeSubtitle}</p>
          </div>
          <div className="flex gap-2">
            {(currentUser.role === 'admin' || currentUser.role === 'manager' || currentUser.role === 'cs') && (
                <Button variant="outline" asChild>
                <Link href="/documents/new">
                    <FilePlus className="mr-2 h-4 w-4" /> New Document
                </Link>
                </Button>
            )}
            {(currentUser.role === 'admin' || currentUser.role === 'manager' || currentUser.role === 'cs') && (
                <Button asChild>
                <Link href="/tasks/new">
                    <ListChecks className="mr-2 h-4 w-4" /> New Task
                </Link>
                </Button>
            )}
          </div>
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {dashboardStats.map((stat) => (
          <StatisticCard
            key={stat.title}
            title={stat.title}
            value={stat.value}
            icon={stat.icon}
            change={stat.change}
            changeType={stat.changeType}
            description={stat.description}
          />
        ))}
      </div>

      {(currentUser.role === 'admin' || currentUser.role === 'manager') && (
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>Workload Distribution</CardTitle>
              <CardDescription>Active tasks assigned per staff member.</CardDescription>
            </CardHeader>
            <CardContent>
              <WorkloadChart data={workloadChartData} />
            </CardContent>
          </Card>
          
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>Recent Task Updates</CardTitle>
              <CardDescription>Latest task modifications in the system.</CardDescription>
            </CardHeader>
            <CardContent>
              {recentActivitiesData.length > 0 ? (
                <ul className="space-y-4">
                  {recentActivitiesData.map(activity => (
                    <li key={activity.id} className="flex items-start space-x-3">
                      <div className="flex-shrink-0 pt-1">
                        <activity.icon className="h-5 w-5 text-accent" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          Task "<Link href={`/tasks/${activity.id}/edit`} className="hover:underline">{activity.title}</Link>"
                          <span className="text-muted-foreground"> (Status: {activity.status}) was updated.</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                           Assigned to: {activity.assignedToName} &bull; {formatDistanceToNow(activity.updatedAt, { addSuffix: true })}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No recent task activities found.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
       {(currentUser.role === 'staff' || currentUser.role === 'cs' || currentUser.role === 'notary') && (
         <div className="mt-8">
            <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle>Quick Links</CardTitle>
                    <CardDescription>Frequently accessed actions and information.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                     {currentUser.role === 'staff' && (
                        <Button variant="outline" asChild><Link href="/tasks?status=InProgress">View Your In-Progress Tasks</Link></Button>
                     )}
                     {currentUser.role === 'cs' && (
                        <>
                            <Button variant="outline" asChild><Link href="/tasks?status=ToDo">View Tasks to Prepare</Link></Button>
                            <Button variant="outline" asChild><Link href="/tasks?status=Approved">View Tasks to Send to Notary</Link></Button>
                            <Button variant="outline" asChild><Link href="/tasks?status=NotarizationComplete">View Tasks to Archive</Link></Button>
                        </>
                     )}
                     {currentUser.role === 'notary' && (
                        <Button variant="outline" asChild><Link href="/tasks?status=PendingNotarization">View Tasks for Notarization</Link></Button>
                     )}
                    <Button variant="outline" asChild><Link href="/documents">Browse All Documents</Link></Button>
                    <Button variant="outline" asChild><Link href="/notifications">Check Notifications</Link></Button>
                </CardContent>
            </Card>
         </div>
       )}
    </div>
  );
}
    
