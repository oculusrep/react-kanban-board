import { PaymentSplit } from '../lib/types';

export interface ValidationTotals {
  deal: number;
  site: number;
  origination: number;
  isValid: boolean;
}

export const usePaymentSplitValidation = (splits: PaymentSplit[]): ValidationTotals => {
  const totals: ValidationTotals = {
    deal: 0,
    site: 0,
    origination: 0,
    isValid: true
  };

  // Calculate totals across all brokers for this payment
  splits.forEach(split => {
    totals.deal += (split.split_deal_percent || 0);
    totals.site += (split.split_site_percent || 0);
    totals.origination += (split.split_origination_percent || 0);
  });

  // Check if any category doesn't equal 100%
  totals.isValid = totals.deal === 100 && totals.site === 100 && totals.origination === 100;

  return totals;
};