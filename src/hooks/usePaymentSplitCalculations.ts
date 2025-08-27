import { PaymentSplit, Deal } from '../lib/types';

export const usePaymentSplitCalculations = (
  splits: PaymentSplit[], 
  dealAmounts: { origination_usd?: number; site_usd?: number; deal_usd?: number },
  deal?: Deal,
  paymentAmount?: number
) => {
  return splits.map(split => {
    // Hybrid approach: Use database values as fallback, but recalculate for real-time updates
    // This ensures consistency with database logic while providing responsive UX
    
    let calculatedOriginationUsd = split.split_origination_usd || 0;
    let calculatedSiteUsd = split.split_site_usd || 0;
    let calculatedDealUsd = split.split_deal_usd || 0;
    let calculatedTotal = split.split_broker_total || 0;
    
    // If we have deal info and payment amount, recalculate for real-time updates
    // This matches the database calculation logic
    if (deal && paymentAmount) {
      const numberOfPayments = deal.number_of_payments || 1;
      
      // Calculate payment-level AGCI (same logic as database/migration)
      const referralFeeUSD = (deal.referral_fee_usd || 0) / numberOfPayments;
      const houseFeeUSD = (deal.house_usd || 0) / numberOfPayments;
      const paymentAGCI = paymentAmount - referralFeeUSD - houseFeeUSD;
      
      // Calculate deal-level amounts for this payment (same logic as useCommissionCalculations)
      const paymentOriginationUSD = ((deal.origination_percent || 0) / 100) * paymentAGCI;
      const paymentSiteUSD = ((deal.site_percent || 0) / 100) * paymentAGCI;
      const paymentDealUSD = ((deal.deal_percent || 0) / 100) * paymentAGCI;
      
      // Apply broker split percentages (same logic as database)
      calculatedOriginationUsd = (paymentOriginationUSD * (split.split_origination_percent || 0)) / 100;
      calculatedSiteUsd = (paymentSiteUSD * (split.split_site_percent || 0)) / 100;
      calculatedDealUsd = (paymentDealUSD * (split.split_deal_percent || 0)) / 100;
      calculatedTotal = calculatedOriginationUsd + calculatedSiteUsd + calculatedDealUsd;
    }

    return {
      ...split,
      split_origination_usd: calculatedOriginationUsd,
      split_site_usd: calculatedSiteUsd,
      split_deal_usd: calculatedDealUsd,
      split_broker_total: calculatedTotal
    };
  });
};