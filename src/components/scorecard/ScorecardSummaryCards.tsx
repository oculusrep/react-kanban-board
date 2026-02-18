/**
 * Scorecard Summary Cards
 *
 * Row of period summary cards (Today, Week, Month, Quarter, Year)
 * with outreach/connections totals and change indicators.
 */

import { ArrowTrendingUpIcon, ArrowTrendingDownIcon } from '@heroicons/react/24/solid';
import { ScorecardPeriod, ScorecardPeriodData } from '../../types/scorecard';

interface ScorecardSummaryCardsProps {
  today: ScorecardPeriodData | null;
  week: ScorecardPeriodData | null;
  month: ScorecardPeriodData | null;
  quarter: ScorecardPeriodData | null;
  year: ScorecardPeriodData | null;
  selectedPeriod: ScorecardPeriod;
  onSelectPeriod?: (period: ScorecardPeriod) => void;
  compact?: boolean;
}

interface SummaryCardProps {
  period: ScorecardPeriod;
  label: string;
  data: ScorecardPeriodData | null;
  isSelected: boolean;
  onClick?: () => void;
  compact?: boolean;
}

function SummaryCard({ period, label, data, isSelected, onClick, compact }: SummaryCardProps) {
  const outreach = data?.outreach.total ?? 0;
  const connections = data?.connections.total ?? 0;
  const change = data?.comparison?.outreachChange;

  if (compact) {
    return (
      <button
        onClick={onClick}
        disabled={!onClick}
        className={`
          flex-1 min-w-0 p-3 rounded-lg border transition-all
          ${isSelected
            ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
            : 'border-gray-200 bg-white hover:border-gray-300'}
          ${!onClick ? 'cursor-default' : 'cursor-pointer'}
        `}
      >
        <div className="text-xs font-medium text-gray-500 truncate">{label}</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-lg font-bold text-blue-600">{outreach}</span>
          <span className="text-gray-400">/</span>
          <span className="text-lg font-bold text-green-600">{connections}</span>
        </div>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`
        flex-1 min-w-0 p-4 rounded-xl border transition-all
        ${isSelected
          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/20'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'}
        ${!onClick ? 'cursor-default' : 'cursor-pointer'}
      `}
    >
      <div className="text-sm font-medium text-gray-500">{label}</div>

      <div className="mt-3 space-y-2">
        {/* Outreach */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400 uppercase tracking-wide">Outreach</span>
          <span className="text-xl font-bold text-blue-600">{outreach}</span>
        </div>

        {/* Connections */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400 uppercase tracking-wide">Connections</span>
          <span className="text-xl font-bold text-green-600">{connections}</span>
        </div>
      </div>

      {/* Change indicator */}
      {typeof change === 'number' && change !== 0 && (
        <div className={`
          mt-3 pt-3 border-t border-gray-100 flex items-center justify-center gap-1 text-sm
          ${change > 0 ? 'text-green-600' : 'text-red-600'}
        `}>
          {change > 0 ? (
            <ArrowTrendingUpIcon className="w-4 h-4" />
          ) : (
            <ArrowTrendingDownIcon className="w-4 h-4" />
          )}
          <span className="font-medium">
            {change > 0 ? '+' : ''}{change.toFixed(0)}%
          </span>
          <span className="text-gray-400 text-xs">vs prev</span>
        </div>
      )}
    </button>
  );
}

export default function ScorecardSummaryCards({
  today,
  week,
  month,
  quarter,
  year,
  selectedPeriod,
  onSelectPeriod,
  compact = false
}: ScorecardSummaryCardsProps) {
  const periods: { period: ScorecardPeriod; label: string; data: ScorecardPeriodData | null }[] = [
    { period: 'today', label: 'Today', data: today },
    { period: 'week', label: 'This Week', data: week },
    { period: 'month', label: 'This Month', data: month },
    { period: 'quarter', label: 'This Quarter', data: quarter },
    { period: 'year', label: 'This Year', data: year }
  ];

  return (
    <div className={`flex gap-${compact ? '2' : '4'} overflow-x-auto`}>
      {periods.map(({ period, label, data }) => (
        <SummaryCard
          key={period}
          period={period}
          label={label}
          data={data}
          isSelected={selectedPeriod === period}
          onClick={onSelectPeriod ? () => onSelectPeriod(period) : undefined}
          compact={compact}
        />
      ))}
    </div>
  );
}
