import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Deal, Payment, PaymentSplit, Broker } from '../lib/types';

interface PaymentTabProps {
  deal: Deal;
  onDealUpdate: (updates: Partial<Deal>) => Promise<void>;
}

const PaymentTab: React.FC<PaymentTabProps> = ({ deal, onDealUpdate }) => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatingPayments, setGeneratingPayments] = useState(false);

  // Fetch all payment-related data
  const fetchPaymentData = async () => {
    if (!deal.id) return;

    try {
      setLoading(true);
      setError(null);

      // Fetch payments for this deal
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payment')
        .select('*')
        .eq('deal_id', deal.id)
        .order('payment_number', { ascending: true });

      if (paymentsError) throw paymentsError;

      // Fetch payment splits for all payments
      const paymentIds = paymentsData?.map(p => p.payment_id) || [];
      let paymentSplitsData: PaymentSplit[] = [];
      
      if (paymentIds.length > 0) {
        const { data: splitsData, error: splitsError } = await supabase
          .from('payment_split')
          .select('*')
          .in('payment_id', paymentIds);

        if (splitsError) throw splitsError;
        paymentSplitsData = splitsData || [];
      }

      // Fetch all brokers
      const { data: brokersData, error: brokersError } = await supabase
        .from('broker')
        .select('*')
        .order('name');

      if (brokersError) throw brokersError;

      setPayments(paymentsData || []);
      setPaymentSplits(paymentSplitsData);
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
        deal_id: deal.id
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
        p.payment_id === paymentId ? { ...p, ...updates } : p
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
        .eq('payment_id', paymentId);

      if (paymentError) throw paymentError;

      // Update local state
      setPayments(prev => prev.filter(p => p.payment_id !== paymentId));
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
  const pendingPayments = payments.filter(p => p.status === 'pending').length;
  const sentPayments = payments.filter(p => p.status === 'sent').length;
  const receivedPayments = payments.filter(p => p.status === 'received').length;

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
            ${commissionFee.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="text-sm font-medium text-green-600">Total Payments</div>
          <div className="text-2xl font-bold text-green-900">
            ${totalPaymentAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="text-sm font-medium text-gray-600">Payment Count</div>
          <div className="text-2xl font-bold text-gray-900">{payments.length}</div>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="text-sm font-medium text-yellow-600">Status Summary</div>
          <div className="text-sm text-yellow-900">
            {pendingPayments}P / {sentPayments}S / {receivedPayments}R
          </div>
        </div>
      </div>

      {/* Payment Generation Section - Simplified */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Generation</h3>
        
        <div className="space-y-4">
          <div className="text-sm text-gray-600">
            <p>Commission Fee: ${(deal.fee || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            <p>Number of Payments: {deal.number_of_payments || 1}</p>
          </div>
          
          <button
            onClick={generatePayments}
            disabled={!deal.fee || deal.fee <= 0 || generatingPayments}
            className={`px-4 py-2 rounded-md font-medium transition-colors ${
              deal.fee && deal.fee > 0 && !generatingPayments
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {generatingPayments ? 'Generating...' : hasPayments ? 'Regenerate Payments' : 'Generate Payments'}
          </button>
        </div>
      </div>

      {/* Payment List - Simplified */}
      {hasPayments && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Management</h3>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Payment #</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {payments.map((payment) => (
                  <tr key={payment.payment_id}>
                    <td className="px-4 py-2 text-sm font-medium text-gray-900">
                      #{payment.payment_number}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-900">
                      ${(payment.payment_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-2 text-sm">
                      <select
                        value={payment.status || 'pending'}
                        onChange={(e) => updatePayment(payment.payment_id, { status: e.target.value })}
                        className="text-xs px-2 py-1 border border-gray-300 rounded"
                      >
                        <option value="pending">Pending</option>
                        <option value="sent">Sent</option>
                        <option value="received">Received</option>
                      </select>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-900">
                      <input
                        type="date"
                        value={payment.payment_date || ''}
                        onChange={(e) => updatePayment(payment.payment_id, { payment_date: e.target.value })}
                        className="text-xs px-2 py-1 border border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-4 py-2 text-sm">
                      <button
                        onClick={() => deletePayment(payment.payment_id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* No Payments State */}
      {!hasPayments && !generatingPayments && (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <div className="text-gray-500 text-lg mb-2">No payments generated yet</div>
          <div className="text-gray-400 text-sm">
            Configure commission details and generate payments to get started
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentTab;