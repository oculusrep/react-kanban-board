/**
 * Deal Forecasting Service
 *
 * Handles payment date estimation based on deal velocity and timeline data.
 * Used by the ForecastingSection component and can be called from backend.
 */

import { supabase } from '../lib/supabaseClient';

// Types
export interface ForecastingSettings {
  velocity_loi_days_default: number;
  velocity_lease_psa_days_default: number;
  default_rent_commencement_days: number;
  default_closing_deadline_days: number;
  velocity_min_deals_for_historical: number;
  behind_schedule_threshold_days: number;
}

export interface ClientVelocity {
  avg_loi_duration_days: number | null;
  avg_lease_psa_duration_days: number | null;
  closed_deals_count: number;
  velocity_loi_days_override: number | null;
  velocity_lease_psa_days_override: number | null;
}

export interface DealForecastData {
  deal_type: 'Lease' | 'Purchase' | null;
  stage_label: string | null;
  loi_date: string | null;
  loi_signed_date: string | null;
  contract_signed_date: string | null;
  contingency_period_days: number | null;
  rent_commencement_days: number | null;
  due_diligence_days: number | null;
  closing_deadline_days: number | null;
  estimated_execution_date: string | null; // Broker override
  created_at: string;
  last_stage_change_at: string | null;
}

export interface PaymentEstimate {
  paymentNumber: number;
  estimatedDate: string;
  source: 'auto' | 'broker_override' | 'critical_date';
  description: string;
}

export interface ForecastResult {
  estimatedExecutionDate: string | null;
  executionDateSource: 'calculated' | 'broker_override';
  payments: PaymentEstimate[];
  isBehindSchedule: boolean;
  weeksBehind: number;
  daysInCurrentStage: number;
  expectedDaysInStage: number;
}

// Default settings fallback
const DEFAULT_SETTINGS: ForecastingSettings = {
  velocity_loi_days_default: 30,
  velocity_lease_psa_days_default: 45,
  default_rent_commencement_days: 180,
  default_closing_deadline_days: 30,
  velocity_min_deals_for_historical: 5,
  behind_schedule_threshold_days: 7,
};

// Cache for settings (refreshed every 5 minutes)
let cachedSettings: ForecastingSettings | null = null;
let settingsCacheTime: number = 0;
const SETTINGS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch global forecasting settings from app_settings table
 */
