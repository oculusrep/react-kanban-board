import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Deal, Payment, PaymentSplit, Broker, CommissionSplit } from '../lib/types';
import { usePaymentCalculations } from '../hooks/usePaymentCalculations';
import PaymentGenerationSection from './PaymentGenerationSection';
import PaymentListSection from './PaymentListSection';

// Enhanced Payment type with joined property data
interface PaymentWithProperty extends Payment {
  deal?: {
    id: string;
    property_id: string;
    property?: {
      id: string;
      property_name: string;
      address: string;
      city: string;
      state: string;
      zip: string;
    };
  };
}

interface PaymentTabProps {
  deal: Deal;
  onDealUpdate: (updates: Partial<Deal>) => Promise<void>;
}

const PaymentTab: React.FC<PaymentTabProps> = ({ deal, onDealUpdate }) => {
  const [payments, setPayments] = useState<PaymentWithProperty[]>([]);
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([]);
  const [commissionSplits, setCommissionSplits] = useState<CommissionSplit[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatingPayments, setGeneratingPayments] = useState(false);

  // Use centralized payment calculations
  const {
    calculatedPaymentAmount,
    totalCalculatedPayments,
    paymentCommissionBreakdown,
    canGeneratePayments,
    validationMessages
  } = usePaymentCalculations(deal, payments, commissionSplits);

  // Fetch all payment and commission-related data
  const fetchPaymentData = async () => {
    if (!deal.id) return;

    try {
      setLoading(true);
      setError(null);

      // Fetch payments for this deal with property information via JOIN
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payment')
        .select(`
          *,
          deal!inner(
            id,
            property_id,
            property!inner(
              id,
              property_name,
              address,
              city,
              state,
              zip
            )
          )
        `)
        .eq('deal_id', deal.id)
        .order('payment_sequence', { ascending: true });

      if (paymentsError) throw paymentsError;

      // Fetch payment splits for all payments  
      const paymentIds = paymentsData?.map(p => p.id) || [];
      let paymentSplitsData: PaymentSplit[] = [];
      
      if (paymentIds.length > 0) {
        const { data: splitsData, error: splitsError } = await supabase
          .from('payment_split')
          .select('*')
          .in('payment_id', paymentIds);

        if (splitsError) throw splitsError;
        paymentSplitsData = splitsData || [];
      }

      // Fetch commission splits for this deal (templates for payment generation)
      const { data: commissionSplitsData, error: commissionSplitsError } = await supabase
        .from('commission_split')
        .select('*')
        .eq('deal_id', deal.id);

      if (commissionSplitsError) throw commissionSplitsError;

      // Fetch all brokers
      const { data: brokersData, error: brokersError } = await supabase
        .from('broker')
        .select('*')
        .order('name');

      if (brokersError) throw brokersError;

      setPayments(paymentsData || []);
      setPaymentSplits(paymentSplitsData);
      setCommissionSplits(commissionSplitsData || []);
      setBrokers(brokersData || []);

    } catch (err) {
      console.error('Error fetching payment data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load payment data');
    } finally {
      setLoading(false);
    }
  };

  // Generate payments for the deal
  const generatePayments = async () => {
    if (!deal.id) return;

    try {
      setGeneratingPayments(true);
      setError(null);

      // Call the database function to generate payments
      const { data, error } = await supabase.rpc('generate_payments_for_deal', {
        deal_uuid: deal.id
      });

      if (error) throw error;

      // Refresh payment data after generation
      await fetchPaymentData();

    } catch (err) {
      console.error('Error generating payments:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate payments');
    } finally {
      setGeneratingPayments(false);
    }
  };

  // Update payment in database
  const updatePayment = async (paymentId: string, updates: Partial<Payment>) => {
    try {
      const { error } = await supabase
        .from('payment')
        .update(updates)
        .eq('payment_id', paymentId);

      if (error) throw error;

      // Update local state
      setPayments(prev => prev.map(p => 
        p.id === paymentId ? { ...p, ...updates } : p
      ));

    } catch (err) {
      console.error('Error updating payment:', err);
      setError(err instanceof Error ? err.message : 'Failed to update payment');
    }
  };

  // Delete payment
  const deletePayment = async (paymentId: string) => {
    try {
      // First delete payment splits
      const { error: splitsError } = await supabase
        .from('payment_split')
        .delete()
        .eq('payment_id', paymentId);

      if (splitsError) throw splitsError;

      // Then delete payment
      const { error: paymentError } = await supabase
        .from('payment')
        .delete()
        .eq('id', paymentId);

      if (paymentError) throw paymentError;

      // Update local state
      setPayments(prev => prev.filter(p => p.id !== paymentId));
      setPaymentSplits(prev => prev.filter(ps => ps.payment_id !== paymentId));

    } catch (err) {
      console.error('Error deleting payment:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete payment');
    }
  };

  useEffect(() => {
    fetchPaymentData();
  }, [deal.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading payment data...</div>
      </div>
    );
  }

  const hasPayments = payments.length > 0;
  const totalPaymentAmount = payments.reduce((sum, p) => sum + (p.payment_amount || 0), 0);
  const commissionFee = deal.fee || 0;
  const pendingPayments = payments.filter(p => p => p.payment_received !== true).length;
  const receivedPayments = payments.filter(p => p => p.payment_received !== true).length;

  // Helper function for currency formatting
  const formatUSD = (amount: number): string => {
    return amount.toLocaleString('en-US', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-700">{error}</div>
        </div>
      )}

      {/* Payment Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="text-sm font-medium text-blue-600">Total Commission</div>
          <div className="text-2xl font-bold text-blue-900">
            ${formatUSD(commissionFee)}
          </div>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="text-sm font-medium text-green-600">Calculated Payments</div>
          <div className="text-2xl font-bold text-green-900">
            ${formatUSD(totalCalculatedPayments)}
          </div>
          <div className="text-xs text-green-600 mt-1">
            {deal.number_of_payments || 1} × ${formatUSD(calculatedPaymentAmount)}
          </div>
        </div>

        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="text-sm font-medium text-purple-600">Current Total</div>
          <div className="text-2xl font-bold text-purple-900">
            ${formatUSD(totalPaymentAmount)}
          </div>
          <div className="text-xs text-purple-600 mt-1">
            {payments.length} payments generated
          </div>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="text-sm font-medium text-yellow-600">Status Summary</div>
          <div className="text-sm text-yellow-900 mt-1">
            <div>{pendingPayments} Pending</div>
            <div>{receivedPayments} Received</div>
          </div>
        </div>
      </div>

      {/* Payment Generation Section */}
      <PaymentGenerationSection
        deal={deal}
        hasPayments={hasPayments}
        existingPayments={payments}
        commissionSplits={commissionSplits}
        onGeneratePayments={generatePayments}
        generatingPayments={generatingPayments}
      />

      {/* Payment List Section */}
      {hasPayments ? (
        <div className="space-y-6">
          {/* Property Information (from joined data) */}
          {payments[0]?.deal?.property && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-900 mb-2">Property Information</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-gray-600">Property Name</div>
                  <div className="font-medium">{payments[0]?.deal?.property?.property_name || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-gray-600">Address</div>
                  <div className="font-medium">{
                    [payments[0]?.deal?.property?.address, payments[0]?.deal?.property?.city, payments[0]?.deal?.property?.state, payments[0]?.deal?.property?.zip]
                    .filter(Boolean).join(', ') || 'N/A'
                  }</div>
                </div>
              </div>
            </div>
          )}

          <PaymentListSection
            payments={payments}
            paymentSplits={paymentSplits}
            brokers={brokers}
            onUpdatePayment={updatePayment}
            onDeletePayment={deletePayment}
          />
        </div>
      ) : (
        /* No Payments State */
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <div className="text-gray-500 text-lg mb-2">No payments generated yet</div>
          <div className="text-gray-400 text-sm">
            {canGeneratePayments ? 
              'Click "Generate Payments" above to create payment records' :
              'Complete commission configuration to enable payment generation'
            }
          </div>
          {validationMessages.length > 0 && (
            <div className="mt-4 text-left max-w-md mx-auto">
              <div className="text-sm text-gray-600 mb-2">Required configuration:</div>
              <ul className="text-sm text-gray-500 space-y-1">
                {validationMessages.map((message, index) => (
                  <li key={index} className="flex items-start">
                    <span className="text-gray-400 mr-1">•</span>
                    {message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Commission Breakdown Summary (for reference) */}
      {hasPayments && paymentCommissionBreakdown.agci > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-900 mb-3">Commission Reference (per payment)</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-gray-600">AGCI</div>
              <div className="font-medium">${formatUSD(paymentCommissionBreakdown.agci)}</div>
            </div>
            <div>
              <div className="text-gray-600">Origination ({paymentCommissionBreakdown.origination_percent}%)</div>
              <div className="font-medium">${formatUSD(paymentCommissionBreakdown.origination_usd)}</div>
            </div>
            <div>
              <div className="text-gray-600">Site ({paymentCommissionBreakdown.site_percent}%)</div>
              <div className="font-medium">${formatUSD(paymentCommissionBreakdown.site_usd)}</div>
            </div>
            <div>
              <div className="text-gray-600">Deal ({paymentCommissionBreakdown.deal_percent}%)</div>
              <div className="font-medium">${formatUSD(paymentCommissionBreakdown.deal_usd)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentTab;