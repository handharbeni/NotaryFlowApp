
import { BarChart2 } from 'lucide-react';
import { IncomeReportClient } from '@/components/reports/IncomeReportClient'; // Name can remain if you prefer, or change to ActivityReportClient
import { fetchActivityReportData } from '@/actions/reportActions'; // Updated action name

// Helper to get default start and end dates for the current month
const getCurrentMonthDateRange = () => {
  const today = new Date();
  const firstDayCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDayCurrentMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return {
    startDate: firstDayCurrentMonth.toISOString().split('T')[0],
    endDate: lastDayCurrentMonth.toISOString().split('T')[0],
  };
};

export default async function ActivityReportPage() { // Renamed page function for clarity
  const { startDate: defaultStartDate, endDate: defaultEndDate } = getCurrentMonthDateRange();
  // Fetch initial data for new tasks created in the current month
  const initialReportData = await fetchActivityReportData(defaultStartDate, defaultEndDate);

  return (
    <div className="container mx-auto px-4 md:px-6 py-6">
      <header className="mb-8 mt-0">
        <div className="flex items-center gap-3">
          <BarChart2 className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight text-foreground mt-0">Laporan Aktivitas Masuk</h1>
        </div>
        <p className="mt-2 text-muted-foreground">
          Analisis tugas baru yang dibuat dalam rentang tanggal yang dipilih, beserta tipe dokumen terkait.
        </p>
      </header>
      <IncomeReportClient initialData={initialReportData} /> 
    </div>
  );
}

