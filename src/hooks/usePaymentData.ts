import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Deal, Payment, PaymentSplit, Broker, CommissionSplit, Client } from '../lib/types';

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

// Property information extracted from payments
interface PropertyInfo {
  id: string;
  property_name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  formatted_address: string;
}

interface PaymentDataResult {
  // Data
  payments: PaymentWithProperty[];
  paymentSplits: PaymentSplit[];
  commissionSplits: CommissionSplit[];
  brokers: Broker[];
  clients: Client[];
  property: PropertyInfo | null;
  
  // State
  loading: boolean;
  error: string | null;
  generatingPayments: boolean;
  
  // Actions
  actions: {
    refreshData: () => Promise<void>;
    generatePayments: () => Promise<void>;
    updatePayment: (paymentId: string, updates: Partial<Payment>) => Promise<void>;
    deletePayment: (paymentId: string) => Promise<void>;
    updatePaymentAmounts: () => Promise<void>; // New: Update existing payment amounts
  };
}

export const usePaymentData = (dealId: string): PaymentDataResult => {
  // State management
  const [payments, setPayments] = useState<PaymentWithProperty[]>([]);
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([]);
  const [commissionSplits, setCommissionSplits] = useState<CommissionSplit[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatingPayments, setGeneratingPayments] = useState(false);

  // Extract property information from payments
  const property: PropertyInfo | null = payments[0]?.deal?.property 
    ? {
        ...payments[0].deal.property,
        formatted_address: [
          payments[0].deal.property.address,
          payments[0].deal.property.city,
          payments[0].deal.property.state,
          payments[0].deal.property.zip
        ].filter(Boolean).join(', ')
      }
    : null;

  // Centralized data fetching
  const fetchPaymentData = useCallback(async () => {
    if (!dealId) return;

    try {
      setLoading(true);
      setError(null);

      // Fetch payments with property information via JOIN (only active payments)
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payment')
        .select(`
          id,
          sf_id,
          payment_name,
          deal_id,
          payment_sequence,
          payment_amount,
          payment_date_estimated,
          payment_received_date,
          payment_invoice_date,
          payment_received,
          sf_payment_status,
          sf_invoice_sent_date,
          sf_payment_date_est,
          sf_payment_date_actual,
          sf_payment_date_received,
          sf_payment_invoice_date,
          qb_invoice_id,
          qb_invoice_number,
          qb_payment_id,
          qb_sync_status,
          qb_last_sync,
          orep_invoice,
          created_at,
          updated_at,
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
        .eq('deal_id', dealId)
        .eq('is_active', true)  // Only fetch active payments (exclude archived)
        .order('payment_sequence', { ascending: true });

      if (paymentsError) throw paymentsError;

      // DEBUG: Check what we're getting from the database
      console.log('🔍 Payment data from database:', paymentsData);
      if (paymentsData && paymentsData.length > 0) {
        console.log('🗓️ First payment date fields:', {
          payment_date_estimated: paymentsData[0].payment_date_estimated,
          payment_date_actual: paymentsData[0].payment_date_actual,
          payment_received_date: paymentsData[0].payment_received_date
        });
      }

      // FIXED: Use correct field name for payment splits
      // The payment table primary key is 'id', payment_split foreign key is 'payment_id'
      const paymentIds = paymentsData?.map(p => p.id) || []; // Use 'id' not 'payment_id'
      let paymentSplitsData: PaymentSplit[] = [];
      
      if (paymentIds.length > 0) {
        const { data: splitsData, error: splitsError } = await supabase
          .from('payment_split')
          .select('*')
          .in('payment_id', paymentIds); // payment_split.payment_id references payment.id

        if (splitsError) {
          console.warn('Error fetching payment splits:', splitsError);
          // Don't throw - continue without splits
        } else {
          paymentSplitsData = splitsData || [];
        }
      }

      // Fetch commission splits for this deal (templates for payment generation)
      const { data: commissionSplitsData, error: commissionSplitsError } = await supabase
        .from('commission_split')
        .select('*')
        .eq('deal_id', dealId);

      if (commissionSplitsError) throw commissionSplitsError;

      // Fetch all brokers
      const { data: brokersData, error: brokersError } = await supabase
        .from('broker')
        .select('*')
        .order('name');

      if (brokersError) throw brokersError;

      // Fetch all clients
      const { data: clientsData, error: clientsError } = await supabase
        .from('client')
        .select('*')
        .order('name');

      if (clientsError) throw clientsError;

      // Update state
      setPayments(paymentsData || []);
      setPaymentSplits(paymentSplitsData);
      setCommissionSplits(commissionSplitsData || []);
      setBrokers(brokersData || []);
      setClients(clientsData || []);

    } catch (err) {
      console.error('Error fetching payment data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load payment data');
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  // Generate payments action - ONLY create missing payments
  const generatePayments = useCallback(async () => {
    if (!dealId) return;

    try {
      setGeneratingPayments(true);
      setError(null);

      // Call the database function to generate payments
      // This should be modified to only create missing payments, not overwrite existing ones
      const { data, error } = await supabase.rpc('generate_payments_for_deal', {
        deal_uuid: dealId
      });

      if (error) {
        // Check if error is about existing payments
        if (error.message?.includes('already exists') || error.code === '23505') {
          // Payments already exist - this is ok, just refresh data
          console.log('Payments already exist, refreshing data...');
        } else {
          throw error;
        }
      }

      // Refresh payment data after generation
      await fetchPaymentData();

    } catch (err) {
      console.error('Error generating payments:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate payments');
    } finally {
      setGeneratingPayments(false);
    }
  }, [dealId, fetchPaymentData]);

  // NEW: Update existing payment amounts without deleting
  const updatePaymentAmounts = useCallback(async () => {
    try {
      setError(null);
      
      // This would call a new database function that updates payment amounts
      // based on current commission configuration without deleting records
      const { error } = await supabase.rpc('update_payment_amounts_for_deal', {
        deal_uuid: dealId
      });

      if (error) throw error;

      // Refresh data after update
      await fetchPaymentData();
      
    } catch (err) {
      console.error('Error updating payment amounts:', err);
      setError(err instanceof Error ? err.message : 'Failed to update payment amounts');
    }
  }, [dealId, fetchPaymentData]);

  // Update payment action - FIXED: Use correct field name
  const updatePayment = useCallback(async (paymentId: string, updates: Partial<Payment>) => {
    try {
      const { error } = await supabase
        .from('payment')
        .update(updates)
        .eq('id', paymentId); // FIXED: Use 'id' not 'payment_id'

      if (error) throw error;

      // Update local state - FIXED: Use correct field name
      setPayments(prev => prev.map(p => 
        p.id === paymentId ? { ...p, ...updates } : p
      ));

    } catch (err) {
      console.error('Error updating payment:', err);
      setError(err instanceof Error ? err.message : 'Failed to update payment');
      throw err;
    }
  }, []);

  // Delete payment action - KEEP but warn about Salesforce data
  const deletePayment = useCallback(async (paymentId: string) => {
    console.warn('Warning: Deleting payment that may contain Salesforce invoice data');
    
    try {
      // First delete payment splits
      const { error: splitsError } = await supabase
        .from('payment_split')
        .delete()
        .eq('payment_id', paymentId);

      if (splitsError) throw splitsError;

      // Then delete payment - FIXED: Use correct field name
      const { error: paymentError } = await supabase
        .from('payment')
        .delete()
        .eq('id', paymentId); // FIXED: Use 'id' not 'payment_id'

      if (paymentError) throw paymentError;

      // Update local state - FIXED: Use correct field name
      setPayments(prev => prev.filter(p => p.id !== paymentId));
      setPaymentSplits(prev => prev.filter(ps => ps.payment_id !== paymentId));

    } catch (err) {
      console.error('Error deleting payment:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete payment');
      throw err;
    }
  }, []);

  // Initial data fetch
  useEffect(() => {
    fetchPaymentData();
  }, [fetchPaymentData]);

  // Return comprehensive data and actions
  return {
    // Data
    payments,
    paymentSplits,
    commissionSplits,
    brokers,
    clients,
    property,
    
    // State
    loading,
    error,
    generatingPayments,
    
    // Actions
    actions: {
      refreshData: fetchPaymentData,
      generatePayments,
      updatePayment,
      deletePayment,
      updatePaymentAmounts // New safe update function
    }
  } as PaymentDataResult;
};