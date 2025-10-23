// src/components/payments/ComparisonReportTab.tsx

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { PaymentComparison, CommissionComparison } from '../../types/payment-dashboard';
import PaymentAmountOverrideModal from './PaymentAmountOverrideModal';

type ReportType = 'payments' | 'commissions';

const ComparisonReportTab: React.FC = () => {
  const [reportType, setReportType] = useState<ReportType>('payments');
  const [paymentComparisons, setPaymentComparisons] = useState<PaymentComparison[]>([]);
  const [commissionComparisons, setCommissionComparisons] = useState<CommissionComparison[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDiscrepanciesOnly, setShowDiscrepanciesOnly] = useState(false);
  const [hideOvisOnlyPayments, setHideOvisOnlyPayments] = useState(false);

  // Override modal state
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<PaymentComparison | null>(null);

  // Menu dropdown state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useEffect(() => {
    if (reportType === 'payments') {
      fetchPaymentComparisons();
    } else {
      fetchCommissionComparisons();
    }
  }, [reportType]);

  const fetchPaymentComparisons = async () => {
    try {
      setLoading(true);

      // Fetch Salesforce payment data
      console.log('[ComparisonReport] Fetching Salesforce payments...');
      const { data: sfPayments, error: sfError } = await supabase
        .from('salesforce_Payment__c')
        .select('Id, Name, Payment_Amount__c, Payment_Date_Actual__c, PMT_Received_Date__c, Payment_Received__c, Opportunity__c');

      if (sfError) {
        console.error('[ComparisonReport] Salesforce payment fetch error:', sfError);
        throw sfError;
      }
      console.log('[ComparisonReport] Salesforce payments fetched:', sfPayments?.length || 0);

      // Fetch deal stages first to get IDs for filtering
      const { data: stagesData, error: stagesError } = await supabase
        .from('deal_stage')
        .select('id, label');

      if (stagesError) throw stagesError;

      // Find Lost and Closed Paid stage IDs
      const lostStage = stagesData?.find(s => s.label === 'Lost');
      const closedPaidStage = stagesData?.find(s => s.label === 'Closed Paid');
      const excludedStageIds = [lostStage?.id, closedPaidStage?.id].filter(Boolean);

      // Fetch ALL OVIS payment data (active only) to properly match SF payments
      console.log('[ComparisonReport] Fetching OVIS payments...');
      const { data: allOvisPayments, error: ovisError } = await supabase
        .from('payment')
        .select(`
          id,
          sf_id,
          payment_sequence,
          payment_amount,
          amount_override,
          override_at,
          override_by,
          payment_received_date,
          payment_received,
          deal!inner (
            id,
            deal_name,
            sf_id,
            stage_id,
            fee,
            number_of_payments
          )
        `)
        .eq('is_active', true);

      if (ovisError) {
        console.error('[ComparisonReport] OVIS payment fetch error:', ovisError);
        throw ovisError;
      }
      console.log('[ComparisonReport] All OVIS payments fetched:', allOvisPayments?.length || 0);

      // Filter OVIS payments to exclude Lost and Closed Paid deals
      const ovisPayments = allOvisPayments?.filter((p: any) =>
        !excludedStageIds.includes(p.deal.stage_id)
      );
      console.log('[ComparisonReport] OVIS payments after stage filter:', ovisPayments?.length || 0);

      // Debug: Log overridden payments
      const overriddenPayments = ovisPayments?.filter((p: any) => p.amount_override);
      if (overriddenPayments && overriddenPayments.length > 0) {
        console.log('[ComparisonReport] Found overridden payments:', overriddenPayments.map((p: any) => ({
          id: p.id,
          payment_amount: p.payment_amount,
          amount_override: p.amount_override,
          deal: p.deal?.deal_name
        })));
      }

      // Get set of SF deal IDs that belong to Lost or Closed Paid deals
      const excludedSfDealIds = new Set<string>();
      allOvisPayments?.forEach((p: any) => {
        if (excludedStageIds.includes(p.deal.stage_id) && p.deal.sf_id) {
          excludedSfDealIds.add(p.deal.sf_id);
        }
      });
      console.log('[ComparisonReport] Excluded SF deal IDs:', excludedSfDealIds.size);

      // Create stage lookup map
      const stageMap = new Map<string, string>();
      stagesData?.forEach(stage => {
        stageMap.set(stage.id, stage.label);
      });

      // Create comparison rows
      const comparisons: PaymentComparison[] = [];

      // Map to track which OVIS payments we've matched
      const matchedOvisPayments = new Set<string>();

      // Fetch archived OVIS payments to check if SF payment is linked to archived payment
      const { data: archivedOvisPayments } = await supabase
        .from('payment')
        .select('id, sf_id, is_active')
        .eq('is_active', false)
        .not('sf_id', 'is', null);

      // Create set of SF IDs that are linked to archived OVIS payments
      const archivedSfIds = new Set<string>();
      (archivedOvisPayments || []).forEach((p: any) => {
        if (p.sf_id) {
          archivedSfIds.add(p.sf_id);
        }
      });

      // First pass: match SF payments to OVIS payments by sf_id
      // Skip SF payments that are linked to archived OVIS payments or excluded deals
      (sfPayments || []).forEach((sfPayment: any) => {
        // Skip if this SF payment is linked to an archived OVIS payment
        if (archivedSfIds.has(sfPayment.Id)) {
          return;
        }

        // Skip if this SF payment belongs to a Lost or Closed Paid deal
        if (excludedSfDealIds.has(sfPayment.Opportunity__c)) {
          return;
        }

        const ovisPayment = (ovisPayments || []).find((p: any) => p.sf_id === sfPayment.Id);

        if (ovisPayment) {
          matchedOvisPayments.add(ovisPayment.id);
        }

        const sfAmount = sfPayment.Payment_Amount__c || 0;
        // Use stored payment amount (the source of truth for reporting and splits)
        const ovisAmount = ovisPayment?.payment_amount || 0;
        const amountDiff = Math.abs(sfAmount - ovisAmount);

        const discrepancyNotes: string[] = [];
        const amountMatches = amountDiff < 0.01;

        if (!ovisPayment) {
          discrepancyNotes.push('Payment exists in Salesforce but not in OVIS');
        } else if (!amountMatches) {
          discrepancyNotes.push(`Amount differs by ${formatCurrency(amountDiff)}`);
        }

        comparisons.push({
          deal_id: ovisPayment?.deal?.id || '',
          deal_name: ovisPayment?.deal?.deal_name || sfPayment.Name || 'Unknown',
          deal_stage_name: ovisPayment?.deal?.stage_id ? stageMap.get(ovisPayment.deal.stage_id) || null : null,
          payment_sequence: ovisPayment?.payment_sequence || 0,
          sf_payment_id: sfPayment.Id,
          sf_payment_amount: sfAmount,
          sf_payment_date: sfPayment.PMT_Received_Date__c || sfPayment.Payment_Date_Actual__c,
          sf_payment_status: sfPayment.Payment_Received__c ? 'Received' : 'Pending',
          sf_deal_name: sfPayment.Name || null,
          ovis_payment_id: ovisPayment?.id || null,
          ovis_payment_amount: ovisAmount,
          ovis_amount_override: (ovisPayment as any)?.amount_override || false,
          ovis_payment_received_date: ovisPayment?.payment_received_date || null,
          ovis_payment_received: ovisPayment?.payment_received || null,
          ovis_deal_name: ovisPayment?.deal?.deal_name || null,
          ovis_deal_stage_name: ovisPayment?.deal?.stage_id ? stageMap.get(ovisPayment.deal.stage_id) || null : null,
          amount_matches: amountMatches,
          date_matches: (sfPayment.PMT_Received_Date__c || sfPayment.Payment_Date_Actual__c) === ovisPayment?.payment_received_date,
          status_matches: sfPayment.Payment_Received__c === ovisPayment?.payment_received,
          discrepancy_notes: discrepancyNotes,
        });
      });

      // Second pass: find OVIS payments not in Salesforce
      (ovisPayments || []).forEach((ovisPayment: any) => {
        if (!matchedOvisPayments.has(ovisPayment.id) && !ovisPayment.sf_id) {
          // Use stored payment amount (the source of truth for reporting and splits)
          const ovisAmount = ovisPayment.payment_amount || 0;

          comparisons.push({
            deal_id: ovisPayment.deal?.id || '',
            deal_name: ovisPayment.deal?.deal_name || 'Unknown',
            deal_stage_name: ovisPayment.deal?.stage_id ? stageMap.get(ovisPayment.deal.stage_id) || null : null,
            payment_sequence: ovisPayment.payment_sequence || 0,
            sf_payment_id: null,
            sf_payment_amount: null,
            sf_payment_date: null,
            sf_payment_status: null,
            sf_deal_name: null,
            ovis_payment_id: ovisPayment.id,
            ovis_payment_amount: ovisAmount,
            ovis_amount_override: (ovisPayment as any)?.amount_override || false,
            ovis_payment_received_date: ovisPayment.payment_received_date,
            ovis_payment_received: ovisPayment.payment_received,
            ovis_deal_name: ovisPayment.deal?.deal_name || null,
            ovis_deal_stage_name: ovisPayment.deal?.stage_id ? stageMap.get(ovisPayment.deal.stage_id) || null : null,
            amount_matches: false,
            date_matches: false,
            status_matches: false,
            discrepancy_notes: ['Payment exists in OVIS but not in Salesforce'],
          });
        }
      });

      setPaymentComparisons(comparisons);
    } catch (error) {
      console.error('Error fetching payment comparisons:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCommissionComparisons = async () => {
    try {
      setLoading(true);

      // Fetch Salesforce commission split data
      const { data: sfCommissions, error: sfError } = await supabase
        .from('salesforce_Commission_Split__c')
        .select(`
          Id,
          Name,
          Broker__c,
          Origination_Dollars__c,
          Site_Dollars__c,
          Deal_Dollars__c,
          Broker_Total__c,
          Opportunity__c
        `);

      if (sfError) throw sfError;

      // Fetch OVIS commission split data
      const { data: ovisCommissions, error: ovisError } = await supabase
        .from('commission_split')
        .select(`
          id,
          sf_id,
          split_origination_usd,
          split_site_usd,
          split_deal_usd,
          split_broker_total,
          broker!inner (
            name
          ),
          deal!inner (
            id,
            deal_name,
            sf_id,
            stage_id
          )
        `);

      if (ovisError) throw ovisError;

      // Fetch deal stages separately
      const { data: stagesData, error: stagesError } = await supabase
        .from('deal_stage')
        .select('id, label');

      if (stagesError) throw stagesError;

      // Create stage lookup map
      const stageMap = new Map<string, string>();
      stagesData?.forEach(stage => {
        stageMap.set(stage.id, stage.label);
      });

      // Create comparison rows
      const comparisons: CommissionComparison[] = [];
      const matchedOvisCommissions = new Set<string>();

      // First pass: match SF commissions to OVIS commissions
      (sfCommissions || []).forEach((sfComm: any) => {
        const ovisComm = (ovisCommissions || []).find((c: any) => c.sf_id === sfComm.Id);

        if (ovisComm) {
          matchedOvisCommissions.add(ovisComm.id);
        }

        const sfTotal = sfComm.Broker_Total__c || 0;
        const ovisTotal = ovisComm?.split_broker_total || 0;
        const diff = Math.abs(sfTotal - ovisTotal);
        const amountsMatch = diff < 0.01;

        const discrepancyNotes: string[] = [];
        if (!ovisComm) {
          discrepancyNotes.push('Commission split exists in Salesforce but not in OVIS');
        } else if (!amountsMatch) {
          discrepancyNotes.push(`Total differs by ${formatCurrency(diff)}`);
        }

        comparisons.push({
          deal_id: ovisComm?.deal?.id || '',
          deal_name: ovisComm?.deal?.deal_name || sfComm.Name || 'Unknown',
          deal_stage_name: ovisComm?.deal?.stage_id ? stageMap.get(ovisComm.deal.stage_id) || null : null,
          broker_name: ovisComm?.broker?.name || sfComm.Broker__c || 'Unknown',
          sf_commission_split_id: sfComm.Id,
          sf_origination_usd: sfComm.Origination_Dollars__c,
          sf_site_usd: sfComm.Site_Dollars__c,
          sf_deal_usd: sfComm.Deal_Dollars__c,
          sf_total: sfTotal,
          ovis_commission_split_id: ovisComm?.id || null,
          ovis_origination_usd: ovisComm?.split_origination_usd || null,
          ovis_site_usd: ovisComm?.split_site_usd || null,
          ovis_deal_usd: ovisComm?.split_deal_usd || null,
          ovis_total: ovisTotal,
          amounts_match: amountsMatch,
          discrepancy_amount: diff,
          discrepancy_notes: discrepancyNotes,
        });
      });

      // Second pass: find OVIS commissions not in Salesforce
      (ovisCommissions || []).forEach((ovisComm: any) => {
        if (!matchedOvisCommissions.has(ovisComm.id) && !ovisComm.sf_id) {
          comparisons.push({
            deal_id: ovisComm.deal?.id || '',
            deal_name: ovisComm.deal?.deal_name || 'Unknown',
            deal_stage_name: ovisComm.deal?.stage_id ? stageMap.get(ovisComm.deal.stage_id) || null : null,
            broker_name: ovisComm.broker?.name || 'Unknown',
            sf_commission_split_id: null,
            sf_origination_usd: null,
            sf_site_usd: null,
            sf_deal_usd: null,
            sf_total: null,
            ovis_commission_split_id: ovisComm.id,
            ovis_origination_usd: ovisComm.split_origination_usd,
            ovis_site_usd: ovisComm.split_site_usd,
            ovis_deal_usd: ovisComm.split_deal_usd,
            ovis_total: ovisComm.split_broker_total,
            amounts_match: false,
            discrepancy_amount: ovisComm.split_broker_total || 0,
            discrepancy_notes: ['Commission split exists in OVIS but not in Salesforce'],
          });
        }
      });

      setCommissionComparisons(comparisons);
    } catch (error) {
      console.error('Error fetching commission comparisons:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number | null) => {
    if (amount === null) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleOpenOverrideModal = (payment: PaymentComparison) => {
    setSelectedPayment(payment);
    setShowOverrideModal(true);
    setOpenMenuId(null);
  };

  const handleClearOverride = async (payment: PaymentComparison) => {
    if (!payment.ovis_payment_id) return;

    if (!confirm('Clear the override and allow automatic recalculation?')) return;

    try {
      const { error } = await supabase
        .from('payment')
        .update({
          amount_override: false,
          override_at: null,
          override_by: null,
        })
        .eq('id', payment.ovis_payment_id);

      if (error) throw error;

      // Refresh the report
      await fetchPaymentComparisons();
      setOpenMenuId(null);
    } catch (error: any) {
      console.error('Error clearing override:', error);
      alert(`Error: ${error.message}`);
    }
  };

  const filteredPaymentComparisons = paymentComparisons
    .filter((c) => {
      // Filter by discrepancies if enabled
      if (showDiscrepanciesOnly && c.discrepancy_notes.length === 0) {
        return false;
      }
      // Filter out OVIS-only payments if enabled
      if (hideOvisOnlyPayments && c.discrepancy_notes.includes('Payment exists in OVIS but not in Salesforce')) {
        return false;
      }
      return true;
    });

  const filteredCommissionComparisons = showDiscrepanciesOnly
    ? commissionComparisons.filter((c) => c.discrepancy_notes.length > 0)
    : commissionComparisons;

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div>
      {/* Report Type Selector */}
      <div className="bg-white shadow rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex space-x-4">
            <button
              onClick={() => setReportType('payments')}
              className={`px-4 py-2 rounded-md font-medium text-sm ${
                reportType === 'payments'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Payment Comparison
            </button>
            <button
              onClick={() => setReportType('commissions')}
              className={`px-4 py-2 rounded-md font-medium text-sm ${
                reportType === 'commissions'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Commission Split Comparison
            </button>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="discrepancies-only"
                checked={showDiscrepanciesOnly}
                onChange={(e) => setShowDiscrepanciesOnly(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="discrepancies-only" className="text-sm text-gray-700">
                Show discrepancies only
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="hide-ovis-only"
                checked={hideOvisOnlyPayments}
                onChange={(e) => setHideOvisOnlyPayments(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="hide-ovis-only" className="text-sm text-gray-700">
                Hide OVIS-only payments
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Comparison Table */}
      {reportType === 'payments' && (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">
              Payment Comparison ({filteredPaymentComparisons.length} records)
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Comparing Salesforce Payment_Info__c table with OVIS payment table
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SF Deal</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">OVIS Deal</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Payment #</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">SF Amount</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">OVIS Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SF Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">OVIS Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredPaymentComparisons.map((comp, idx) => (
                  <tr key={idx} className={comp.discrepancy_notes.length > 0 ? 'bg-red-50' : ''}>
                    {/* SF Deal Column */}
                    <td className="px-4 py-3 text-sm">
                      {comp.sf_deal_name ? (
                        <span className="text-gray-900">{comp.sf_deal_name}</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    {/* OVIS Deal Column */}
                    <td className="px-4 py-3 text-sm">
                      {comp.ovis_deal_name ? (
                        <>
                          {comp.deal_id ? (
                            <a
                              href={`/deal/${comp.deal_id}?tab=payment`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                            >
                              {comp.ovis_deal_name}
                            </a>
                          ) : (
                            <span className="text-gray-900">{comp.ovis_deal_name}</span>
                          )}
                          {comp.ovis_deal_stage_name && (
                            <div className="text-xs text-gray-500 mt-0.5">{comp.ovis_deal_stage_name}</div>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{comp.payment_sequence || '-'}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900">
                      {formatCurrency(comp.sf_payment_amount)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900">
                      {formatCurrency(comp.ovis_payment_amount)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{formatDate(comp.sf_payment_date)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatDate(comp.ovis_payment_received_date)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {comp.amount_matches ? (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                          Match
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                          Mismatch
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {comp.discrepancy_notes.join('; ')}
                    </td>
                    {/* Actions Column */}
                    <td className="px-4 py-3 text-sm relative">
                      {comp.ovis_payment_id && (
                        <div className="relative inline-block">
                          <button
                            onClick={() => setOpenMenuId(openMenuId === comp.ovis_payment_id ? null : comp.ovis_payment_id)}
                            className="text-gray-400 hover:text-gray-600 focus:outline-none"
                          >
                            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                            </svg>
                          </button>
                          {openMenuId === comp.ovis_payment_id && (
                            <div className="absolute right-0 z-10 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5">
                              <div className="py-1">
                                <button
                                  onClick={() => handleOpenOverrideModal(comp)}
                                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                >
                                  {comp.ovis_amount_override ? '📝 Edit Override' : '🔧 Override Amount'}
                                </button>
                                {comp.ovis_amount_override && (
                                  <button
                                    onClick={() => handleClearOverride(comp)}
                                    className="block w-full text-left px-4 py-2 text-sm text-red-700 hover:bg-gray-100"
                                  >
                                    🔓 Clear Override
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                          {comp.ovis_amount_override && (
                            <span className="ml-2 text-xs text-orange-600" title="Amount has been manually adjusted">
                              🚩
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Override Modal */}
      {selectedPayment && selectedPayment.ovis_payment_id && (
        <PaymentAmountOverrideModal
          isOpen={showOverrideModal}
          onClose={() => {
            setShowOverrideModal(false);
            setSelectedPayment(null);
          }}
          paymentId={selectedPayment.ovis_payment_id}
          currentAmount={selectedPayment.ovis_payment_amount || 0}
          paymentSequence={selectedPayment.payment_sequence || 0}
          dealName={selectedPayment.ovis_deal_name || selectedPayment.deal_name || 'Unknown Deal'}
          onSuccess={() => {
            fetchPaymentComparisons();
          }}
        />
      )}

      {/* Commission Comparison Table */}
      {reportType === 'commissions' && (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">
              Commission Split Comparison ({filteredCommissionComparisons.length} records)
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Comparing Salesforce Commission_Split__c table with OVIS commission_split table
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Deal</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Broker</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">SF Total</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">OVIS Total</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Difference</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredCommissionComparisons.map((comp, idx) => (
                  <tr key={idx} className={comp.discrepancy_notes.length > 0 ? 'bg-red-50' : ''}>
                    <td className="px-4 py-3 text-sm">
                      {comp.deal_id ? (
                        <a
                          href={`/deal/${comp.deal_id}?tab=payment`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                        >
                          {comp.deal_name}
                        </a>
                      ) : (
                        <span className="text-gray-900">{comp.deal_name}</span>
                      )}
                      {comp.deal_stage_name && (
                        <div className="text-xs text-gray-500 mt-0.5">{comp.deal_stage_name}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">{comp.broker_name}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900">
                      {formatCurrency(comp.sf_total)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900">
                      {formatCurrency(comp.ovis_total)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900">
                      {comp.discrepancy_amount > 0 ? formatCurrency(comp.discrepancy_amount) : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {comp.amounts_match ? (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                          Match
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                          Mismatch
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {comp.discrepancy_notes.join('; ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComparisonReportTab;
