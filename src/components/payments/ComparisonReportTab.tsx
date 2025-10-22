// src/components/payments/ComparisonReportTab.tsx

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { PaymentComparison, CommissionComparison } from '../../types/payment-dashboard';

type ReportType = 'payments' | 'commissions';

const ComparisonReportTab: React.FC = () => {
  const [reportType, setReportType] = useState<ReportType>('payments');
  const [paymentComparisons, setPaymentComparisons] = useState<PaymentComparison[]>([]);
  const [commissionComparisons, setCommissionComparisons] = useState<CommissionComparison[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDiscrepanciesOnly, setShowDiscrepanciesOnly] = useState(false);

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
      const { data: sfPayments, error: sfError } = await supabase
        .from('salesforce_Payment_Info__c')
        .select('Id, Name, Payment_Amount__c, Payment_Date__c, Payment_Status__c, Opportunity__c');

      if (sfError) throw sfError;

      // Fetch OVIS payment data
      const { data: ovisPayments, error: ovisError } = await supabase
        .from('payment')
        .select(`
          id,
          sf_id,
          payment_sequence,
          payment_amount,
          payment_received_date,
          payment_received,
          deal!inner (
            id,
            deal_name,
            sf_id
          )
        `);

      if (ovisError) throw ovisError;

      // Create comparison rows
      const comparisons: PaymentComparison[] = [];

      // Map to track which OVIS payments we've matched
      const matchedOvisPayments = new Set<string>();

      // First pass: match SF payments to OVIS payments by sf_id
      (sfPayments || []).forEach((sfPayment: any) => {
        const ovisPayment = (ovisPayments || []).find((p: any) => p.sf_id === sfPayment.Id);

        if (ovisPayment) {
          matchedOvisPayments.add(ovisPayment.id);
        }

        const sfAmount = sfPayment.Payment_Amount__c || 0;
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
          payment_sequence: ovisPayment?.payment_sequence || 0,
          sf_payment_id: sfPayment.Id,
          sf_payment_amount: sfAmount,
          sf_payment_date: sfPayment.Payment_Date__c,
          sf_payment_status: sfPayment.Payment_Status__c,
          ovis_payment_id: ovisPayment?.id || null,
          ovis_payment_amount: ovisAmount,
          ovis_payment_received_date: ovisPayment?.payment_received_date || null,
          ovis_payment_received: ovisPayment?.payment_received || null,
          amount_matches: amountMatches,
          date_matches: sfPayment.Payment_Date__c === ovisPayment?.payment_received_date,
          status_matches: true, // Could add more sophisticated status matching
          discrepancy_notes: discrepancyNotes,
        });
      });

      // Second pass: find OVIS payments not in Salesforce
      (ovisPayments || []).forEach((ovisPayment: any) => {
        if (!matchedOvisPayments.has(ovisPayment.id) && !ovisPayment.sf_id) {
          comparisons.push({
            deal_id: ovisPayment.deal?.id || '',
            deal_name: ovisPayment.deal?.deal_name || 'Unknown',
            payment_sequence: ovisPayment.payment_sequence || 0,
            sf_payment_id: null,
            sf_payment_amount: null,
            sf_payment_date: null,
            sf_payment_status: null,
            ovis_payment_id: ovisPayment.id,
            ovis_payment_amount: ovisPayment.payment_amount,
            ovis_payment_received_date: ovisPayment.payment_received_date,
            ovis_payment_received: ovisPayment.payment_received,
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
          Origination_USD__c,
          Site_USD__c,
          Deal_USD__c,
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
            sf_id
          )
        `);

      if (ovisError) throw ovisError;

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
          broker_name: ovisComm?.broker?.name || sfComm.Broker__c || 'Unknown',
          sf_commission_split_id: sfComm.Id,
          sf_origination_usd: sfComm.Origination_USD__c,
          sf_site_usd: sfComm.Site_USD__c,
          sf_deal_usd: sfComm.Deal_USD__c,
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
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
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

  const filteredPaymentComparisons = showDiscrepanciesOnly
    ? paymentComparisons.filter((c) => c.discrepancy_notes.length > 0)
    : paymentComparisons;

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
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Deal</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Payment #</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">SF Amount</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">OVIS Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SF Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">OVIS Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredPaymentComparisons.map((comp, idx) => (
                  <tr key={idx} className={comp.discrepancy_notes.length > 0 ? 'bg-red-50' : ''}>
                    <td className="px-4 py-3 text-sm text-gray-900">{comp.deal_name}</td>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
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
                    <td className="px-4 py-3 text-sm text-gray-900">{comp.deal_name}</td>
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
