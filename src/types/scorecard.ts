/**
 * Scorecard Types
 *
 * Types for the Master Prospecting Scorecard feature.
 */

// Time periods for scorecard views
export type ScorecardPeriod = 'today' | 'week' | 'month' | 'quarter' | 'year';

// Display modes for the scorecard component
export type ScorecardMode = 'full' | 'compact' | 'embedded';

// Activity counts by type
export interface OutreachCounts {
  emails: number;
  linkedin: number;
  sms: number;
  voicemail: number;
  callConnects: number;  // Call connects count as both outreach AND connection
  total: number;
}

export interface ConnectionCounts {
  calls: number;
  meetings: number;
  emailResponses: number;
  linkedinResponses: number;
  smsResponses: number;
  returnCalls: number;
  total: number;
}

// Period summary data
export interface ScorecardPeriodData {
  period: ScorecardPeriod;
  periodLabel: string;
  startDate: string;
  endDate: string;
  outreach: OutreachCounts;
  connections: ConnectionCounts;
  // Unique contacts touched
  contactsReached: number;
  // Comparison to previous period (percentage change)
  comparison?: {
    outreachChange: number;
    connectionsChange: number;
    conversionRate: number;
    previousConversionRate: number;
  };
}

// Daily metrics row from database view
export interface DailyMetricsRow {
  activity_date: string;
  emails: number;
  linkedin: number;
  sms: number;
  voicemail: number;
  calls: number;
  meetings: number;
  email_responses: number;
  linkedin_responses: number;
  sms_responses: number;
  return_calls: number;
  total_outreach: number;
  total_connections: number;
}

// Trend data point for charts
export interface TrendDataPoint {
  date: string;
  label: string;  // "Mon 2/17" or "Week 7" or "Feb"
  outreach: number;
  connections: number;
  // Individual breakdowns for drill-down
  emails?: number;
  linkedin?: number;
  sms?: number;
  voicemail?: number;
  calls?: number;
  meetings?: number;
  responses?: number;
}

// Chart data for comparison bar chart
export interface PeriodComparisonData {
  period: string;
  periodLabel: string;
  outreach: number;
  connections: number;
  conversionRate: number;
}

// Hook return type
export interface UseScorecardMetricsReturn {
  // Period data
  today: ScorecardPeriodData | null;
  week: ScorecardPeriodData | null;
  month: ScorecardPeriodData | null;
  quarter: ScorecardPeriodData | null;
  year: ScorecardPeriodData | null;

  // All periods for comparison chart
  allPeriods: PeriodComparisonData[];

  // Trend data for charts
  dailyTrend: TrendDataPoint[];   // Last 30 days
  weeklyTrend: TrendDataPoint[];  // Last 12 weeks

  // State
  loading: boolean;
  error: string | null;

  // Actions
  refresh: () => Promise<void>;
}

// Component props
export interface MasterScorecardProps {
  // Display mode
  mode?: ScorecardMode;
  // For Coach Dashboard - prevents interactions
  readOnly?: boolean;
  // Initial period to show
  defaultPeriod?: ScorecardPeriod;
  // Filter to specific user (for coach viewing rep)
  userId?: string;
  // Custom class name
  className?: string;
}

// Summary card props
export interface ScorecardSummaryCardProps {
  period: ScorecardPeriod;
  label: string;
  outreach: number;
  connections: number;
  change?: number;  // Percentage change from previous period
  sparklineData?: number[];
  isActive?: boolean;
  onClick?: () => void;
}

// Chart props
export interface OutreachConnectionsChartProps {
  data: PeriodComparisonData[];
  height?: number;
}

export interface ActivityTrendChartProps {
  data: TrendDataPoint[];
  height?: number;
  showLegend?: boolean;
}
