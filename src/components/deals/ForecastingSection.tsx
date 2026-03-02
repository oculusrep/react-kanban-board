import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabaseClient';
import DatePicker from 'react-datepicker';
import { parseISO, format as formatDateFn, addDays } from 'date-fns';
import 'react-datepicker/dist/react-datepicker.css';

interface ForecastingSectionProps {
  dealId?: string;
  isNewDeal: boolean;
  transactionTypeLabel?: string; // 'Lease' or 'Purchase' or null
  clientId: string | null;
  stageLabel: string;
  // Timeline anchor dates
  loiDate: string | null;
  loiSignedDate: string | null;
  contractSignedDate: string | null;
  lastStageChangeAt: string | null;
  createdAt: string | null;
  // Forecasting fields
  contingencyPeriodDays: number | null;
  rentCommencementDays: number | null;
  dueDiligenceDays: number | null;
  closingDeadlineDays: number | null;
  estimatedExecutionDate: string | null;
  // Behind schedule status (read-only display)
  isBehindSchedule: boolean;
  weeksBehind: number;
  // Callbacks
  onChange: (field: string, value: any) => void;
  // Collapsed state
  defaultCollapsed?: boolean;
}

interface VelocityDefaults {
  loi_days: number;
  psa_days: number;
  rent_commencement_days: number;
  closing_deadline_days: number;
}

interface PaymentEstimate {
  sequence: number;
  estimatedDate: Date | null;
  notes: string;
}

interface PaymentRecord {
  id: string;
  payment_sequence: number;
  payment_date_estimated: string | null;
  payment_date_auto_calculated: string | null;
  payment_date_source: string | null;
}

