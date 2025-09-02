import React from 'react';
import { formatCurrency } from '../../utils/formatters';

interface DisbursementCheckItemProps {
  payeeName: string;
  amount: number;
  paid: boolean;
  onTogglePaid: (paid: boolean) => void;
  disabled?: boolean;
}

const DisbursementCheckItem: React.FC<DisbursementCheckItemProps> = ({
  payeeName,
  amount,
  paid,
  onTogglePaid,
  disabled = false
}) => {
  const handleToggle = () => {
    if (!disabled) {
      onTogglePaid(!paid);
    }
  };

  return (
    <div 
      className={`
        flex items-center justify-between p-4 rounded-lg border-2 transition-all duration-200 cursor-pointer
        ${paid 
          ? 'bg-green-50 border-green-200 hover:border-green-300' 
          : 'bg-white border-gray-200 hover:border-gray-300'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-sm'}
      `}
      onClick={handleToggle}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
          e.preventDefault();
          handleToggle();
        }
      }}
      aria-label={`${paid ? 'Mark as unpaid' : 'Mark as paid'} - ${payeeName} - ${formatCurrency(amount)}`}
    >
      {/* Left side - Checkbox and payee info */}
      <div className="flex items-center space-x-3 flex-1 min-w-0">
        {/* Custom Checkbox */}
        <div className={`
          flex-shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all duration-200
          ${paid 
            ? 'bg-green-500 border-green-500' 
            : 'bg-white border-gray-300 hover:border-green-400'
          }
        `}>
          {paid && (
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>

        {/* Payee Information */}
        <div className="flex-1 min-w-0">
          <p className={`
            text-sm font-medium truncate transition-colors duration-200
            ${paid ? 'text-green-900' : 'text-gray-900'}
          `}>
            {payeeName}
          </p>
          <p className={`
            text-xs transition-colors duration-200
            ${paid ? 'text-green-700' : 'text-gray-500'}
          `}>
            {paid ? 'Check written' : 'Pending payment'}
          </p>
        </div>
      </div>

      {/* Right side - Amount */}
      <div className="flex-shrink-0 text-right">
        <p className={`
          text-lg font-semibold transition-colors duration-200
          ${paid ? 'text-green-900' : 'text-gray-900'}
        `}>
          {formatCurrency(amount)}
        </p>
        {paid && (
          <div className="flex items-center justify-end mt-1">
            <svg className="w-3 h-3 text-green-600 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-xs text-green-600 font-medium">Paid</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default DisbursementCheckItem;