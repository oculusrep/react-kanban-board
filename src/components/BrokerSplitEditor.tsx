import React from 'react';
import { PaymentSplit } from '../lib/types';
import PercentageInput from './PercentageInput';
import { ValidationTotals } from '../hooks/usePaymentSplitValidation';

interface BrokerSplitEditorProps {
  split: PaymentSplit;
  brokerName: string;
  paymentAmount: number;
  onPercentageChange: (field: string, value: number | null) => void;
  validationTotals?: ValidationTotals;
  onPaidChange?: (splitId: string, paid: boolean) => void;
  onPaidDateChange?: (splitId: string, date: string) => void;
}

const BrokerSplitEditor: React.FC<BrokerSplitEditorProps> = ({
  split,
  brokerName,
  paymentAmount,
  onPercentageChange,
  validationTotals,
  onPaidChange,
  onPaidDateChange
}) => {
  return (
    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
      <div className="space-y-2 mb-4">
        <div className="flex justify-between items-start">
          <div>
            <h5 className="text-sm font-medium text-gray-900">{brokerName}</h5>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm font-semibold text-gray-900">
              ${(split.split_broker_total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            {onPaidChange && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={split.paid || false}
                  onChange={(e) => onPaidChange(split.id, e.target.checked)}
                  className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                />
                <span className="text-xs text-gray-600">Paid</span>
              </label>
            )}
          </div>
        </div>

        {/* Paid Date Input - shown when paid is checked */}
        {split.paid && onPaidDateChange && (
          <div className="flex items-center gap-2 justify-end">
            <span className="text-xs text-gray-600">Paid on:</span>
            <input
              type="date"
              value={split.paid_date ? new Date(split.paid_date).toISOString().split('T')[0] : ''}
              onChange={(e) => onPaidDateChange(split.id, e.target.value)}
              className="text-xs border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-green-500 focus:border-green-500"
            />
          </div>
        )}
      </div>
      
      {/* Split Percentages Grid */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white rounded-md p-2 border border-gray-200">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Origination</div>
          <PercentageInput
            label=""
            value={split.split_origination_percent || 0}
            onChange={(newValue) => onPercentageChange('split_origination_percent', newValue)}
          />
          <div className="text-xs text-gray-500 mt-1">${(split.split_origination_usd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
        <div className="bg-white rounded-md p-2 border border-gray-200">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Site</div>
          <PercentageInput
            label=""
            value={split.split_site_percent || 0}
            onChange={(newValue) => onPercentageChange('split_site_percent', newValue)}
          />
          <div className="text-xs text-gray-500 mt-1">${(split.split_site_usd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
        <div className="bg-white rounded-md p-2 border border-gray-200">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Deal</div>
          <PercentageInput
            label=""
            value={split.split_deal_percent || 0}
            onChange={(newValue) => onPercentageChange('split_deal_percent', newValue)}
          />
          <div className="text-xs text-gray-500 mt-1">${(split.split_deal_usd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
        <div className="bg-white rounded-md p-2 border border-gray-200">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Total</div>
          <div className={`text-sm font-semibold ${
            validationTotals && !validationTotals.isValid ? 'text-red-600' : 'text-blue-600'
          }`}>
            ${(split.split_broker_total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          {validationTotals && !validationTotals.isValid && (
            <div className="text-xs text-red-500 mt-1">
              Check totals
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BrokerSplitEditor;