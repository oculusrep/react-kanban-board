import { useMemo } from 'react';
import { Deal, Payment, PaymentSplit, CommissionSplit } from '../lib/types';

interface PaymentCalculationsResult {
  // Payment Generation Calculations
  calculatedPaymentAmount: number;
  totalCalculatedPayments: number;
  
  // Per-Payment Commission Breakdown
  paymentCommissionBreakdown: {
    gci: number;
    house_usd: number;
    house_percent: number;
    agci: number;
    origination_percent: number;
    origination_usd: number;
    site_percent: number;
    site_usd: number;
    deal_percent: number;
    deal_usd: number;
  };
  
  // Broker Split Calculations per Payment
  calculateBrokerSplitsForPayment: (commissionSplits: CommissionSplit[]) => PaymentBrokerSplit[];
  
  // Validation & Status
  canGeneratePayments: boolean;
  validationMessages: string[];
  
  // Comparison with existing payments (for hybrid data strategy)
  paymentComparisons: Array<{
    payment_id: string;
    calculated_amount: number;
    database_amount: number;
    needs_update: boolean;
  }>;
}

interface PaymentBrokerSplit {
  broker_id: string;
  origination_amount: number;
  site_amount: number;
  deal_amount: number;
  total_amount: number;
}

export const usePaymentCalculations = (
  deal: Deal,
  existingPayments: Payment[] = [],
  commissionSplits: CommissionSplit[] = []
): PaymentCalculationsResult => {

  // Helper function for safe currency formatting
  const formatUSD = (amount: number | null | undefined): string => {
    return (amount || 0).toLocaleString('en-US', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
  };

  // Core payment generation calculations
  const paymentCalculations = useMemo(() => {
    const totalCommissionFee = deal.fee || 0;
    const numberOfPayments = deal.number_of_payments || 1;
    
    // Payment amount calculation (use commission fee, not AGCI)
    const calculatedPaymentAmount = numberOfPayments > 0 ? totalCommissionFee / numberOfPayments : 0;
    const totalCalculatedPayments = calculatedPaymentAmount * numberOfPayments;
    
    return {
      calculatedPaymentAmount,
      totalCalculatedPayments
    };
  }, [deal.fee, deal.number_of_payments]);

  // Per-payment commission breakdown (same percentages as deal, applied to payment amount)
  const paymentCommissionBreakdown = useMemo(() => {
    const paymentAmount = paymentCalculations.calculatedPaymentAmount;
    
    // House calculation
    const house_percent = deal.house_percent || 0;
    const house_usd = (house_percent / 100) * paymentAmount;
    
    // AGCI calculation (payment amount minus house)
    const agci = paymentAmount - house_usd;
    
    // Commission split percentages
    const origination_percent = deal.origination_percent || 0;
    const site_percent = deal.site_percent || 0;
    const deal_percent = deal.deal_percent || 0;
    
    // Commission split amounts (applied to AGCI)
    const origination_usd = (origination_percent / 100) * agci;
    const site_usd = (site_percent / 100) * agci;
    const deal_usd = (deal_percent / 100) * agci;
    
    return {
      gci: paymentAmount,
      house_usd,
      house_percent,
      agci,
      origination_percent,
      origination_usd,
      site_percent,
      site_usd,
      deal_percent,
      deal_usd
    };
  }, [
    paymentCalculations.calculatedPaymentAmount,
    deal.house_percent,
    deal.origination_percent,
    deal.site_percent,
    deal.deal_percent
  ]);

  // Function to calculate broker splits for a payment
  const calculateBrokerSplitsForPayment = useMemo(() => {
    return (splits: CommissionSplit[]): PaymentBrokerSplit[] => {
      return splits.map(split => {
        // Calculate broker amounts based on their split percentages and payment commission breakdown
        const origination_amount = (split.split_origination_percent || 0) / 100 * paymentCommissionBreakdown.origination_usd;
        const site_amount = (split.split_site_percent || 0) / 100 * paymentCommissionBreakdown.site_usd;
        const deal_amount = (split.split_deal_percent || 0) / 100 * paymentCommissionBreakdown.deal_usd;
        const total_amount = origination_amount + site_amount + deal_amount;
        
        return {
          broker_id: split.broker_id || '',
          origination_amount,
          site_amount,
          deal_amount,
          total_amount
        };
      });
    };
  }, [paymentCommissionBreakdown]);

  // Validation for payment generation
  const validation = useMemo(() => {
    const messages: string[] = [];
    let canGenerate = true;
    
    if (!deal.fee || deal.fee <= 0) {
      messages.push('Commission fee is not set');
      canGenerate = false;
    }
    
    if (!deal.number_of_payments || deal.number_of_payments < 1) {
      messages.push('Number of payments must be at least 1');
      canGenerate = false;
    }
    
    if (deal.number_of_payments && deal.number_of_payments > 10) {
      messages.push('Number of payments cannot exceed 10');
      canGenerate = false;
    }
    
    // Check if commission percentages are configured (optional warning)
    const totalPercent = (deal.origination_percent || 0) + (deal.site_percent || 0) + (deal.deal_percent || 0);
    if (totalPercent === 0) {
      messages.push('Commission split percentages are not configured');
    }
    
    return {
      canGeneratePayments: canGenerate,
      validationMessages: messages
    };
  }, [
    deal.fee,
    deal.number_of_payments,
    deal.origination_percent,
    deal.site_percent,
    deal.deal_percent
  ]);

  // Compare calculated vs existing payment amounts (hybrid data strategy)
  const paymentComparisons = useMemo(() => {
    return existingPayments.map(payment => ({
      payment_id: payment.payment_id, // Use 'payment_id' field to match existing code
      calculated_amount: paymentCalculations.calculatedPaymentAmount,
      database_amount: payment.payment_amount || 0,
      needs_update: Math.abs((payment.payment_amount || 0) - paymentCalculations.calculatedPaymentAmount) > 0.01
    }));
  }, [existingPayments, paymentCalculations.calculatedPaymentAmount]);

  return {
    calculatedPaymentAmount: paymentCalculations.calculatedPaymentAmount,
    totalCalculatedPayments: paymentCalculations.totalCalculatedPayments,
    paymentCommissionBreakdown,
    calculateBrokerSplitsForPayment,
    canGeneratePayments: validation.canGeneratePayments,
    validationMessages: validation.validationMessages,
    paymentComparisons
  };
};