import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

interface ChartDataPoint {
  year: string;
  sales: number;
  salesK: number;
}

interface SalesTrendChartProps {
  data: ChartDataPoint[];
  formatSalesValue: (value: number) => string;
}

const SalesTrendChart: React.FC<SalesTrendChartProps> = ({ data, formatSalesValue }) => {
  return (
    <div
      className="relative p-8 rounded-3xl overflow-hidden shadow-2xl"
      style={{
        height: 340,
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)'
      }}
    >
      {/* Animated glow effect */}
      <div
        className="absolute inset-0 opacity-30 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at 20% 50%, rgba(239, 68, 68, 0.15), transparent 50%), radial-gradient(circle at 80% 50%, rgba(251, 146, 60, 0.15), transparent 50%)'
        }}
      />

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-5 pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '20px 20px'
        }}
      />

      <div className="relative h-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 20, right: 30, bottom: 50, left: 80 }}
          >
            <defs>
              <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fb923c" stopOpacity={0.4} />
                <stop offset="50%" stopColor="#f97316" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#ea580c" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="year"
              axisLine={{ stroke: '#334155', strokeWidth: 2 }}
              tickLine={false}
              tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }}
              label={{
                value: 'Year',
                position: 'bottom',
                offset: 30,
                fill: '#cbd5e1',
                fontSize: 12,
                fontWeight: 700
              }}
            />
            <YAxis
              axisLine={{ stroke: '#334155', strokeWidth: 2 }}
              tickLine={false}
              tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }}
              tickFormatter={(value) => formatSalesValue(value)}
              label={{
                value: 'Revenue',
                angle: -90,
                position: 'insideLeft',
                offset: -60,
                fill: '#cbd5e1',
                fontSize: 12,
                fontWeight: 700
              }}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const tooltipData = payload[0].payload;
                  return (
                    <div
                      className="px-5 py-4 rounded-2xl shadow-2xl"
                      style={{
                        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.98) 0%, rgba(15, 23, 42, 0.98) 100%)',
                        border: '2px solid rgba(251, 146, 60, 0.5)',
                        backdropFilter: 'blur(10px)'
                      }}
                    >
                      <div className="text-xs font-bold text-orange-300 uppercase tracking-widest mb-2 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                        {tooltipData.year}
                      </div>
                      <div
                        className="text-3xl font-black tracking-tight"
                        style={{
                          background: 'linear-gradient(135deg, #fb923c 0%, #f97316 50%, #ea580c 100%)',
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                          backgroundClip: 'text'
                        }}
                      >
                        {formatSalesValue(tooltipData.sales)}
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Area
              type="cardinal"
              dataKey="sales"
              stroke="#fb923c"
              strokeWidth={5}
              fill="url(#salesGradient)"
              dot={{ fill: '#fbbf24', stroke: '#fb923c', strokeWidth: 3, r: 5 }}
              activeDot={{ fill: '#fbbf24', stroke: '#fb923c', strokeWidth: 3, r: 7 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default SalesTrendChart;
