import { PaymentSplit } from '../lib/types';

export const usePaymentSplitCalculations = (
  splits: PaymentSplit[], 
  dealAmounts: { origination_usd?: number; site_usd?: number; deal_usd?: number }
) => {
  return splits.map(split => {
    // Calculate this broker's split amounts based on their percentage of each category
    // For each category, the broker gets their percentage of the total category amount
    const calculatedOriginationUsd = (dealAmounts.origination_usd || 0) * ((split.split_origination_percent || 0) / 100);
    const calculatedSiteUsd = (dealAmounts.site_usd || 0) * ((split.split_site_percent || 0) / 100);
    const calculatedDealUsd = (dealAmounts.deal_usd || 0) * ((split.split_deal_percent || 0) / 100);
    const calculatedTotal = calculatedOriginationUsd + calculatedSiteUsd + calculatedDealUsd;

    return {
      ...split,
      split_origination_usd: calculatedOriginationUsd,
      split_site_usd: calculatedSiteUsd,
      split_deal_usd: calculatedDealUsd,
      split_broker_total: calculatedTotal
    };
  });
};