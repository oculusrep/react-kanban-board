import React from 'react';
import { Deal } from '../lib/types';

interface PaymentGenerationSectionProps {
  deal: Deal;
  hasPayments: boolean;
  onGeneratePayments: () => Promise<void>;
  generatingPayments: boolean;
}

const PaymentGenerationSection: React.FC<PaymentGenerationSectionProps> = ({
  deal,
  hasPayments,
  onGeneratePayments,
  generatingPayments
}) => {
  
  const commissionConfigured = deal.fee && deal.fee > 0;
  const numberOfPayments = deal.number_of_payments || 1;
  
  // Check if commission details are sufficient for payment generation
  const canGeneratePayments = commissionConfigured;
  
  // Generate warning messages for incomplete configuration
  const getWarningMessages = () => {
    const warnings: string[] = [];
    
    if (!deal.fee || deal.fee <= 0) {
      warnings.push('Commission fee is not set');
    }
    
    if (!deal.agci || deal.agci <= 0) {
      warnings.push('Adjusted GCI (AGCI) is not calculated');
    }
    
    if (!numberOfPayments || numberOfPayments < 1) {
      warnings.push('Number of payments is not set');
    }
    
    return warnings;
  };

  const warnings = getWarningMessages();

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Payment Generation</h3>
        {hasPayments && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            Payments Generated
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
                {deal.fee ? `$${deal.fee.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Not set'}
              </span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-600">Adjusted GCI:</span>
              <span className="font-medium">
                {deal.agci ? `$${deal.agci.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Not calculated'}
              </span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-600">Number of Payments:</span>
              <span className="font-medium">{numberOfPayments}</span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-600">Payment Amount:</span>
              <span className="font-medium">
                {deal.agci && numberOfPayments ? 
                  `$${(deal.agci / numberOfPayments).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 
                  'TBD'
                }
              </span>
            </div>
          </div>

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <div className="text-sm font-medium text-yellow-800 mb-1">Configuration Issues:</div>
              <ul className="text-sm text-yellow-700 space-y-1">
                {warnings.map((warning, index) => (
                  <li key={index} className="flex items-start">
                    <span className="text-yellow-600 mr-1">•</span>
                    {warning}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Generation Controls */}
        <div className="space-y-4">
          <h4 className="font-medium text-gray-900">Generation Controls</h4>
          
          <div className="space-y-3">
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
                  Generating Payments...
                </div>
              ) : hasPayments ? (
                'Regenerate Payments'
              ) : (
                'Generate Payments'
              )}
            </button>

            {hasPayments && (
              <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-md p-3">
                <div className="font-medium mb-1">⚠️ Regeneration Warning</div>
                <div>
                  Regenerating payments will delete existing payments and create new ones. 
                  This action cannot be undone.
                </div>
              </div>
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
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <div className="text-sm font-medium text-blue-800 mb-2">Payment Schedule Preview</div>
              <div className="text-sm text-blue-700 space-y-1">
                {Array.from({ length: numberOfPayments }, (_, i) => (
                  <div key={i} className="flex justify-between">
                    <span>Payment {i + 1}:</span>
                    <span>
                      ${deal.agci ? (deal.agci / numberOfPayments).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
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