export async function getGlobalSettings(): Promise<ForecastingSettings> {
  const now = Date.now();

  // Return cached if still valid
  if (cachedSettings && (now - settingsCacheTime) < SETTINGS_CACHE_TTL) {
    return cachedSettings;
  }

  try {
    const settingKeys = Object.keys(DEFAULT_SETTINGS);

    const { data, error } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', settingKeys);

    if (error) {
      console.error('Error fetching forecast settings:', error);
      return DEFAULT_SETTINGS;
    }

    const settings: ForecastingSettings = { ...DEFAULT_SETTINGS };

    if (data) {
      data.forEach(row => {
        const key = row.key as keyof ForecastingSettings;
        if (key in settings) {
          try {
            const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
            settings[key] = typeof parsed === 'number' ? parsed : DEFAULT_SETTINGS[key];
          } catch {
            // Keep default
          }
        }
      });
    }

    cachedSettings = settings;
    settingsCacheTime = now;

    return settings;
  } catch (err) {
    console.error('Error fetching forecast settings:', err);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Get effective velocity for a stage based on priority:
 * 1. Historical data (if 5+ closed deals)
 * 2. Client override
 * 3. Global default
 */
export function getEffectiveVelocity(
  stage: 'loi' | 'lease_psa',
  clientVelocity: ClientVelocity | null,
  settings: ForecastingSettings
): number {
  const minDeals = settings.velocity_min_deals_for_historical;

  if (stage === 'loi') {
    // Priority 1: Historical data
    if (clientVelocity &&
        clientVelocity.closed_deals_count >= minDeals &&
        clientVelocity.avg_loi_duration_days !== null) {
      return Math.round(clientVelocity.avg_loi_duration_days);
    }
    // Priority 2: Client override
    if (clientVelocity?.velocity_loi_days_override !== null) {
      return clientVelocity.velocity_loi_days_override;
    }
    // Priority 3: Global default
    return settings.velocity_loi_days_default;
  } else {
    // Priority 1: Historical data
    if (clientVelocity &&
        clientVelocity.closed_deals_count >= minDeals &&
        clientVelocity.avg_lease_psa_duration_days !== null) {
      return Math.round(clientVelocity.avg_lease_psa_duration_days);
    }
    // Priority 2: Client override
    if (clientVelocity?.velocity_lease_psa_days_override !== null) {
      return clientVelocity.velocity_lease_psa_days_override;
    }
    // Priority 3: Global default
    return settings.velocity_lease_psa_days_default;
  }
}

/**
 * Add days to a date string, returning a new date string (YYYY-MM-DD)
 */
function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

/**
 * Calculate days between today and a date
 */
function daysSince(dateStr: string): number {
  const date = new Date(dateStr);
  const today = new Date();
  const diffTime = today.getTime() - date.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Get today's date as YYYY-MM-DD in local timezone
 */
function getLocalToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * Calculate estimated execution date based on deal stage and velocity
 */
export function calculateEstimatedExecutionDate(
  deal: DealForecastData,
  clientVelocity: ClientVelocity | null,
  settings: ForecastingSettings
): { date: string; source: 'calculated' | 'broker_override' } {
  // If broker has overridden, use that
  if (deal.estimated_execution_date) {
    return { date: deal.estimated_execution_date, source: 'broker_override' };
  }

  const loiVelocity = getEffectiveVelocity('loi', clientVelocity, settings);
  const psaVelocity = getEffectiveVelocity('lease_psa', clientVelocity, settings);

  // Determine anchor date and remaining stages based on current stage
  const stageLabel = deal.stage_label?.toLowerCase() || '';

  // Under Contract/Contingent or later - use contract_signed_date if available
  if (stageLabel.includes('under contract') ||
      stageLabel.includes('contingent') ||
      stageLabel === 'booked' ||
      stageLabel === 'executed payable' ||
      stageLabel === 'closed paid') {
    if (deal.contract_signed_date) {
      return { date: deal.contract_signed_date, source: 'calculated' };
    }
    // Fall through to earlier stages
  }

  // At Lease/PSA - use loi_signed_date + PSA velocity
  if (stageLabel.includes('lease') || stageLabel.includes('psa')) {
    if (deal.loi_signed_date) {
      const estimated = addDays(deal.loi_signed_date, psaVelocity);
      return { date: estimated, source: 'calculated' };
    }
    // Fall through to LOI stage calculation
  }

  // Negotiating LOI or earlier - use loi_date + LOI velocity + PSA velocity
  const startDate = deal.loi_date || deal.created_at.split('T')[0];
  const estimated = addDays(startDate, loiVelocity + psaVelocity);
  return { date: estimated, source: 'calculated' };
}

/**
 * Calculate payment estimates for a deal
 */
export function calculatePaymentEstimates(
  deal: DealForecastData,
  executionDate: string,
  settings: ForecastingSettings
): PaymentEstimate[] {
  const payments: PaymentEstimate[] = [];

  if (deal.deal_type === 'Lease') {
    // Lease deals have 2 payments

    // Payment 1: Execution + Contingency Period
    const contingencyDays = deal.contingency_period_days ?? 0;
    const payment1Date = contingencyDays > 0
      ? addDays(executionDate, contingencyDays)
      : executionDate;

    payments.push({
      paymentNumber: 1,
      estimatedDate: payment1Date,
      source: 'auto',
      description: contingencyDays > 0
        ? `Execution + ${contingencyDays} day contingency`
        : 'At execution',
    });

    // Payment 2: Execution + Contingency + Rent Commencement
    const rentCommencementDays = deal.rent_commencement_days ?? settings.default_rent_commencement_days;
    const payment2Date = addDays(executionDate, contingencyDays + rentCommencementDays);

    payments.push({
      paymentNumber: 2,
      estimatedDate: payment2Date,
      source: 'auto',
      description: `Rent commencement (+${rentCommencementDays} days)`,
    });
  } else if (deal.deal_type === 'Purchase') {
    // Purchase deals have 1 payment

    // Payment: Execution + Due Diligence + Closing Deadline
    const dueDiligenceDays = deal.due_diligence_days ?? 0;
    const closingDeadlineDays = deal.closing_deadline_days ?? settings.default_closing_deadline_days;
    const paymentDate = addDays(executionDate, dueDiligenceDays + closingDeadlineDays);

    payments.push({
      paymentNumber: 1,
      estimatedDate: paymentDate,
      source: 'auto',
      description: dueDiligenceDays > 0
        ? `Due diligence (${dueDiligenceDays}d) + closing (${closingDeadlineDays}d)`
        : `Closing deadline (+${closingDeadlineDays} days)`,
    });
  }

  return payments;
}

/**
 * Check if deal is behind schedule and calculate weeks behind
 */
export function checkBehindSchedule(
  deal: DealForecastData,
  clientVelocity: ClientVelocity | null,
  settings: ForecastingSettings
): { isBehindSchedule: boolean; weeksBehind: number; daysInStage: number; expectedDays: number } {
  const stageLabel = deal.stage_label?.toLowerCase() || '';

  // Only check for LOI and At Lease/PSA stages
  let expectedDays = 0;
  if (stageLabel.includes('negotiating') || stageLabel === 'loi') {
    expectedDays = getEffectiveVelocity('loi', clientVelocity, settings);
  } else if (stageLabel.includes('lease') || stageLabel.includes('psa')) {
    expectedDays = getEffectiveVelocity('lease_psa', clientVelocity, settings);
  } else {
    // Other stages don't have velocity-based behind schedule detection
    return { isBehindSchedule: false, weeksBehind: 0, daysInStage: 0, expectedDays: 0 };
  }

  // Calculate days in current stage
  const stageStartDate = deal.last_stage_change_at || deal.created_at;
  const daysInStage = daysSince(stageStartDate.split('T')[0]);

  // Check if behind schedule
  const overage = daysInStage - expectedDays;
  const threshold = settings.behind_schedule_threshold_days;

  if (overage >= threshold) {
    const weeksBehind = Math.floor(overage / 7);
    return {
      isBehindSchedule: true,
      weeksBehind: Math.max(1, weeksBehind),
      daysInStage,
      expectedDays,
    };
  }

  return { isBehindSchedule: false, weeksBehind: 0, daysInStage, expectedDays };
}

/**
 * Push payment estimates forward when deal is behind schedule
 */
export function adjustForBehindSchedule(
  payments: PaymentEstimate[],
  weeksBehind: number
): PaymentEstimate[] {
  if (weeksBehind <= 0) return payments;

  const daysToAdd = weeksBehind * 7;

  return payments.map(payment => ({
    ...payment,
    estimatedDate: addDays(payment.estimatedDate, daysToAdd),
    description: `${payment.description} (+${weeksBehind}w behind)`,
  }));
}

/**
 * Full forecast calculation for a deal
 */
export async function calculateDealForecast(
  deal: DealForecastData,
  clientId: string | null
): Promise<ForecastResult> {
  // Get global settings
  const settings = await getGlobalSettings();

  // Get client velocity data if we have a client
  let clientVelocity: ClientVelocity | null = null;

  if (clientId) {
    try {
      // Fetch client overrides
      const { data: clientData } = await supabase
        .from('client')
        .select('velocity_loi_days_override, velocity_lease_psa_days_override')
        .eq('id', clientId)
        .single();

      // Fetch historical velocity stats
      const { data: statsData } = await supabase
        .from('client_velocity_stats')
        .select('*')
        .eq('client_id', clientId)
        .single();

      if (clientData || statsData) {
        clientVelocity = {
          avg_loi_duration_days: statsData?.avg_loi_duration_days ?? null,
          avg_lease_psa_duration_days: statsData?.avg_lease_psa_duration_days ?? null,
          closed_deals_count: statsData?.closed_deals_count ?? 0,
          velocity_loi_days_override: clientData?.velocity_loi_days_override ?? null,
          velocity_lease_psa_days_override: clientData?.velocity_lease_psa_days_override ?? null,
        };
      }
    } catch (err) {
      console.error('Error fetching client velocity:', err);
    }
  }

  // Calculate execution date
  const { date: executionDate, source: executionSource } =
    calculateEstimatedExecutionDate(deal, clientVelocity, settings);

  // Calculate behind schedule status
  const behindStatus = checkBehindSchedule(deal, clientVelocity, settings);

  // Calculate payment estimates
  let payments = calculatePaymentEstimates(deal, executionDate, settings);

  // Adjust for behind schedule if needed
  if (behindStatus.isBehindSchedule) {
    payments = adjustForBehindSchedule(payments, behindStatus.weeksBehind);
  }

  return {
    estimatedExecutionDate: executionDate,
    executionDateSource: executionSource,
    payments,
    isBehindSchedule: behindStatus.isBehindSchedule,
    weeksBehind: behindStatus.weeksBehind,
    daysInCurrentStage: behindStatus.daysInStage,
    expectedDaysInStage: behindStatus.expectedDays,
  };
}

/**
 * Save forecast results back to the database
 */
export async function saveForecastToDatabase(
  dealId: string,
  forecast: ForecastResult
): Promise<void> {
  try {
    // Update deal with behind schedule status
    await supabase
      .from('deal')
      .update({
        is_behind_schedule: forecast.isBehindSchedule,
        weeks_behind: forecast.weeksBehind,
        estimated_execution_date: forecast.estimatedExecutionDate,
        updated_at: new Date().toISOString(),
      })
      .eq('id', dealId);

    // Update payment estimated dates
    // This would need the actual payment IDs to work properly
    // For now, we'll just update the deal-level forecasting fields

  } catch (err) {
    console.error('Error saving forecast to database:', err);
    throw err;
  }
}
