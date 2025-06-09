
import { StatisticCard } from '@/components/dashboard/StatisticCard';
import { WorkloadChart, type WorkloadChartDataPoint } from '@/components/dashboard/WorkloadChart';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FilePlus, ListChecks, UserCheck, Clock, Users, Activity, FolderArchive, CheckSquare, FileWarning, Building, FileSignature, Send } from 'lucide-react'; // Added Send here
import Link from 'next/link';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import type { UserRole, User as SessionUser } from '@/types';
import { fetchActionableTasksCountForUser } from '@/actions/taskActions';
import { fetchUsers } from '@/actions/userActions'; 
import pool from '@/lib/db'; 
import type { RowDataPacket } from 'mysql2';
import { formatDistanceToNow } from 'date-fns';
import { id as localeID } from 'date-fns/locale';


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
        { title: 'Total Pengguna', value: allUsers.length.toString(), icon: Users, description: 'Semua pengguna terdaftar di sistem' },
        { title: 'Total Tugas', value: taskRows[0].count.toString(), icon: ListChecks, description: 'Semua tugas, di semua status' },
        { title: 'Dokumen di Sistem', value: docRows[0].count.toString(), icon: FolderArchive, description: 'Total dokumen yang dikelola' },
        { title: 'Kesehatan Sistem', value: 'Online', icon: Activity, description: 'Status operasional sistem saat ini' },
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
          staffWithMostTasks = `${mostActiveStaffRows[0].staffName} (${mostActiveStaffRows[0].taskCount} tugas)`;
        }
      }
      const [approvedTasksForNotaryPrep] = await pool.query<RowDataPacket[]>(
        "SELECT COUNT(*) as count FROM tasks WHERE status = 'Approved'"
      );

      stats = [
        { title: 'Tugas Menunggu Review Anda', value: tasksPendingReviewCount.toString(), icon: FileWarning, description: 'Tugas yang dikirim staf atau CS menunggu persetujuan Anda' },
        { title: 'Tugas Aktif Tim', value: teamActiveTasksCount.toString(), icon: ListChecks, description: 'Tugas aktif yang ditugaskan ke anggota staf Anda' },
        { title: 'Siap Dikirim ke Persiapan Notaris (CS)', value: approvedTasksForNotaryPrep[0].count.toString(), icon: Send, description: 'Tugas yang disetujui dan siap untuk dikirim ke CS untuk persiapan notaris.' },
        { title: 'Staf Paling Sibuk', value: staffWithMostTasks, icon: UserCheck, description: 'Staf dengan beban kerja aktif tertinggi saat ini' },
      ];
      break;
    case 'staff':
      const [staffOverdueTasks] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) as count FROM tasks WHERE assignedTo = ? AND status IN ('To Do', 'In Progress') AND dueDate < NOW()", [userId]);

      stats = [
        { title: 'Tugas Aktif Anda', value: actionableTasksCount.toString(), icon: ListChecks, description: 'Tugas yang ditugaskan kepada Anda yang berstatus "To Do" atau "In Progress"' },
        { title: 'Tugas Terlambat Anda', value: staffOverdueTasks[0].count.toString(), icon: Clock, changeType: 'negative', description: 'Tugas Anda yang melewati batas waktu' },
        { title: 'Tenggat Waktu Mendatang', value: 'N/A', icon: FileWarning, description: 'Tugas yang akan jatuh tempo dalam 7 hari ke depan (placeholder)' }, 
        { title: 'Selesai Bulan Ini', value: 'N/A', icon: CheckSquare, description: 'Tugas yang Anda selesaikan bulan ini (placeholder)' },
      ];
      break;
    case 'cs':
      const [tasksToPrepForManager] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) as count FROM tasks WHERE status = 'To Do' AND (assignedTo = ? OR assignedTo IS NULL)", [userId]);
      const [tasksPendingNotaryFileCollection] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) as count FROM tasks WHERE status = 'Pending Notarization'"); 
      const [tasksToArchive] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) as count FROM tasks WHERE status = 'Notarization Complete'"); 

      stats = [
        { title: 'Tugas untuk Disiapkan ke Manajer', value: tasksToPrepForManager[0].count.toString(), icon: FilePlus, description: "Tugas baru yang sedang Anda siapkan atau perlu dikirim" },
        { title: 'Tugas Menunggu Persiapan Notaris', value: tasksPendingNotaryFileCollection[0].count.toString(), icon: FileSignature, description: "Tugas yang perlu dikumpulkan filenya dan disiapkan untuk notaris." },
        { title: 'Tugas untuk Diarsipkan', value: tasksToArchive[0].count.toString(), icon: FolderArchive, description: "Tugas dengan notarisasi selesai, siap untuk pengarsipan" },
        { title: 'Dokumen Diproses Hari Ini', value: 'N/A', icon: FilePlus, description: 'Dokumen yang ditangani CS hari ini (placeholder)' },
      ];
      break;
    case 'notary':
      const [tasksReadyForNotarization] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) as count FROM tasks WHERE status = 'Ready for Notarization' AND (assignedTo = ? OR assignedTo IS NULL)", [userId]);
      stats = [
        { title: 'Tugas Siap untuk Notarisasi', value: tasksReadyForNotarization[0].count.toString(), icon: Building, description: 'Tugas siap untuk Anda notarisasi (belum ditugaskan atau ditugaskan kepada Anda)' },
        { title: 'Notarisasi Bulan Ini', value: 'N/A', icon: CheckSquare, description: 'Total notarisasi yang Anda selesaikan bulan ini (placeholder)' },
        { title: 'Slot Tersedia Hari Ini', value: 'N/A', icon: UserCheck, description: 'Slot janji temu Anda yang tersedia (placeholder)' },
        { title: 'Rata-rata Waktu Notarisasi', value: 'N/A', icon: Clock, description: 'Rata-rata waktu Anda per notarisasi (placeholder)' },
      ];
      break;
    default: 
      stats = [
        { title: 'Tugas Aktif', value: actionableTasksCount.toString(), icon: ListChecks, description: 'Tugas aktif Anda saat ini' },
        { title: 'Status Sistem', value: 'Online', icon: Activity, description: 'Status operasional sistem saat ini' },
      ];
  }
  return stats;
}

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

