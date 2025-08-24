import React from 'react';
import { Deal, Payment, CommissionSplit } from '../lib/types';
import { usePaymentCalculations } from '../hooks/usePaymentCalculations';

interface PaymentGenerationSectionProps {
  deal: Deal;
  hasPayments: boolean;
  existingPayments?: Payment[];
  commissionSplits?: CommissionSplit[];
  onGeneratePayments: () => Promise<void>;
  onUpdatePaymentAmounts?: () => Promise<void>; // New: Safe update option
  generatingPayments: boolean;
}

const PaymentGenerationSection: React.FC<PaymentGenerationSectionProps> = ({
  deal,
  hasPayments,
  existingPayments = [],
  commissionSplits = [],
  onGeneratePayments,
  onUpdatePaymentAmounts,
  generatingPayments
}) => {
  
  // Use centralized payment calculations hook
  const {
    calculatedPaymentAmount,
    totalCalculatedPayments,
    paymentCommissionBreakdown,
    canGeneratePayments,
    validationMessages,
    paymentComparisons
  } = usePaymentCalculations(deal, existingPayments, commissionSplits);

  const numberOfPayments = deal.number_of_payments || 1;
  
  // Helper function for currency formatting
  const formatUSD = (amount: number): string => {
    return amount.toLocaleString('en-US', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
  };

  // Check if calculated amounts differ from existing payments
  const hasCalculationDifferences = paymentComparisons.some(comp => comp.needs_update);

  // Check if we have fewer payments than configured
  const needsMorePayments = existingPayments.length < numberOfPayments;
  const hasAllPayments = existingPayments.length === numberOfPayments;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">Payment Generation</h3>
        {hasPayments && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            {existingPayments.length} of {numberOfPayments} Payments Created
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Configuration Summary */}
        <div className="space-y-4">
          <h4 className="font-medium text-gray-900">Configuration Summary</h4>
          
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Commission Fee:</span>
              <span className="font-medium">
                {deal.fee ? `$${formatUSD(deal.fee)}` : 'Not set'}
              </span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-600">House Amount:</span>
              <span className="font-medium">
                {paymentCommissionBreakdown.house_usd ? 
                  `$${formatUSD(paymentCommissionBreakdown.house_usd)} (${paymentCommissionBreakdown.house_percent}%)` : 
                  'Not configured'
                }
              </span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-600">AGCI per Payment:</span>
              <span className="font-medium">
                {paymentCommissionBreakdown.agci ? `$${formatUSD(paymentCommissionBreakdown.agci)}` : 'Not calculated'}
              </span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-600">Number of Payments:</span>
              <span className="font-medium">{numberOfPayments}</span>
            </div>
            
            <div className="flex justify-between border-t pt-2">
              <span className="text-gray-600 font-medium">Payment Amount:</span>
              <span className="font-semibold text-blue-600">
                ${formatUSD(calculatedPaymentAmount)}
              </span>
            </div>
          </div>

          {/* Commission Breakdown per Payment */}
          {calculatedPaymentAmount > 0 && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <div className="text-sm font-medium text-blue-800 mb-2">Commission Breakdown (per payment)</div>
              <div className="text-sm text-blue-700 space-y-1">
                <div className="flex justify-between">
                  <span>Origination ({paymentCommissionBreakdown.origination_percent}%):</span>
                  <span>${formatUSD(paymentCommissionBreakdown.origination_usd)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Site ({paymentCommissionBreakdown.site_percent}%):</span>
                  <span>${formatUSD(paymentCommissionBreakdown.site_usd)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Deal ({paymentCommissionBreakdown.deal_percent}%):</span>
                  <span>${formatUSD(paymentCommissionBreakdown.deal_usd)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Validation Messages */}
          {validationMessages.length > 0 && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <div className="text-sm font-medium text-yellow-800 mb-1">Configuration Issues:</div>
              <ul className="text-sm text-yellow-700 space-y-1">
                {validationMessages.map((message, index) => (
                  <li key={index} className="flex items-start">
                    <span className="text-yellow-600 mr-1">•</span>
                    {message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Calculation Differences Warning */}
          {hasPayments && hasCalculationDifferences && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
              <div className="text-sm font-medium text-amber-800 mb-1">⚠️ Calculation Update Available</div>
              <div className="text-sm text-amber-700">
                Existing payment amounts differ from current commission configuration. 
                You can update amounts to match current setup without affecting invoice data.
              </div>
            </div>
          )}
        </div>

        {/* Generation Controls */}
        <div className="space-y-4">
          <h4 className="font-medium text-gray-900">Payment Actions</h4>
          
          <div className="space-y-3">
            {/* Primary Action Button */}
            {!hasAllPayments ? (
              <>
                <button
                  onClick={onGeneratePayments}
                  disabled={!canGeneratePayments || generatingPayments}
                  className={`w-full px-4 py-3 rounded-md font-medium transition-colors ${
                    canGeneratePayments && !generatingPayments
                      ? 'bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {generatingPayments ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      {hasPayments ? 'Creating Additional Payments...' : 'Generating Payments...'}
                    </div>
                  ) : hasPayments ? (
                    `Create Remaining ${numberOfPayments - existingPayments.length} Payments`
                  ) : (
                    `Generate ${numberOfPayments} Payment${numberOfPayments > 1 ? 's' : ''}`
                  )}
                </button>

                {hasPayments && (
                  <div className="text-sm text-blue-600 bg-blue-50 border border-blue-200 rounded-md p-3">
                    <div className="font-medium mb-1">ℹ️ Safe Generation</div>
                    <div>
                      This will create the remaining payments without affecting existing payment records 
                      or their associated invoice data.
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* All payments exist */
              <div className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-md p-3">
                <div className="font-medium mb-1">✅ All Payments Created</div>
                <div>
                  All {numberOfPayments} payments have been created for this deal.
                </div>
              </div>
            )}

            {/* Secondary Action - Update Amounts */}
            {hasPayments && hasCalculationDifferences && onUpdatePaymentAmounts && (
              <button
                onClick={onUpdatePaymentAmounts}
                disabled={generatingPayments}
                className="w-full px-4 py-2 border border-amber-300 bg-amber-50 text-amber-700 rounded-md font-medium hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Update Payment Amounts
              </button>
            )}

            {!canGeneratePayments && (
              <div className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-md p-3">
                <div className="font-medium mb-1">Configuration Required</div>
                <div>
                  Complete commission configuration in the Commission tab before generating payments.
                </div>
              </div>
            )}
          </div>

          {/* Payment Schedule Preview */}
          {canGeneratePayments && numberOfPayments > 1 && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
              <div className="text-sm font-medium text-green-800 mb-2">Payment Schedule Preview</div>
              <div className="text-sm text-green-700 space-y-1">
                {Array.from({ length: numberOfPayments }, (_, i) => {
                  const existingPayment = existingPayments.find(p => p.payment_sequence === i + 1);
                  return (
                    <div key={i} className="flex justify-between">  {/* ✅ Added key={i} */}
                      <span>Payment {i + 1}:</span>
                      <span className={`font-medium ${existingPayment ? 'text-green-600' : ''}`}>
                        ${formatUSD(calculatedPaymentAmount)}
                        {existingPayment && ' ✓'}
                      </span>
                    </div>
                  );
                })}
                <div className="flex justify-between border-t pt-1 font-semibold">
                  <span>Total:</span>
                  <span>${formatUSD(totalCalculatedPayments)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Existing Payments Comparison */}
          {hasPayments && paymentComparisons.length > 0 && (
            <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-md">
              <div className="text-sm font-medium text-gray-800 mb-2">Current vs Calculated</div>
              <div className="text-sm text-gray-700 space-y-1">
                {paymentComparisons.map((comp, index) => (
                  <div key={index} className="flex justify-between">
                    <span>Payment {index + 1}:</span>
                    <span className={comp.needs_update ? 'text-amber-700 font-medium' : 'text-gray-600'}>
                      ${formatUSD(comp.database_amount)} → ${formatUSD(comp.calculated_amount)}
                      {comp.needs_update && ' ⚠️'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentGenerationSection;