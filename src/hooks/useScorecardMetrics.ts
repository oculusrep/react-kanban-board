/**
 * Hook for loading and aggregating Master Scorecard metrics
 * src/hooks/useScorecardMetrics.ts
 */

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  ScorecardPeriod,
  ScorecardPeriodData,
  DailyMetricsRow,
  TrendDataPoint,
  PeriodComparisonData,
  UseScorecardMetricsReturn,
  OutreachCounts,
  ConnectionCounts
} from '../types/scorecard';

// Helper to get date range for a period
function getPeriodDateRange(period: ScorecardPeriod): { start: Date; end: Date; previousStart: Date; previousEnd: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let start: Date;
  let end: Date;
  let previousStart: Date;
  let previousEnd: Date;

  switch (period) {
    case 'today':
      start = today;
      end = today;
      previousStart = new Date(today);
      previousStart.setDate(previousStart.getDate() - 1);
      previousEnd = previousStart;
      break;

    case 'week':
      // Week starts on Monday
      const dayOfWeek = today.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      start = new Date(today);
      start.setDate(today.getDate() + mondayOffset);
      end = today;
      // Previous week
      previousStart = new Date(start);
      previousStart.setDate(previousStart.getDate() - 7);
      previousEnd = new Date(start);
      previousEnd.setDate(previousEnd.getDate() - 1);
      break;

    case 'month':
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      end = today;
      // Previous month (same day range)
      previousStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const daysIntoMonth = today.getDate();
      previousEnd = new Date(previousStart);
      previousEnd.setDate(Math.min(daysIntoMonth, new Date(today.getFullYear(), today.getMonth(), 0).getDate()));
      break;

    case 'quarter':
      const currentQuarter = Math.floor(today.getMonth() / 3);
      start = new Date(today.getFullYear(), currentQuarter * 3, 1);
      end = today;
      // Previous quarter (same day range)
      previousStart = new Date(today.getFullYear(), (currentQuarter - 1) * 3, 1);
      if (currentQuarter === 0) {
        previousStart = new Date(today.getFullYear() - 1, 9, 1); // Q4 of previous year
      }
      const daysIntoQuarter = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      previousEnd = new Date(previousStart);
      previousEnd.setDate(previousEnd.getDate() + daysIntoQuarter);
      break;

    case 'year':
      start = new Date(today.getFullYear(), 0, 1);
      end = today;
      // Previous year (same day range)
      previousStart = new Date(today.getFullYear() - 1, 0, 1);
      const dayOfYear = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      previousEnd = new Date(previousStart);
      previousEnd.setDate(previousEnd.getDate() + dayOfYear);
      break;
  }

  return { start, end, previousStart, previousEnd };
}

// Helper to format date as YYYY-MM-DD
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

// Helper to get period label
function getPeriodLabel(period: ScorecardPeriod): string {
  const now = new Date();
  switch (period) {
    case 'today':
      return 'Today';
    case 'week':
      return 'This Week';
    case 'month':
      return now.toLocaleDateString('en-US', { month: 'long' });
    case 'quarter':
      const quarter = Math.floor(now.getMonth() / 3) + 1;
      return `Q${quarter} ${now.getFullYear()}`;
    case 'year':
      return now.getFullYear().toString();
  }
}