interface RecentActivityItem {
  id: string; 
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
      assignedToName: row.assignedToName || row.assignedToUsername || 'Tidak Ditugaskan',
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
    return <p>Akses Ditolak. Silakan masuk.</p>;
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
    admin: { title: "Dasbor Admin", subtitle: "Mengawasi seluruh sistem NotaryFlow." },
    manager: { title: "Dasbor Manajer", subtitle: "Kelola tugas dan kinerja tim Anda." },
    staff: { title: "Dasbor Anda", subtitle: "Berikut adalah ikhtisar tugas yang diberikan kepada Anda." },
    cs: { title: "Dasbor Layanan Pelanggan", subtitle: "Kelola dokumen klien, siapkan tugas, dan awasi pengarsipan." },
    notary: { title: "Dasbor Notaris", subtitle: "Lacak tugas notarisasi dan jadwal Anda." },
  };

  const { title: welcomeTitle, subtitle: welcomeSubtitle } = welcomeMessages[currentUser.role] || { title: "Selamat Datang di NotaryFlow", subtitle: "Berikut adalah ikhtisar aktivitas Anda." };


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
                    <FilePlus className="mr-2 h-4 w-4" /> Dokumen Baru
                </Link>
                </Button>
            )}
            {(currentUser.role === 'admin' || currentUser.role === 'manager' || currentUser.role === 'cs') && (
                <Button asChild>
                <Link href="/tasks/new">
                    <ListChecks className="mr-2 h-4 w-4" /> Tugas Baru
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
              <CardTitle>Distribusi Beban Kerja</CardTitle>
              <CardDescription>Tugas aktif yang ditugaskan per anggota staf.</CardDescription>
            </CardHeader>
            <CardContent>
              <WorkloadChart data={workloadChartData} />
            </CardContent>
          </Card>
          
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>Pembaruan Tugas Terkini</CardTitle>
              <CardDescription>Modifikasi tugas terbaru dalam sistem.</CardDescription>
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
                          Tugas "<Link href={`/tasks/${activity.id}/edit`} className="hover:underline">{activity.title}</Link>"
                          <span className="text-muted-foreground"> (Status: {activity.status}) telah diperbarui.</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                           Ditugaskan kepada: {activity.assignedToName} &bull; {formatDistanceToNow(activity.updatedAt, { addSuffix: true, locale: localeID })}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Tidak ada aktivitas tugas terkini yang ditemukan.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
       {(currentUser.role === 'staff' || currentUser.role === 'cs' || currentUser.role === 'notary') && (
         <div className="mt-8">
            <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle>Tautan Cepat</CardTitle>
                    <CardDescription>Aksi dan informasi yang sering diakses.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                     {currentUser.role === 'staff' && (
                        <Button variant="outline" asChild><Link href="/tasks?status=InProgress">Lihat Tugas "In Progress" Anda</Link></Button>
                     )}
                     {currentUser.role === 'cs' && (
                        <>
                            <Button variant="outline" asChild><Link href="/tasks?status=ToDo">Lihat Tugas untuk Disiapkan</Link></Button>
                            <Button variant="outline" asChild><Link href="/tasks?status=PendingNotarization">Lihat Tugas untuk Persiapan Notaris</Link></Button>
                            <Button variant="outline" asChild><Link href="/tasks?status=NotarizationComplete">Lihat Tugas untuk Diarsipkan</Link></Button>
                        </>
                     )}
                     {currentUser.role === 'notary' && (
                        <Button variant="outline" asChild><Link href="/tasks?status=ReadyForNotarization">Lihat Tugas untuk Notarisasi</Link></Button>
                     )}
                    <Button variant="outline" asChild><Link href="/documents">Jelajahi Semua Dokumen</Link></Button>
                    <Button variant="outline" asChild><Link href="/notifications">Periksa Notifikasi</Link></Button>
                </CardContent>
            </Card>
         </div>
       )}
    </div>
  );
}

    