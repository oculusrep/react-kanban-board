import { PaymentSplit, Deal } from '../lib/types';

export const usePaymentSplitCalculations = (
  splits: PaymentSplit[],
  dealAmounts: { origination_usd?: number; site_usd?: number; deal_usd?: number },
  deal?: Deal,
  paymentAmount?: number
) => {
  // Use database values directly - the database triggers handle all calculations
  // This ensures we always show the correct values from the database
  return splits.map(split => ({
    ...split,
    split_origination_usd: split.split_origination_usd || 0,
    split_site_usd: split.split_site_usd || 0,
    split_deal_usd: split.split_deal_usd || 0,
    split_broker_total: split.split_broker_total || 0
  }));
};