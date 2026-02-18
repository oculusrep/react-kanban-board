/**
 * Outreach vs Connections Bar Chart
 *
 * Grouped bar chart comparing outreach and connections across periods.
 */

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { PeriodComparisonData, OutreachConnectionsChartProps } from '../../types/scorecard';

export default function OutreachConnectionsChart({
  data,
  height = 300
}: OutreachConnectionsChartProps) {
  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-gray-400"
        style={{ height }}
      >
        No data available
      </div>
    );
  }

  const formatTooltip = (value: number, name: string) => {
    return [value.toLocaleString(), name];
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
        barCategoryGap="20%"
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis
          dataKey="periodLabel"
          tick={{ fontSize: 12, fill: '#6b7280' }}
          axisLine={{ stroke: '#d1d5db' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 12, fill: '#6b7280' }}
          axisLine={false}
          tickLine={false}
          width={45}
        />
        <Tooltip
          formatter={formatTooltip}
          contentStyle={{
            backgroundColor: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
            fontSize: '13px'
          }}
          cursor={{ fill: 'rgba(0, 0, 0, 0.04)' }}
        />
        <Legend
          wrapperStyle={{ fontSize: '13px' }}
          iconType="square"
          iconSize={10}
        />
        <Bar
          dataKey="outreach"
          name="Outreach"
          fill="#3b82f6"
          radius={[4, 4, 0, 0]}
          maxBarSize={40}
        />
        <Bar
          dataKey="connections"
          name="Connections"
          fill="#22c55e"
          radius={[4, 4, 0, 0]}
          maxBarSize={40}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
