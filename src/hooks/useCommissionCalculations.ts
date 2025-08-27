import { useMemo } from 'react';

// Commission calculation hook - centralized logic for deal and broker split calculations
export const useCommissionCalculations = (deal: any, commissionSplits: any[] = []) => {
  return useMemo(() => {
    // Base deal calculations (AGCI-based from confirmed working logic)
    const gci = deal?.fee || 0; // Use deal.fee (total commission) consistently with payments
    const referralFeeUsd = deal?.referral_fee_usd || 0;
    const houseUsd = deal?.house_usd || 0;
    const agci = gci - referralFeeUsd - houseUsd; // After GCI = Fee - Referral - House USD

    // Deal-level percentages
    const originationPercent = deal?.origination_percent || 0;
    const sitePercent = deal?.site_percent || 0;
    const dealPercent = deal?.deal_percent || 0;

    // Deal-level USD amounts (calculated from AGCI, not GCI)
    const originationUSD = (originationPercent / 100) * agci;
    const siteUSD = (sitePercent / 100) * agci;
    const dealUSD = (dealPercent / 100) * agci;

    // Total deal amounts
    const totalDealUSD = originationUSD + siteUSD + dealUSD;

    // Broker split calculations
    const brokerSplits = commissionSplits.map((split) => {
      // Use exact field names from database schema
      const splitOriginationPercent = split?.split_origination_percent || 0;
      const splitSitePercent = split?.split_site_percent || 0;
      const splitDealPercent = split?.split_deal_percent || 0;

      // Calculate USD amounts based on deal-level amounts
      const originationSplitUSD = (splitOriginationPercent / 100) * originationUSD;
      const siteSplitUSD = (splitSitePercent / 100) * siteUSD;
      const dealSplitUSD = (splitDealPercent / 100) * dealUSD;
      const totalUSD = originationSplitUSD + siteSplitUSD + dealSplitUSD;

      return {
        ...split,
        // Calculated amounts
        calculatedOriginationUSD: originationSplitUSD,
        calculatedSiteUSD: siteSplitUSD,
        calculatedDealUSD: dealSplitUSD,
        calculatedTotalUSD: totalUSD,
      };
    });

    // Total percentages for validation
    const totalOriginationPercent = brokerSplits.reduce(
      (sum, split) => sum + (split.split_origination_percent || 0), 0
    );
    const totalSitePercent = brokerSplits.reduce(
      (sum, split) => sum + (split.split_site_percent || 0), 0
    );
    const totalDealPercent = brokerSplits.reduce(
      (sum, split) => sum + (split.split_deal_percent || 0), 0
    );

    // Total broker USD amounts
    const totalBrokerUSD = brokerSplits.reduce(
      (sum, split) => sum + split.calculatedTotalUSD, 0
    );

    return {
      // Base deal amounts
      baseAmounts: {
        gci,
        referralFeeUsd,
        houseUsd,
        agci,
        originationPercent,
        sitePercent,
        dealPercent,
        originationUSD,
        siteUSD,
        dealUSD,
        totalDealUSD,
      },
      
      // Broker split data with calculations
      brokerSplits,
      
      // Totals for validation
      totals: {
        originationPercent: totalOriginationPercent,
        sitePercent: totalSitePercent,
        dealPercent: totalDealPercent,
        brokerUSD: totalBrokerUSD,
      },
      
      // Validation helpers
      validation: {
        isOriginationValid: totalOriginationPercent <= 100,
        isSiteValid: totalSitePercent <= 100,
        isDealValid: totalDealPercent <= 100,
        areAllValid: totalOriginationPercent <= 100 && totalSitePercent <= 100 && totalDealPercent <= 100,
      }
    };
  }, [deal, commissionSplits]);
};