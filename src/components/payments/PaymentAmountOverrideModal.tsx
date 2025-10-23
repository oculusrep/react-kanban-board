import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';

interface PaymentAmountOverrideModalProps {
  isOpen: boolean;
  onClose: () => void;
  paymentId: string;
  currentAmount: number;
  paymentSequence: number;
  dealName: string;
  onSuccess: () => void;
}

const PaymentAmountOverrideModal: React.FC<PaymentAmountOverrideModalProps> = ({
  isOpen,
  onClose,
  paymentId,
  currentAmount,
  paymentSequence,
  dealName,
  onSuccess,
}) => {
  const [overrideAmount, setOverrideAmount] = useState<string>('');
  const [displayValue, setDisplayValue] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setOverrideAmount(currentAmount.toString());
      setDisplayValue(formatCurrency(currentAmount));
      setError(null);
    }
  }, [isOpen, currentAmount]);

  const formatCurrency = (value: number | string): string => {
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(numValue)) return '';
    return numValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    // Remove all non-digit and non-decimal characters
    const cleaned = input.replace(/[^\d.]/g, '');

    // Prevent multiple decimal points
    const parts = cleaned.split('.');
    const formatted = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : cleaned;

    setOverrideAmount(formatted);

    // Format for display
    if (formatted) {
      const numValue = parseFloat(formatted);
      if (!isNaN(numValue)) {
        setDisplayValue(formatCurrency(numValue));
      } else {
        setDisplayValue(formatted);
      }
    } else {
      setDisplayValue('');
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    // Show raw number when focused
    e.target.value = overrideAmount;
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    // Show formatted number when blurred
    if (overrideAmount) {
      const numValue = parseFloat(overrideAmount);
      if (!isNaN(numValue)) {
        setDisplayValue(formatCurrency(numValue));
        e.target.value = formatCurrency(numValue);
      }
    }
  };

  const handleSave = async () => {
    const newAmount = parseFloat(overrideAmount);
    console.log('[Override] Attempting to save:', { paymentId, currentAmount, newAmount, overrideAmount });

    if (isNaN(newAmount) || newAmount <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Try to update with override columns first
      const updateData: any = {
        payment_amount: newAmount,
      };

      // Update payment amount and set override flag in a single transaction
      // The database triggers now respect the amount_override flag
      try {
        console.log('[Override] Updating payment_amount to', newAmount, 'with override flag...');
        const { data, error: updateError } = await supabase
          .from('payment')
          .update({
            payment_amount: newAmount,
            amount_override: true,
            override_at: new Date().toISOString(),
          })
          .eq('id', paymentId)
          .select();

        console.log('[Override] Update result:', { data, error: updateError });

        if (updateError) {
          // Check if error is about missing column
          if (updateError.message.includes("amount_override") || updateError.message.includes("schema cache")) {
            // Column doesn't exist yet - just update the amount
            console.warn('[Override] Override columns not found - updating payment_amount only. Please run migrations.');
            const { data: fallbackData, error: fallbackError } = await supabase
              .from('payment')
              .update(updateData)
              .eq('id', paymentId)
              .select();

            console.log('[Override] Fallback update result:', { data: fallbackData, error: fallbackError });
            if (fallbackError) throw fallbackError;
          } else {
            throw updateError;
          }
        }
      } catch (err: any) {
        throw err;
      }

      console.log('[Override] Update successful, calling onSuccess...');
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('[Override] Error updating payment override:', err);
      const errorMessage = err?.message || err?.error_description || 'Failed to update payment amount';
      setError(errorMessage);

      // Show alert for network errors
      if (errorMessage.includes('fetch') || errorMessage.includes('network') || errorMessage.includes('ERR_CONNECTION')) {
        alert('Network error: Unable to connect to the database. Please check your connection and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50"
      onClick={onClose}
    >
      <div
        className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mt-3">
          <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">
            Override Payment Amount
          </h3>
          <div className="mt-2 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Deal</label>
              <div className="mt-1 text-sm text-gray-900">{dealName}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Payment #</label>
              <div className="mt-1 text-sm text-gray-900">{paymentSequence}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Current Amount</label>
              <div className="mt-1 text-sm text-gray-900">
                ${currentAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">New Amount</label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-gray-500 sm:text-sm">$</span>
                </div>
                <input
                  type="text"
                  defaultValue={displayValue}
                  onChange={handleInputChange}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                  className="block w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="0.00"
                />
              </div>
            </div>
            {error && (
              <div className="bg-red-50 border-l-4 border-red-400 p-4">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-yellow-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-yellow-700">
                    This will lock the amount and prevent automatic recalculation when deal fee or
                    number of payments changes.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-5 sm:mt-6 flex space-x-3">
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex-1 inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:text-sm disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Override'}
            </button>
            <button
              onClick={onClose}
              className="flex-1 inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentAmountOverrideModal;
