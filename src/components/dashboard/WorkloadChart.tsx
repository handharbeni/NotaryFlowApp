
'use client';

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { ChartTooltipContent, ChartConfig, ChartContainer } from '@/components/ui/chart';

export interface WorkloadChartDataPoint {
  name: string; // Staff name
  tasks: number; // Number of active tasks
}

interface WorkloadChartProps {
  data: WorkloadChartDataPoint[];
}

const chartConfig = {
  tasks: {
    label: "Active Tasks",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig;


export function WorkloadChart({ data }: WorkloadChartProps) {
  if (!data || data.length === 0) {
    return <div className="flex items-center justify-center h-[350px] text-muted-foreground">No workload data available.</div>;
  }
  return (
    <div className="h-[350px] w-full">
     <ChartContainer config={chartConfig} className="min-h-[200px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis 
            dataKey="name" 
            tickLine={false}
            axisLine={false}
            stroke="hsl(var(--foreground))" 
            fontSize={12} 
           />
          <YAxis 
            stroke="hsl(var(--foreground))" 
            fontSize={12}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => `${value}`}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: 'hsl(var(--muted))' }}
            content={<ChartTooltipContent hideLabel />}
          />
          <Legend />
          <Bar dataKey="tasks" fill="var(--color-tasks)" radius={[4, 4, 0, 0]} name="Active Tasks" />
        </BarChart>
      </ResponsiveContainer>
      </ChartContainer>
    </div>
  );
}

