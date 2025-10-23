// src/components/payments/PaymentDiscrepancyReport.tsx
// Interactive report to fix payment discrepancies by adjusting number_of_payments

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';

interface DealWithPayments {
  deal_id: string;
  deal_name: string;
  deal_stage: string;
  total_fee: number;
  number_of_payments: number;
  actual_payment_count: number;
  payments: Array<{
    payment_id: string;
    payment_sequence: number;
    stored_amount: number;
    calculated_amount: number;
    sf_amount: number | null;
  }>;
  has_discrepancy: boolean;
}

const PaymentDiscrepancyReport: React.FC = () => {
  const [deals, setDeals] = useState<DealWithPayments[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [showDiscrepanciesOnly, setShowDiscrepanciesOnly] = useState(true);

  useEffect(() => {
    fetchDealsWithDiscrepancies();
  }, []);

  const fetchDealsWithDiscrepancies = async () => {
    try {
      setLoading(true);

      // First, get the "Closed Paid" stage ID
      const { data: stages, error: stagesError } = await supabase
        .from('deal_stage')
        .select('id, label');

      if (stagesError) throw stagesError;

      const closedPaidStageId = stages?.find(s => s.label === 'Closed Paid')?.id;

      if (!closedPaidStageId) {
        console.error('Could not find Closed Paid stage');
        setLoading(false);
        return;
      }

      // Fetch only active payments from Closed Paid deals
      const { data: payments, error: paymentsError } = await supabase
        .from('payment')
        .select(`
          id,
          sf_id,
          payment_sequence,
          payment_amount,
          deal!inner (
            id,
            deal_name,
            stage_id,
            fee,
            number_of_payments
          )
        `)
        .eq('is_active', true)
        .eq('deal.stage_id', closedPaidStageId)
        .order('deal_id')
        .order('payment_sequence');

      if (paymentsError) throw paymentsError;

      // Fetch SF payments
      const { data: sfPayments, error: sfError } = await supabase
        .from('salesforce_Payment__c')
        .select('Id, Payment_Amount__c');

      if (sfError) throw sfError;

      const stageMap = new Map(stages?.map(s => [s.id, s.label]));
      const sfMap = new Map(sfPayments?.map(sf => [sf.Id, sf.Payment_Amount__c]));

      // Group by deal
      const dealMap = new Map<string, DealWithPayments>();

      payments?.forEach((payment: any) => {
        const dealId = payment.deal.id;
        const calculatedAmount = payment.deal.fee / payment.deal.number_of_payments;
        const sfAmount = payment.sf_id ? sfMap.get(payment.sf_id) : null;

        if (!dealMap.has(dealId)) {
          dealMap.set(dealId, {
            deal_id: dealId,
            deal_name: payment.deal.deal_name,
            deal_stage: stageMap.get(payment.deal.stage_id) || 'Unknown',
            total_fee: payment.deal.fee,
            number_of_payments: payment.deal.number_of_payments,
            actual_payment_count: 0,
            payments: [],
            has_discrepancy: false,
          });
        }

        const deal = dealMap.get(dealId)!;
        deal.actual_payment_count++;
        deal.payments.push({
          payment_id: payment.id,
          payment_sequence: payment.payment_sequence,
          stored_amount: payment.payment_amount,
          calculated_amount: calculatedAmount,
          sf_amount: sfAmount || null,
        });

        // Check for discrepancy: SF amount differs from stored amount
        // This is the issue for Closed Paid deals - Salesforce is source of truth
        if (sfAmount && Math.abs(payment.payment_amount - sfAmount) > 0.01) {
          deal.has_discrepancy = true;
        }
      });

      const dealsArray = Array.from(dealMap.values());
      setDeals(dealsArray);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching discrepancies:', error);
      setLoading(false);
    }
  };

  const handleNumberOfPaymentsChange = async (dealId: string, newValue: number) => {
    if (newValue < 1) return;

    setUpdating(dealId);

    try {
      // Update the deal - this will trigger the database trigger to fix payments
      const { error } = await supabase
        .from('deal')
        .update({ number_of_payments: newValue })
        .eq('id', dealId);

      if (error) throw error;

      // Wait a moment for trigger to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      // Refresh data
      await fetchDealsWithDiscrepancies();
    } catch (error) {
      console.error('Error updating number of payments:', error);
      alert('Error updating number of payments. Please try again.');
    } finally {
      setUpdating(null);
    }
  };

  const filteredDeals = showDiscrepanciesOnly
    ? deals.filter(d => d.has_discrepancy)
    : deals;

  if (loading) {
    return <div className="p-4">Loading discrepancies...</div>;
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Closed Paid Deals - Salesforce Reconciliation</h2>
        <p className="text-gray-600 mb-4">
          <strong>Closed Paid deals only.</strong> For these deals, Salesforce is the source of truth.
          Fix discrepancies where OVIS stored amount doesn't match Salesforce by adjusting the number of payments.
          Changes will automatically recalculate all payment amounts.
        </p>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showDiscrepanciesOnly}
            onChange={(e) => setShowDiscrepanciesOnly(e.target.checked)}
            className="rounded"
          />
          Show discrepancies only ({deals.filter(d => d.has_discrepancy).length} of {deals.length} Closed Paid deals)
        </label>
      </div>

      <div className="space-y-6">
        {filteredDeals.map((deal) => (
          <div
            key={deal.deal_id}
            className={`border rounded-lg p-4 ${
              deal.has_discrepancy ? 'border-red-300 bg-red-50' : 'border-gray-300 bg-white'
            }`}
          >
            {/* Deal Header */}
            <div className="grid grid-cols-12 gap-4 mb-4 pb-4 border-b">
              <div className="col-span-4">
                <div className="text-sm text-gray-600">Deal Name</div>
                <div className="font-semibold">{deal.deal_name}</div>
                <div className="text-xs text-gray-500">{deal.deal_stage}</div>
              </div>

              <div className="col-span-2">
                <div className="text-sm text-gray-600">Total Fee</div>
                <div className="font-semibold">
                  ${deal.total_fee.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>

              <div className="col-span-2">
                <div className="text-sm text-gray-600">Number of Payments</div>
                <input
                  type="number"
                  min="1"
                  value={deal.number_of_payments}
                  onChange={(e) => handleNumberOfPaymentsChange(deal.deal_id, parseInt(e.target.value) || 1)}
                  disabled={updating === deal.deal_id}
                  className="w-20 px-2 py-1 border rounded font-semibold disabled:bg-gray-100"
                />
              </div>

              <div className="col-span-2">
                <div className="text-sm text-gray-600">Actual Payment Count</div>
                <div className={`font-semibold ${
                  deal.actual_payment_count !== deal.number_of_payments ? 'text-orange-600' : 'text-green-600'
                }`}>
                  {deal.actual_payment_count}
                </div>
              </div>

              <div className="col-span-2">
                <div className="text-sm text-gray-600">Expected Per Payment</div>
                <div className="font-semibold text-blue-600">
                  ${(deal.total_fee / deal.number_of_payments).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            {/* Payments Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-3 py-2 text-left">Payment #</th>
                    <th className="px-3 py-2 text-right">Stored Amount</th>
                    <th className="px-3 py-2 text-right">Calculated Amount</th>
                    <th className="px-3 py-2 text-right">SF Amount</th>
                    <th className="px-3 py-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {deal.payments.map((payment) => {
                    const storedMatchesSF = payment.sf_amount ? Math.abs(payment.stored_amount - payment.sf_amount) < 0.01 : true;
                    const hasSF = payment.sf_amount !== null;

                    return (
                      <tr key={payment.payment_id} className="border-t">
                        <td className="px-3 py-2">Payment {payment.payment_sequence}</td>
                        <td className={`px-3 py-2 text-right font-mono ${!storedMatchesSF && hasSF ? 'text-red-600 font-semibold' : ''}`}>
                          ${payment.stored_amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-blue-600">
                          ${payment.calculated_amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className={`px-3 py-2 text-right font-mono ${!storedMatchesSF && hasSF ? 'text-orange-600 font-semibold' : 'text-gray-600'}`}>
                          {payment.sf_amount
                            ? `$${payment.sf_amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : '-'
                          }
                        </td>
                        <td className="px-3 py-2 text-center">
                          {!hasSF ? (
                            <span className="text-gray-400 text-xs">No SF data</span>
                          ) : storedMatchesSF ? (
                            <span className="text-green-600 text-xs">✓ Match</span>
                          ) : (
                            <span className="text-red-600 text-xs font-semibold">
                              ⚠ SF differs by ${Math.abs(payment.stored_amount - (payment.sf_amount || 0)).toFixed(2)}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {updating === deal.deal_id && (
              <div className="mt-4 text-sm text-blue-600 flex items-center gap-2">
                <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                Updating payments...
              </div>
            )}
          </div>
        ))}

        {filteredDeals.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            {showDiscrepanciesOnly
              ? '🎉 No discrepancies found! All payment amounts are correct.'
              : 'No deals found.'
            }
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentDiscrepancyReport;
