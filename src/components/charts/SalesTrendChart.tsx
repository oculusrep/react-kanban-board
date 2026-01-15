import React from 'react';
import { ResponsiveLine } from '@nivo/line';

interface ChartDataPoint {
  year: number;
  sales: number;
}

interface SalesTrendChartProps {
  data: ChartDataPoint[];
}

const formatSalesValue = (value: number): string => {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  } else if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
};

export default function SalesTrendChart({ data }: SalesTrendChartProps) {
  return (
    <ResponsiveLine
      data={[{
        id: 'sales',
        data: data.map(d => ({ x: d.year, y: d.sales }))
      }]}
      margin={{ top: 20, right: 30, bottom: 50, left: 80 }}
      xScale={{ type: 'point' }}
      yScale={{ type: 'linear', min: 'auto', max: 'auto' }}
      curve="monotoneX"
      axisTop={null}
      axisRight={null}
      axisBottom={{
        tickSize: 0,
        tickPadding: 15,
        tickRotation: 0,
        legend: 'Year',
        legendOffset: 40,
        legendPosition: 'middle'
      }}
      axisLeft={{
        tickSize: 0,
        tickPadding: 15,
        tickRotation: 0,
        legend: 'Revenue',
        legendOffset: -65,
        legendPosition: 'middle',
        format: (value) => formatSalesValue(value as number)
      }}
      enableGridX={false}
      gridYValues={5}
      colors={['#fb923c']}
      lineWidth={5}
      enablePoints={true}
      pointSize={10}
      pointColor="#fbbf24"
      pointBorderWidth={3}
      pointBorderColor="#fb923c"
      enableArea={true}
      areaOpacity={0.2}
      useMesh={true}
      enableSlices="x"
      sliceTooltip={({ slice }) => {
        const point = slice.points[0];
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
              {point.data.xFormatted}
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
              {formatSalesValue(point.data.y as number)}
            </div>
          </div>
        );
      }}
      theme={{
        background: 'transparent',
        textColor: '#94a3b8',
        axis: {
          domain: {
            line: {
              stroke: '#334155',
              strokeWidth: 2
            }
          },
          ticks: {
            line: { stroke: 'transparent' },
            text: {
              fontSize: 11,
              fill: '#94a3b8',
              fontWeight: 600
            }
          },
          legend: {
            text: {
              fontSize: 12,
              fill: '#cbd5e1',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }
          }
        },
        grid: {
          line: {
            stroke: '#334155',
            strokeWidth: 1,
            strokeOpacity: 0.5
          }
        },
        crosshair: {
          line: {
            stroke: '#fb923c',
            strokeWidth: 2,
            strokeOpacity: 0.5
          }
        }
      }}
      defs={[
        {
          id: 'gradientGlow',
          type: 'linearGradient',
          colors: [
            { offset: 0, color: '#fb923c', opacity: 0.4 },
            { offset: 50, color: '#f97316', opacity: 0.2 },
            { offset: 100, color: '#ea580c', opacity: 0 }
          ]
        }
      ]}
      fill={[{ match: '*', id: 'gradientGlow' }]}
    />
  );
}
