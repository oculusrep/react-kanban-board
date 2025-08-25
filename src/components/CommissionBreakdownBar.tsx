import React from 'react';
import { Deal } from '../lib/types';
import { useCommissionCalculations } from '../hooks/useCommissionCalculations';

interface CommissionBreakdownBarProps {
  deal: Deal;
  commissionSplits?: any[];
  onEditClick?: () => void;
  className?: string;
}

const CommissionBreakdownBar: React.FC<CommissionBreakdownBarProps> = ({ 
  deal, 
  commissionSplits = [], 
  onEditClick, 
  className = "" 
}) => {
  // Use existing commission calculations hook
  const { baseAmounts } = useCommissionCalculations(deal, commissionSplits);

  const {
    gci,
    houseUsd,
    agci,
    originationPercent,
    sitePercent,
    dealPercent,
    originationUSD,
    siteUSD,
    dealUSD,
    totalDealUSD
  } = baseAmounts;

  // Calculate referral fee (comes first in waterfall)
  const totalCommission = deal.fee || 0;
  const referralFeePercent = deal.referral_fee_percent || 0;
  const referralFeeUSD = deal.referral_fee_usd || ((referralFeePercent / 100) * totalCommission);
  const afterReferral = totalCommission - referralFeeUSD;

  // Format currency for display
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Calculate segment widths as percentages of total commission
  const housePercent = totalCommission > 0 ? (houseUsd / totalCommission) * 100 : 0;
  const agciPercent = totalCommission > 0 ? (agci / totalCommission) * 100 : 0;
  
  // Calculate widths for visual segments
  const referralWidth = totalCommission > 0 ? (referralFeeUSD / totalCommission) * 100 : 0;
  const houseWidth = totalCommission > 0 ? (houseUsd / totalCommission) * 100 : 0;
  const originationWidth = totalCommission > 0 ? (originationUSD / totalCommission) * 100 : 0;
  const siteWidth = totalCommission > 0 ? (siteUSD / totalCommission) * 100 : 0;
  const dealWidth = totalCommission > 0 ? (dealUSD / totalCommission) * 100 : 0;
  
  // Check if we have any commission breakdown to display
  const hasCommissionBreakdown = referralWidth > 0 || houseWidth > 0 || originationWidth > 0 || siteWidth > 0 || dealWidth > 0;

  // Don't render if no commission data
  if (!deal.fee || deal.fee === 0) {
    return (
      <div className={`bg-white rounded-lg border p-4 ${className}`}>
        <div className="text-sm text-gray-500">
          Commission breakdown will appear when commission fee is set
        </div>
        {onEditClick && (
          <button
            onClick={onEditClick}
            className="mt-2 text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            Set Commission Details →
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg border p-4 ${className}`}>
      {/* Header with corrected waterfall flow */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4">
        <div className="flex items-center flex-wrap gap-x-4 gap-y-2 text-sm">
          <span className="font-medium text-gray-900">
            Total Commission: <span className="text-green-600">{formatCurrency(totalCommission)}</span>
          </span>
          {referralFeeUSD > 0 && (
            <>
              <span className="text-gray-400">→</span>
              <span className="text-gray-600">
                Referral: <span className="text-orange-600">{formatCurrency(referralFeeUSD)}</span>
              </span>
            </>
          )}
          {houseUsd > 0 && (
            <>
              <span className="text-gray-400">→</span>
              <span className="text-gray-600">
                House: <span className="text-gray-600">{formatCurrency(houseUsd)}</span>
              </span>
            </>
          )}
          <span className="text-gray-400">→</span>
          <span className="text-gray-600">
            AGCI: <span className="text-blue-600 font-medium">{formatCurrency(agci)}</span>
          </span>
        </div>
        
        {onEditClick && (
          <button
            onClick={onEditClick}
            className="mt-2 sm:mt-0 px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors"
          >
            Edit Commission
          </button>
        )}
      </div>

      {/* Progress bar visualization */}
      {hasCommissionBreakdown && (
        <div className="space-y-3">
          {/* 5-segment bar with correct business flow */}
          <div className="flex h-8 bg-gray-200 rounded-lg overflow-hidden">
            {/* Referral segment */}
            {referralWidth > 0 && (
              <div
                className="bg-orange-500 flex items-center justify-center relative group"
                style={{ width: `${referralWidth}%` }}
                title={`Referral: ${referralFeePercent}% of total - ${formatCurrency(referralFeeUSD)}`}
              >
                {referralWidth > 15 && (
                  <span className="text-white text-xs font-medium">
                    {referralFeePercent.toFixed(1)}%
                  </span>
                )}
              </div>
            )}
            
            {/* House segment */}
            {houseWidth > 0 && (
              <div
                className="bg-gray-500 flex items-center justify-center relative group"
                style={{ width: `${houseWidth}%` }}
                title={`House: ${housePercent.toFixed(1)}% of total - ${formatCurrency(houseUsd)}`}
              >
                {houseWidth > 15 && (
                  <span className="text-white text-xs font-medium">
                    {housePercent.toFixed(1)}%
                  </span>
                )}
              </div>
            )}

            {/* Origination segment */}
            {originationWidth > 0 && (
              <div
                className="bg-blue-500 flex items-center justify-center relative group"
                style={{ width: `${originationWidth}%` }}
                title={`Origination: ${originationPercent}% of AGCI - ${formatCurrency(originationUSD)}`}
              >
                {originationWidth > 15 && (
                  <span className="text-white text-xs font-medium">
                    {originationPercent}%
                  </span>
                )}
              </div>
            )}
            
            {/* Site segment */}
            {siteWidth > 0 && (
              <div
                className="bg-green-500 flex items-center justify-center relative group"
                style={{ width: `${siteWidth}%` }}
                title={`Site: ${sitePercent}% of AGCI - ${formatCurrency(siteUSD)}`}
              >
                {siteWidth > 15 && (
                  <span className="text-white text-xs font-medium">
                    {sitePercent}%
                  </span>
                )}
              </div>
            )}
            
            {/* Deal segment */}
            {dealWidth > 0 && (
              <div
                className="bg-purple-500 flex items-center justify-center relative group"
                style={{ width: `${dealWidth}%` }}
                title={`Deal: ${dealPercent}% of AGCI - ${formatCurrency(dealUSD)}`}
              >
                {dealWidth > 15 && (
                  <span className="text-white text-xs font-medium">
                    {dealPercent}%
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Labels and amounts - single line with flexbox */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {/* Referral */}
            {referralFeeUSD > 0 && (
              <div className="flex items-center">
                <div className="w-3 h-3 bg-orange-500 rounded mr-2"></div>
                <span className="text-sm text-gray-900">
                  <span className="font-medium">Referral</span> {formatCurrency(referralFeeUSD)}
                </span>
              </div>
            )}

            {/* House */}
            {houseUsd > 0 && (
              <div className="flex items-center">
                <div className="w-3 h-3 bg-gray-500 rounded mr-2"></div>
                <span className="text-sm text-gray-900">
                  <span className="font-medium">House</span> {formatCurrency(houseUsd)}
                </span>
              </div>
            )}

            {/* Origination */}
            {originationPercent > 0 && (
              <div className="flex items-center">
                <div className="w-3 h-3 bg-blue-500 rounded mr-2"></div>
                <span className="text-sm text-gray-900">
                  <span className="font-medium">Origination</span> {formatCurrency(originationUSD)}
                </span>
              </div>
            )}

            {/* Site */}
            {sitePercent > 0 && (
              <div className="flex items-center">
                <div className="w-3 h-3 bg-green-500 rounded mr-2"></div>
                <span className="text-sm text-gray-900">
                  <span className="font-medium">Site</span> {formatCurrency(siteUSD)}
                </span>
              </div>
            )}

            {/* Deal */}
            {dealPercent > 0 && (
              <div className="flex items-center">
                <div className="w-3 h-3 bg-purple-500 rounded mr-2"></div>
                <span className="text-sm text-gray-900">
                  <span className="font-medium">Deal</span> {formatCurrency(dealUSD)}
                </span>
              </div>
            )}
          </div>

          {/* Total breakdown verification */}
          {totalDealUSD !== agci && agci > 0 && (
            <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
              ⚠️ Commission percentages don't total to 100% of AGCI
            </div>
          )}
        </div>
      )}

      {/* Empty state when percentages not configured */}
      {!hasCommissionBreakdown && (
        <div className="text-center py-4">
          <div className="text-sm text-gray-500 mb-2">
            Commission breakdown percentages not configured
          </div>
          {onEditClick && (
            <button
              onClick={onEditClick}
              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              Configure Commission Splits →
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default CommissionBreakdownBar;