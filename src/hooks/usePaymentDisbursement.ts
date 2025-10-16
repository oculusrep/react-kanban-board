import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Payment, PaymentSplit } from '../lib/types';

interface DisbursementData {
  payment: Payment;
  paymentSplits: PaymentSplit[];
}

export const usePaymentDisbursement = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load payment and related disbursement data
  const loadDisbursementData = useCallback(async (paymentId: string): Promise<DisbursementData | null> => {
    setLoading(true);
    setError(null);
    
    try {
      // Fetch payment data
      const { data: paymentData, error: paymentError } = await supabase
        .from('payment')
        .select('*')
        .eq('id', paymentId)
        .single();

      if (paymentError) throw paymentError;

      // Fetch payment splits for this payment
      const { data: splitsData, error: splitsError } = await supabase
        .from('payment_split')
        .select('*')
        .eq('payment_id', paymentId);

      if (splitsError) throw splitsError;

      return {
        payment: paymentData,
        paymentSplits: splitsData || []
      };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load disbursement data';
      setError(errorMessage);
      console.error('Error loading disbursement data:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Update referral fee paid status
  const updateReferralPaid = useCallback(async (paymentId: string, paid: boolean): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const updateData: { referral_fee_paid: boolean; referral_fee_paid_date?: string | null } = {
        referral_fee_paid: paid
      };

      // If marking as paid, set referral_fee_paid_date to now; if unchecking, clear the date
      if (paid) {
        updateData.referral_fee_paid_date = new Date().toISOString();
      } else {
        updateData.referral_fee_paid_date = null;
      }

      const { error } = await supabase
        .from('payment')
        .update(updateData)
        .eq('id', paymentId);

      if (error) throw error;

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update referral payment status';
      setError(errorMessage);
      console.error('Error updating referral paid status:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Update payment split paid status
  const updatePaymentSplitPaid = useCallback(async (splitId: string, paid: boolean): Promise<void> => {
    setLoading(true);
    setError(null);

    console.log('🔧 Updating payment split paid status:', { splitId, paid });

    try {
      const updateData: { paid: boolean; paid_date?: string | null } = { paid };

      // If marking as paid, set paid_date to now; if unchecking, clear the date
      if (paid) {
        updateData.paid_date = new Date().toISOString();
      } else {
        updateData.paid_date = null;
      }

      const { error, data } = await supabase
        .from('payment_split')
        .update(updateData)
        .eq('id', splitId)
        .select();

      if (error) {
        console.error('❌ Supabase error updating payment split:', error);
        throw error;
      }

      console.log('✅ Payment split updated successfully:', data);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update payment split status';
      setError(errorMessage);
      console.error('Error updating payment split paid status:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Calculate disbursement totals
  const calculateDisbursementTotals = useCallback((
    payment: Payment,
    paymentSplits: PaymentSplit[],
    referralFeeUsd?: number
  ) => {
    const paymentAmount = payment.payment_amount || 0;
    
    // Calculate referral disbursement
    const referralAmount = referralFeeUsd || 0;
    const referralDisbursed = (payment.referral_fee_paid && referralAmount > 0) ? referralAmount : 0;

    // Calculate broker disbursements
    const brokerDisbursed = paymentSplits.reduce((sum, split) => {
      return sum + (split.paid ? (split.split_broker_total || 0) : 0);
    }, 0);

    const totalDisbursed = referralDisbursed + brokerDisbursed;
    const remainingBalance = paymentAmount - totalDisbursed;

    // Count items
    const referralItems = referralAmount > 0 ? 1 : 0;
    const brokerItems = paymentSplits.filter(split => (split.split_broker_total || 0) > 0).length;
    const totalItems = referralItems + brokerItems;

    const referralPaidItems = (payment.referral_fee_paid && referralAmount > 0) ? 1 : 0;
    const brokerPaidItems = paymentSplits.filter(split => split.paid && (split.split_broker_total || 0) > 0).length;
    const paidItems = referralPaidItems + brokerPaidItems;

    return {
      paymentAmount,
      referralAmount,
      referralDisbursed,
      brokerDisbursed,
      totalDisbursed,
      remainingBalance,
      totalItems,
      paidItems,
      completionPercentage: totalItems > 0 ? Math.round((paidItems / totalItems) * 100) : 0,
      isOverDisbursed: totalDisbursed > paymentAmount,
      isFullyDisbursed: paidItems === totalItems && totalItems > 0
    };
  }, []);

  // Update payment split paid date only
  const updatePaymentSplitPaidDate = useCallback(async (splitId: string, paidDate: string): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase
        .from('payment_split')
        .update({ paid_date: paidDate })
        .eq('id', splitId);

      if (error) throw error;

      console.log('✅ Payment split paid date updated');

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update payment split date';
      setError(errorMessage);
      console.error('Error updating payment split paid date:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Update referral fee paid date only
  const updateReferralPaidDate = useCallback(async (paymentId: string, paidDate: string): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase
        .from('payment')
        .update({ referral_fee_paid_date: paidDate })
        .eq('id', paymentId);

      if (error) throw error;

      console.log('✅ Referral fee paid date updated');

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update referral paid date';
      setError(errorMessage);
      console.error('Error updating referral paid date:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Validate disbursement amounts
  const validateDisbursement = useCallback((
    paymentAmount: number,
    totalDisbursed: number
  ): { isValid: boolean; message?: string } => {
    if (totalDisbursed > paymentAmount) {
      const overage = totalDisbursed - paymentAmount;
      return {
        isValid: false,
        message: `Disbursements exceed payment by $${overage.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
      };
    }

    return { isValid: true };
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    loading,
    error,
    loadDisbursementData,
    updateReferralPaid,
    updateReferralPaidDate,
    updatePaymentSplitPaid,
    updatePaymentSplitPaidDate,
    calculateDisbursementTotals,
    validateDisbursement,
    clearError
  };
};