// Aggregate raw metrics into totals
function aggregateMetrics(rows: DailyMetricsRow[]): { outreach: OutreachCounts; connections: ConnectionCounts; contactsReached: number } {
  const outreach: OutreachCounts = { emails: 0, linkedin: 0, sms: 0, voicemail: 0, total: 0 };
  const connections: ConnectionCounts = {
    calls: 0,
    meetings: 0,
    emailResponses: 0,
    linkedinResponses: 0,
    smsResponses: 0,
    returnCalls: 0,
    total: 0
  };
  let contactsReached = 0;

  for (const row of rows) {
    outreach.emails += row.emails || 0;
    outreach.linkedin += row.linkedin || 0;
    outreach.sms += row.sms || 0;
    outreach.voicemail += row.voicemail || 0;

    connections.calls += row.calls || 0;
    connections.meetings += row.meetings || 0;
    connections.emailResponses += row.email_responses || 0;
    connections.linkedinResponses += row.linkedin_responses || 0;
    connections.smsResponses += row.sms_responses || 0;
    connections.returnCalls += row.return_calls || 0;

    contactsReached += row.total_outreach || 0; // Use total_outreach as proxy
  }

  outreach.total = outreach.emails + outreach.linkedin + outreach.sms + outreach.voicemail;
  connections.total = connections.calls + connections.meetings +
    connections.emailResponses + connections.linkedinResponses +
    connections.smsResponses + connections.returnCalls;

  return { outreach, connections, contactsReached };
}

// Calculate period data with comparison
function calculatePeriodData(
  period: ScorecardPeriod,
  currentRows: DailyMetricsRow[],
  previousRows: DailyMetricsRow[]
): ScorecardPeriodData {
  const { start, end } = getPeriodDateRange(period);
  const current = aggregateMetrics(currentRows);
  const previous = aggregateMetrics(previousRows);

  // Calculate changes
  const outreachChange = previous.outreach.total > 0
    ? ((current.outreach.total - previous.outreach.total) / previous.outreach.total) * 100
    : current.outreach.total > 0 ? 100 : 0;

  const connectionsChange = previous.connections.total > 0
    ? ((current.connections.total - previous.connections.total) / previous.connections.total) * 100
    : current.connections.total > 0 ? 100 : 0;

  const conversionRate = current.outreach.total > 0
    ? (current.connections.total / current.outreach.total) * 100
    : 0;

  const previousConversionRate = previous.outreach.total > 0
    ? (previous.connections.total / previous.outreach.total) * 100
    : 0;

  return {
    period,
    periodLabel: getPeriodLabel(period),
    startDate: formatDate(start),
    endDate: formatDate(end),
    outreach: current.outreach,
    connections: current.connections,
    contactsReached: current.contactsReached,
    comparison: {
      outreachChange,
      connectionsChange,
      conversionRate,
      previousConversionRate
    }
  };
}

