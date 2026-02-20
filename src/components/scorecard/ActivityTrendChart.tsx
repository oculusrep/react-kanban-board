/**
 * Activity Trend Chart
 *
 * Area/line chart showing outreach and connections over time.
 */

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { TrendDataPoint, ActivityTrendChartProps } from '../../types/scorecard';

export default function ActivityTrendChart({
  data,
  height = 300,
  showLegend = true
}: ActivityTrendChartProps) {
  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-gray-400"
        style={{ height }}
      >
        No trend data available
      </div>
    );
  }

  const formatTooltip = (value: number, name: string) => {
    return [value.toLocaleString(), name];
  };

  // Custom tooltip to show breakdown
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) return null;

    const dataPoint = data.find(d => d.label === label) as TrendDataPoint | undefined;
    if (!dataPoint) return null;

    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
        <p className="font-medium text-gray-900 mb-2">{label}</p>

        <div className="space-y-1">
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm bg-blue-500"></span>
              <span className="text-gray-600">Outreach</span>
            </span>
            <span className="font-medium text-blue-600">{dataPoint.outreach}</span>
          </div>

          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm bg-green-500"></span>
              <span className="text-gray-600">Connections</span>
            </span>
            <span className="font-medium text-green-600">{dataPoint.connections}</span>
          </div>
        </div>

        {/* Breakdown if available */}
        {(dataPoint.emails !== undefined || dataPoint.calls !== undefined) && (
          <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500">
            {dataPoint.emails !== undefined && dataPoint.emails > 0 && (
              <div className="flex justify-between">
                <span>Emails</span>
                <span>{dataPoint.emails}</span>
              </div>
            )}
            {dataPoint.linkedin !== undefined && dataPoint.linkedin > 0 && (
              <div className="flex justify-between">
                <span>LinkedIn</span>
                <span>{dataPoint.linkedin}</span>
              </div>
            )}
            {dataPoint.calls !== undefined && dataPoint.calls > 0 && (
              <div className="flex justify-between">
                <span>Call Connects</span>
                <span>{dataPoint.calls}</span>
              </div>
            )}
            {dataPoint.meetings !== undefined && dataPoint.meetings > 0 && (
              <div className="flex justify-between">
                <span>Meetings</span>
                <span>{dataPoint.meetings}</span>
              </div>
            )}
            {dataPoint.responses !== undefined && dataPoint.responses > 0 && (
              <div className="flex justify-between">
                <span>Responses</span>
                <span>{dataPoint.responses}</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart
        data={data}
        margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
      >
        <defs>
          <linearGradient id="outreachGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="connectionsGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: '#6b7280' }}
          axisLine={{ stroke: '#d1d5db' }}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 12, fill: '#6b7280' }}
          axisLine={false}
          tickLine={false}
          width={35}
        />
        <Tooltip content={<CustomTooltip />} />
        {showLegend && (
          <Legend
            wrapperStyle={{ fontSize: '13px' }}
            iconType="square"
            iconSize={10}
          />
        )}
        <Area
          type="monotone"
          dataKey="outreach"
          name="Outreach"
          stroke="#3b82f6"
          strokeWidth={2}
          fill="url(#outreachGradient)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
        <Area
          type="monotone"
          dataKey="connections"
          name="Connections"
          stroke="#22c55e"
          strokeWidth={2}
          fill="url(#connectionsGradient)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
