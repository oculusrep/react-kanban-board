import React, { useRef, useEffect } from 'react';

interface ChartDataPoint {
  year: string;
  sales: number;
  salesK: number;
}

interface SalesTrendChartProps {
  data: ChartDataPoint[];
  formatSalesValue: (value: number) => string;
}

/**
 * Pure Canvas-based chart component - no d3 or recharts dependencies
 * This avoids bundling conflicts with Google Maps AdvancedMarkerElement
 */
const SalesTrendChart: React.FC<SalesTrendChartProps> = ({ data, formatSalesValue }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || data.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Get device pixel ratio for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();

    // Set canvas size accounting for device pixel ratio
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const padding = { top: 30, right: 30, bottom: 50, left: 80 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Find min/max values
    const values = data.map(d => d.sales);
    const minVal = Math.min(...values) * 0.9;
    const maxVal = Math.max(...values) * 1.1;
    const range = maxVal - minVal;

    // Helper to convert data to canvas coordinates
    const getX = (index: number) => padding.left + (index / (data.length - 1)) * chartWidth;
    const getY = (value: number) => padding.top + chartHeight - ((value - minVal) / range) * chartHeight;

    // Draw gradient fill under the line
    const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
    gradient.addColorStop(0, 'rgba(251, 146, 60, 0.4)');
    gradient.addColorStop(0.5, 'rgba(249, 115, 22, 0.2)');
    gradient.addColorStop(1, 'rgba(234, 88, 12, 0)');

    ctx.beginPath();
    ctx.moveTo(getX(0), height - padding.bottom);
    data.forEach((d, i) => {
      ctx.lineTo(getX(i), getY(d.sales));
    });
    ctx.lineTo(getX(data.length - 1), height - padding.bottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw the line with smooth curves (cardinal spline approximation)
    ctx.beginPath();
    ctx.strokeStyle = '#fb923c';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Simple smooth curve using quadratic bezier
    data.forEach((d, i) => {
      const x = getX(i);
      const y = getY(d.sales);

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        const prevX = getX(i - 1);
        const prevY = getY(data[i - 1].sales);
        const cpX = (prevX + x) / 2;
        ctx.quadraticCurveTo(prevX + (x - prevX) * 0.5, prevY, cpX, (prevY + y) / 2);
        ctx.quadraticCurveTo(cpX, y, x, y);
      }
    });
    ctx.stroke();

    // Draw data points
    data.forEach((d, i) => {
      const x = getX(i);
      const y = getY(d.sales);

      // Outer circle (orange)
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#fb923c';
      ctx.fill();

      // Inner circle (yellow)
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#fbbf24';
      ctx.fill();
    });

    // Draw axes
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;

    // X axis
    ctx.beginPath();
    ctx.moveTo(padding.left, height - padding.bottom);
    ctx.lineTo(width - padding.right, height - padding.bottom);
    ctx.stroke();

    // Y axis
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, height - padding.bottom);
    ctx.stroke();

    // X axis labels (years)
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 11px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    data.forEach((d, i) => {
      ctx.fillText(d.year, getX(i), height - padding.bottom + 20);
    });

    // X axis title
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '700 12px system-ui, -apple-system, sans-serif';
    ctx.fillText('Year', width / 2, height - 10);

    // Y axis labels
    ctx.textAlign = 'right';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 11px system-ui, -apple-system, sans-serif';
    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
      const value = minVal + (range * i / yTicks);
      const y = getY(value);
      ctx.fillText(formatSalesValue(value), padding.left - 10, y + 4);
    }

    // Y axis title
    ctx.save();
    ctx.translate(20, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '700 12px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Revenue', 0, 0);
    ctx.restore();

  }, [data, formatSalesValue]);

  return (
    <div
      ref={containerRef}
      className="relative rounded-3xl overflow-hidden shadow-2xl"
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

      <canvas
        ref={canvasRef}
        className="relative w-full h-full"
        style={{ display: 'block' }}
      />
    </div>
  );
};

export default SalesTrendChart;