// Generate trend labels
function getTrendLabel(date: Date, period: 'daily' | 'weekly'): string {
  if (period === 'daily') {
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
  }
  // Weekly: "Week N"
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((date.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
  return `Week ${weekNum}`;
}

export const useScorecardMetrics = (userId?: string): UseScorecardMetricsReturn => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Period data
  const [today, setToday] = useState<ScorecardPeriodData | null>(null);
  const [week, setWeek] = useState<ScorecardPeriodData | null>(null);
  const [month, setMonth] = useState<ScorecardPeriodData | null>(null);
  const [quarter, setQuarter] = useState<ScorecardPeriodData | null>(null);
  const [year, setYear] = useState<ScorecardPeriodData | null>(null);

  // Comparison data
  const [allPeriods, setAllPeriods] = useState<PeriodComparisonData[]>([]);

  // Trend data
  const [dailyTrend, setDailyTrend] = useState<TrendDataPoint[]>([]);
  const [weeklyTrend, setWeeklyTrend] = useState<TrendDataPoint[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Determine date range - fetch all data for the year to enable all calculations
      const now = new Date();
      const yearStart = new Date(now.getFullYear(), 0, 1);
      const previousYearStart = new Date(now.getFullYear() - 1, 0, 1);

      // Build query
      let query = supabase
        .from('v_prospecting_daily_metrics')
        .select('*')
        .gte('activity_date', formatDate(previousYearStart))
        .lte('activity_date', formatDate(now))
        .order('activity_date', { ascending: true });

      // Filter by user if specified
      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data: rawData, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      const metrics = (rawData || []) as DailyMetricsRow[];

      // Process each period
      const periods: ScorecardPeriod[] = ['today', 'week', 'month', 'quarter', 'year'];

      for (const period of periods) {
        const { start, end, previousStart, previousEnd } = getPeriodDateRange(period);

        const currentRows = metrics.filter(m => {
          const d = new Date(m.activity_date);
          return d >= start && d <= end;
        });

        const previousRows = metrics.filter(m => {
          const d = new Date(m.activity_date);
          return d >= previousStart && d <= previousEnd;
        });

        const periodData = calculatePeriodData(period, currentRows, previousRows);

        switch (period) {
          case 'today': setToday(periodData); break;
          case 'week': setWeek(periodData); break;
          case 'month': setMonth(periodData); break;
          case 'quarter': setQuarter(periodData); break;
          case 'year': setYear(periodData); break;
        }
      }

      // Build comparison data for chart
      const comparisonData: PeriodComparisonData[] = [];
      for (const period of periods) {
        const { start, end } = getPeriodDateRange(period);
        const rows = metrics.filter(m => {
          const d = new Date(m.activity_date);
          return d >= start && d <= end;
        });
        const agg = aggregateMetrics(rows);

        comparisonData.push({
          period,
          periodLabel: getPeriodLabel(period),
          outreach: agg.outreach.total,
          connections: agg.connections.total,
          conversionRate: agg.outreach.total > 0 ? (agg.connections.total / agg.outreach.total) * 100 : 0
        });
      }
      setAllPeriods(comparisonData);

      // Build daily trend (last 30 days)
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);

      const dailyTrendData: TrendDataPoint[] = [];
      for (let d = new Date(thirtyDaysAgo); d <= now; d.setDate(d.getDate() + 1)) {
        const dateStr = formatDate(d);
        const dayRows = metrics.filter(m => m.activity_date === dateStr);
        const agg = aggregateMetrics(dayRows);

        dailyTrendData.push({
          date: dateStr,
          label: getTrendLabel(new Date(d), 'daily'),
          outreach: agg.outreach.total,
          connections: agg.connections.total,
          emails: agg.outreach.emails,
          linkedin: agg.outreach.linkedin,
          sms: agg.outreach.sms,
          voicemail: agg.outreach.voicemail,
          calls: agg.connections.calls,
          meetings: agg.connections.meetings,
          responses: agg.connections.emailResponses + agg.connections.linkedinResponses +
            agg.connections.smsResponses + agg.connections.returnCalls
        });
      }
      setDailyTrend(dailyTrendData);

      // Build weekly trend (last 12 weeks)
      const weeklyTrendData: TrendDataPoint[] = [];
      for (let w = 11; w >= 0; w--) {
        const weekEnd = new Date(now);
        weekEnd.setDate(weekEnd.getDate() - (w * 7));
        const weekStart = new Date(weekEnd);
        weekStart.setDate(weekStart.getDate() - 6);

        const weekRows = metrics.filter(m => {
          const d = new Date(m.activity_date);
          return d >= weekStart && d <= weekEnd;
        });
        const agg = aggregateMetrics(weekRows);

        weeklyTrendData.push({
          date: formatDate(weekStart),
          label: getTrendLabel(weekStart, 'weekly'),
          outreach: agg.outreach.total,
          connections: agg.connections.total,
          emails: agg.outreach.emails,
          linkedin: agg.outreach.linkedin,
          sms: agg.outreach.sms,
          voicemail: agg.outreach.voicemail,
          calls: agg.connections.calls,
          meetings: agg.connections.meetings,
          responses: agg.connections.emailResponses + agg.connections.linkedinResponses +
            agg.connections.smsResponses + agg.connections.returnCalls
        });
      }
      setWeeklyTrend(weeklyTrendData);

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load scorecard metrics';
      setError(message);
      console.error('Error loading scorecard metrics:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Load on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    today,
    week,
    month,
    quarter,
    year,
    allPeriods,
    dailyTrend,
    weeklyTrend,
    loading,
    error,
    refresh
  };
};