export default function ForecastingSection({
  dealId,
  isNewDeal,
  transactionTypeLabel,
  clientId,
  stageLabel,
  loiDate,
  loiSignedDate,
  contractSignedDate,
  lastStageChangeAt,
  createdAt,
  contingencyPeriodDays,
  rentCommencementDays,
  dueDiligenceDays,
  closingDeadlineDays,
  estimatedExecutionDate,
  isBehindSchedule,
  weeksBehind,
  onChange,
  defaultCollapsed = true,
}: ForecastingSectionProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [defaults, setDefaults] = useState<VelocityDefaults>({
    loi_days: 30,
    psa_days: 45,
    rent_commencement_days: 180,
    closing_deadline_days: 30,
  });
  const [clientVelocity, setClientVelocity] = useState<{
    loi_avg_days: number | null;
    psa_avg_days: number | null;
    loi_deal_count: number;
    psa_deal_count: number;
  } | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [savingPaymentId, setSavingPaymentId] = useState<string | null>(null);

  // Determine if this is a lease or purchase deal
  const isPurchase = transactionTypeLabel?.toLowerCase().includes('purchase') ||
                     transactionTypeLabel?.toLowerCase().includes('sale');
  const isLease = !isPurchase;

  // Fetch global defaults from app_settings
  useEffect(() => {
    const fetchDefaults = async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', [
          'velocity_loi_days_default',
          'velocity_lease_psa_days_default',
          'default_rent_commencement_days',
          'default_closing_deadline_days',
        ]);

      if (data) {
        const settings: VelocityDefaults = { ...defaults };
        data.forEach((row) => {
          if (row.key === 'velocity_loi_days_default') settings.loi_days = parseInt(row.value) || 30;
          if (row.key === 'velocity_lease_psa_days_default') settings.psa_days = parseInt(row.value) || 45;
          if (row.key === 'default_rent_commencement_days') settings.rent_commencement_days = parseInt(row.value) || 180;
          if (row.key === 'default_closing_deadline_days') settings.closing_deadline_days = parseInt(row.value) || 30;
        });
        setDefaults(settings);
      }
    };

    fetchDefaults();
  }, []);

  // Fetch client velocity stats if we have a client
  useEffect(() => {
    if (!clientId) {
      setClientVelocity(null);
      return;
    }

    const fetchClientVelocity = async () => {
      const { data } = await supabase
        .from('client_velocity_stats')
        .select('loi_avg_days, lease_psa_avg_days, loi_deal_count, lease_psa_deal_count')
        .eq('client_id', clientId)
        .single();

      if (data) {
        setClientVelocity({
          loi_avg_days: data.loi_avg_days,
          psa_avg_days: data.lease_psa_avg_days,
          loi_deal_count: data.loi_deal_count,
          psa_deal_count: data.lease_psa_deal_count,
        });
      }
    };

    fetchClientVelocity();
  }, [clientId]);

  // Fetch payments for this deal
  useEffect(() => {
    if (!dealId || isNewDeal) {
      setPayments([]);
      return;
    }

    const fetchPayments = async () => {
      const { data } = await supabase
        .from('payment')
        .select('id, payment_sequence, payment_date_estimated, payment_date_auto_calculated, payment_date_source')
        .eq('deal_id', dealId)
        .eq('is_active', true)
        .order('payment_sequence');

      if (data) {
        setPayments(data);
      }
    };

    fetchPayments();
  }, [dealId, isNewDeal]);

  // Handle payment date override
  const handlePaymentDateOverride = async (paymentId: string, newDate: Date | null) => {
    setSavingPaymentId(paymentId);

    const updateData: any = {
      payment_date_estimated: newDate ? formatDateFn(newDate, 'yyyy-MM-dd') : null,
      payment_date_source: newDate ? 'broker_override' : 'auto',
    };

    const { error } = await supabase
      .from('payment')
      .update(updateData)
      .eq('id', paymentId);

    if (!error) {
      // Update local state
      setPayments(prev => prev.map(p =>
        p.id === paymentId
          ? { ...p, payment_date_estimated: updateData.payment_date_estimated, payment_date_source: updateData.payment_date_source }
          : p
      ));
    }

    setSavingPaymentId(null);
  };

  // Reset a payment date to auto-calculated
  const handleResetToAuto = async (paymentId: string) => {
    const payment = payments.find(p => p.id === paymentId);
    if (!payment) return;

    setSavingPaymentId(paymentId);

    const { error } = await supabase
      .from('payment')
      .update({
        payment_date_estimated: payment.payment_date_auto_calculated,
        payment_date_source: 'auto',
      })
      .eq('id', paymentId);

    if (!error) {
      setPayments(prev => prev.map(p =>
        p.id === paymentId
          ? { ...p, payment_date_estimated: payment.payment_date_auto_calculated, payment_date_source: 'auto' }
          : p
      ));
    }

    setSavingPaymentId(null);
  };

  // Get effective velocity for a stage (uses priority: historical > client override > global default)
  const getEffectiveVelocity = (stage: 'loi' | 'psa'): number => {
    const minDeals = 5; // Should come from app_settings but hardcoded for now

    if (stage === 'loi') {
      if (clientVelocity && clientVelocity.loi_deal_count >= minDeals && clientVelocity.loi_avg_days) {
        return Math.round(clientVelocity.loi_avg_days);
      }
      return defaults.loi_days;
    } else {
      if (clientVelocity && clientVelocity.psa_deal_count >= minDeals && clientVelocity.psa_avg_days) {
        return Math.round(clientVelocity.psa_avg_days);
      }
      return defaults.psa_days;
    }
  };

  // Calculate estimated execution date based on current stage and anchor dates
  const calculatedExecutionDate = useMemo((): Date | null => {
    const loiVelocity = getEffectiveVelocity('loi');
    const psaVelocity = getEffectiveVelocity('psa');

    let anchorDate: Date | null = null;
    let daysToAdd = 0;

    if (stageLabel === 'Negotiating LOI') {
      // Anchor: LOI date or created_at
      const anchor = loiDate || createdAt;
      if (anchor) {
        anchorDate = parseISO(anchor);
        daysToAdd = loiVelocity + psaVelocity;
      }
    } else if (stageLabel === 'At Lease / PSA' || stageLabel === 'At Lease/PSA') {
      // Anchor: LOI signed date or last stage change
      const anchor = loiSignedDate || lastStageChangeAt || createdAt;
      if (anchor) {
        anchorDate = parseISO(anchor);
        daysToAdd = psaVelocity;
      }
    } else if (['Under Contract / Contingent', 'Booked', 'Executed Payable'].includes(stageLabel)) {
      // Anchor: Contract signed date
      if (contractSignedDate) {
        return parseISO(contractSignedDate);
      }
      // Fallback to last stage change
      const anchor = lastStageChangeAt || createdAt;
      if (anchor) {
        return parseISO(anchor);
      }
    }

    if (anchorDate && daysToAdd > 0) {
      // Add weeks behind adjustment
      const totalDays = daysToAdd + (weeksBehind * 7);
      return addDays(anchorDate, totalDays);
    }

    return anchorDate;
  }, [stageLabel, loiDate, loiSignedDate, contractSignedDate, lastStageChangeAt, createdAt, clientVelocity, defaults, weeksBehind]);

  // Calculate payment estimates
  const paymentEstimates = useMemo((): PaymentEstimate[] => {
    const execDate = estimatedExecutionDate
      ? parseISO(estimatedExecutionDate)
      : calculatedExecutionDate;

    if (!execDate) return [];

    const contingency = contingencyPeriodDays || 0;
    const rentComm = rentCommencementDays || defaults.rent_commencement_days;
    const dueDiligence = dueDiligenceDays || 0;
    const closingDeadline = closingDeadlineDays || defaults.closing_deadline_days;

    if (isPurchase) {
      // Purchase: 1 payment at closing
      const closeDate = addDays(execDate, dueDiligence + closingDeadline);
      return [{
        sequence: 1,
        estimatedDate: closeDate,
        notes: `Execution + ${dueDiligence} DD + ${closingDeadline} closing`,
      }];
    } else {
      // Lease: 2 payments
      const payment1Date = addDays(execDate, contingency);
      const payment2Date = addDays(execDate, contingency + rentComm);
      return [
        {
          sequence: 1,
          estimatedDate: payment1Date,
          notes: contingency > 0 ? `Execution + ${contingency} contingency` : 'At execution',
        },
        {
          sequence: 2,
          estimatedDate: payment2Date,
          notes: `Execution + ${contingency} contingency + ${rentComm} rent comm`,
        },
      ];
    }
  }, [
    estimatedExecutionDate,
    calculatedExecutionDate,
    contingencyPeriodDays,
    rentCommencementDays,
    dueDiligenceDays,
    closingDeadlineDays,
    defaults,
    isPurchase,
  ]);

  // Format date for display
  const formatDate = (date: Date | null): string => {
    if (!date) return 'TBD';
    return formatDateFn(date, 'MMM d, yyyy');
  };

  // Parse date string to Date object for DatePicker
  const parseDate = (dateStr: string | null): Date | null => {
    if (!dateStr) return null;
    try {
      return parseISO(dateStr);
    } catch {
      return null;
    }
  };

  return (
    <section className="bg-white rounded-md border p-4 mb-4">
      {/* Header with collapse toggle */}
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-800">Forecasting</h3>
          {isBehindSchedule && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-pink-100 text-pink-800">
              {weeksBehind}w behind
            </span>
          )}
          <span className="text-xs text-gray-500 ml-2">
            Payment date estimation for forecasting
          </span>
        </div>
        <button
          type="button"
          className="text-gray-400 hover:text-gray-600"
        >
          <svg
            className={`w-5 h-5 transform transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Collapsible content */}
      {!isCollapsed && (
        <div className="mt-4 space-y-4">
          {/* Velocity info display */}
          {clientVelocity && (clientVelocity.loi_deal_count >= 5 || clientVelocity.psa_deal_count >= 5) && (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
              <p className="text-xs text-blue-800 font-medium mb-1">Client Velocity (Historical)</p>
              <div className="flex gap-4 text-xs text-blue-700">
                {clientVelocity.loi_deal_count >= 5 && clientVelocity.loi_avg_days && (
                  <span>LOI: {Math.round(clientVelocity.loi_avg_days)} days avg ({clientVelocity.loi_deal_count} deals)</span>
                )}
                {clientVelocity.psa_deal_count >= 5 && clientVelocity.psa_avg_days && (
                  <span>PSA: {Math.round(clientVelocity.psa_avg_days)} days avg ({clientVelocity.psa_deal_count} deals)</span>
                )}
              </div>
            </div>
          )}

          {/* Period inputs - conditional based on deal type */}
          <div className="grid grid-cols-2 gap-4">
            {isLease ? (
              <>
                {/* Lease fields */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Contingency Period (days)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={contingencyPeriodDays ?? ''}
                    onChange={(e) => onChange('contingency_period_days', e.target.value ? parseInt(e.target.value) : null)}
                    placeholder="0"
                    className="block w-full rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    If not entered, assuming 0 days
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Rent Commencement Period (days)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={rentCommencementDays ?? ''}
                    onChange={(e) => onChange('rent_commencement_days', e.target.value ? parseInt(e.target.value) : null)}
                    placeholder={String(defaults.rent_commencement_days)}
                    className="block w-full rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    If not entered, assuming {defaults.rent_commencement_days} days
                  </p>
                </div>
              </>
            ) : (
              <>
                {/* Purchase fields */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Due Diligence Period (days)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={dueDiligenceDays ?? ''}
                    onChange={(e) => onChange('due_diligence_days', e.target.value ? parseInt(e.target.value) : null)}
                    placeholder="0"
                    className="block w-full rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    If not entered, assuming 0 days
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Closing Deadline (days)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={closingDeadlineDays ?? ''}
                    onChange={(e) => onChange('closing_deadline_days', e.target.value ? parseInt(e.target.value) : null)}
                    placeholder={String(defaults.closing_deadline_days)}
                    className="block w-full rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    If not entered, assuming {defaults.closing_deadline_days} days
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Estimated Execution Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Estimated Execution Date
              </label>
              <DatePicker
                selected={parseDate(estimatedExecutionDate)}
                onChange={(date: Date | null) => {
                  onChange('estimated_execution_date', date ? formatDateFn(date, 'yyyy-MM-dd') : null);
                }}
                dateFormat="MMM d, yyyy"
                placeholderText={calculatedExecutionDate ? formatDate(calculatedExecutionDate) : 'Select date'}
                className="block w-full rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                isClearable
              />
              {!estimatedExecutionDate && calculatedExecutionDate && (
                <p className="mt-1 text-xs text-gray-500">
                  Auto-calculated: {formatDate(calculatedExecutionDate)}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Calculation Basis
              </label>
              <div className="mt-1 p-2 bg-gray-50 rounded text-xs text-gray-600">
                {stageLabel === 'Negotiating LOI' && (
                  <>LOI date + {getEffectiveVelocity('loi')}d (LOI) + {getEffectiveVelocity('psa')}d (PSA)</>
                )}
                {(stageLabel === 'At Lease / PSA' || stageLabel === 'At Lease/PSA') && (
                  <>LOI signed + {getEffectiveVelocity('psa')}d (PSA)</>
                )}
                {['Under Contract / Contingent', 'Booked', 'Executed Payable'].includes(stageLabel) && (
                  <>Contract X date (actual)</>
                )}
                {weeksBehind > 0 && (
                  <span className="text-pink-600 ml-2">+ {weeksBehind * 7}d (behind schedule)</span>
                )}
              </div>
            </div>
          </div>

          {/* Payment Estimates Display - Editable */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">
              Estimated Payment Dates
            </label>
            <div className="bg-gray-50 rounded-md border">
              {!dealId || isNewDeal ? (
                <p className="p-3 text-xs text-gray-500 italic">
                  Save the deal to see and edit payment estimates
                </p>
              ) : payments.length === 0 ? (
                <p className="p-3 text-xs text-gray-500 italic">
                  No payments found for this deal
                </p>
              ) : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr className="text-xs text-gray-500">
                      <th className="px-3 py-2 text-left font-medium">Payment</th>
                      <th className="px-3 py-2 text-left font-medium">Estimated Date</th>
                      <th className="px-3 py-2 text-left font-medium">Source</th>
                      <th className="px-3 py-2 text-left font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {payments.map((payment) => {
                      const isOverridden = payment.payment_date_source === 'broker_override';
                      const autoDate = payment.payment_date_auto_calculated
                        ? parseISO(payment.payment_date_auto_calculated)
                        : null;
                      const currentDate = payment.payment_date_estimated
                        ? parseISO(payment.payment_date_estimated)
                        : null;

                      return (
                        <tr
                          key={payment.id}
                          className={`text-xs ${isOverridden ? 'bg-amber-50' : ''}`}
                        >
                          <td className="px-3 py-2 text-gray-900 font-medium">
                            Payment {payment.payment_sequence}
                          </td>
                          <td className="px-3 py-2">
                            <DatePicker
                              selected={currentDate}
                              onChange={(date) => handlePaymentDateOverride(payment.id, date)}
                              dateFormat="MMM d, yyyy"
                              placeholderText="Select date"
                              className={`w-32 rounded border text-xs px-2 py-1 ${
                                isOverridden
                                  ? 'border-amber-400 bg-amber-50 text-amber-900'
                                  : 'border-gray-300 text-gray-700'
                              }`}
                              disabled={savingPaymentId === payment.id}
                            />
                          </td>
                          <td className="px-3 py-2">
                            {isOverridden ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-amber-100 text-amber-800">
                                Override
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-600">
                                Auto
                              </span>
                            )}
                            {autoDate && isOverridden && (
                              <span className="ml-2 text-gray-400" title="Auto-calculated date">
                                (Auto: {formatDate(autoDate)})
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {isOverridden && (
                              <button
                                type="button"
                                onClick={() => handleResetToAuto(payment.id)}
                                disabled={savingPaymentId === payment.id}
                                className="text-xs text-blue-600 hover:text-blue-800 hover:underline disabled:opacity-50"
                              >
                                Reset to Auto
                              </button>
                            )}
                            {savingPaymentId === payment.id && (
                              <span className="text-xs text-gray-400 ml-2">Saving...</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Click a date to override. Overridden dates are highlighted in amber and won't be auto-updated.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
