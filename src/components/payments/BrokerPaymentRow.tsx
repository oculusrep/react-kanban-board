// Broker Payment Row with Paid Checkbox
// src/components/payments/BrokerPaymentRow.tsx

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { BrokerPaymentSplit } from '../../types/payment-dashboard';

interface BrokerPaymentRowProps {
  split: BrokerPaymentSplit;
  paymentId: string;
  dealName?: string;
  paymentName?: string;
  onUpdate: () => void;
  onOptimisticUpdate?: (splitId: string, updates: { paid?: boolean; paid_date?: string | null }) => void;
}

interface QBCommissionResult {
  success: boolean;
  message?: string;
  qbEntityType?: 'Bill' | 'JournalEntry';
  qbDocNumber?: string;
  alreadyExists?: boolean;
  notFound?: boolean;
  error?: string;
}

interface ArtyCommissionResult {
  success: boolean;
  broker_name: string;
  deal_name: string;
  gross_commission: number;
  draw_balance: number;
  net_payment: number;
  journal_entry?: {
    id: string;
    doc_number: string;
  };
  bill?: {
    id: string;
    doc_number: string;
  };
  email_sent?: boolean;
  error?: string;
}

interface ArtyCommissionPreview {
  broker_name: string;
  deal_name: string;
  payment_name: string;
  gross_commission: number;
  draw_balance: number;
  net_payment: number;
}

const BrokerPaymentRow: React.FC<BrokerPaymentRowProps> = ({ split, paymentId, dealName, paymentName, onUpdate, onOptimisticUpdate }) => {
  const [showQboConfirmDialog, setShowQboConfirmDialog] = useState(false);
  const [pendingPaidState, setPendingPaidState] = useState<boolean | null>(null);

  // Arty commission processing state
  const [showArtyCommissionModal, setShowArtyCommissionModal] = useState(false);
  const [artyPreview, setArtyPreview] = useState<ArtyCommissionPreview | null>(null);
  const [isLoadingArtyPreview, setIsLoadingArtyPreview] = useState(false);
  const [isProcessingArty, setIsProcessingArty] = useState(false);
  const [artyResult, setArtyResult] = useState<ArtyCommissionResult | null>(null);

  const isArty = split.broker_name?.toLowerCase().includes('arty');

  const formatCurrency = (amount: number | null) => {
    if (amount === null) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatPercent = (percent: number | null) => {
    if (percent === null) return '';
    return `${Math.round(percent)}%`;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getLocalDateString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [localPaid, setLocalPaid] = useState(split.paid);
  const [localPaidDate, setLocalPaidDate] = useState(split.paid_date);
  const [isCreatingQBEntry, setIsCreatingQBEntry] = useState(false);

  // Sync with props when they change
  useEffect(() => {
    setLocalPaid(split.paid);
    setLocalPaidDate(split.paid_date);
  }, [split.paid, split.paid_date]);

  // Fetch Arty commission preview (without processing)
  const fetchArtyPreview = async () => {
    setIsLoadingArtyPreview(true);
    try {
      // Use the process-arty-commission function in preview_only mode
      const { data, error } = await supabase.functions.invoke('process-arty-commission', {
        body: {
          payment_split_id: split.payment_split_id,
          preview_only: true,
        },
      });

      console.log('[ArtyPreview] Response:', { data, error });

      if (error) {
        throw new Error(error.message);
      }

      // Check if the response indicates an error (status 500 case)
      if (data?.success === false && data?.error) {
        throw new Error(data.error);
      }

      setArtyPreview({
        broker_name: data.broker_name,
        deal_name: data.deal_name,
        payment_name: paymentName || 'Payment',
        gross_commission: data.gross_commission,
        draw_balance: data.draw_balance,
        net_payment: data.net_payment,
      });
    } catch (err) {
      console.error('Error fetching Arty preview:', err);
      // Fallback to just showing gross commission
      setArtyPreview({
        broker_name: split.broker_name,
        deal_name: dealName || 'Unknown Deal',
        payment_name: paymentName || 'Payment',
        gross_commission: Number(split.split_broker_total) || 0,
        draw_balance: 0,
        net_payment: Number(split.split_broker_total) || 0,
      });
    } finally {
      setIsLoadingArtyPreview(false);
    }
  };

  // Process Arty commission using the pre-baked function
  const processArtyCommission = async () => {
    setIsProcessingArty(true);
    try {
      const { data, error } = await supabase.functions.invoke('process-arty-commission', {
        body: {
          payment_split_id: split.payment_split_id,
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      setArtyResult(data as ArtyCommissionResult);

      // If successful, update the local paid state
      if (data.success) {
        setLocalPaid(true);
        setLocalPaidDate(new Date().toISOString().split('T')[0]);
        if (onOptimisticUpdate) {
          const today = new Date();
          const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
          onOptimisticUpdate(split.payment_split_id, { paid: true, paid_date: dateStr });
        }
        onUpdate();
      }
    } catch (err) {
      console.error('Error processing Arty commission:', err);
      setArtyResult({
        success: false,
        broker_name: split.broker_name,
        deal_name: split.deal_name || 'Unknown Deal',
        gross_commission: Number(split.split_broker_total) || 0,
        draw_balance: 0,
        net_payment: 0,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setIsProcessingArty(false);
    }
  };

  // Open Arty commission modal
  const handleOpenArtyModal = async () => {
    setShowArtyCommissionModal(true);
    setArtyResult(null);
    await fetchArtyPreview();
  };

  // Create QBO commission entry (Bill or Journal Entry) when marking as paid
  const createQBCommissionEntry = async (paidDate: string): Promise<QBCommissionResult> => {
    try {
      const { data, error } = await supabase.functions.invoke('quickbooks-create-commission-entry', {
        body: {
          paymentSplitId: split.payment_split_id,
          paidDate: paidDate,
        },
      });

      if (error) {
        console.error('QBO commission entry error:', error);
        return { success: false, error: error.message };
      }

      return data as QBCommissionResult;
    } catch (err) {
      console.error('QBO commission entry exception:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  };

  // Delete QBO commission entry (Bill or Journal Entry) when unmarking as paid
  const deleteQBCommissionEntry = async (): Promise<QBCommissionResult> => {
    try {
      const { data, error } = await supabase.functions.invoke('quickbooks-delete-commission-entry', {
        body: {
          paymentSplitId: split.payment_split_id,
        },
      });

      if (error) {
        console.error('QBO commission delete error:', error);
        return { success: false, error: error.message };
      }

      return data as QBCommissionResult;
    } catch (err) {
      console.error('QBO commission delete exception:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  };

  // When user clicks the checkbox to mark as paid
  const handleCheckboxChange = (paid: boolean) => {
    if (paid) {
      // Show confirmation dialog asking about QBO entry
      setPendingPaidState(true);
      setShowQboConfirmDialog(true);
    } else {
      // Unmarking as paid - proceed directly (will attempt to delete QBO entry)
      handleTogglePaid(false, false);
    }
  };

  // Handle the confirmation dialog response
  const handleQboConfirmResponse = (createQboEntry: boolean) => {
    setShowQboConfirmDialog(false);
    if (pendingPaidState !== null) {
      handleTogglePaid(pendingPaidState, !createQboEntry);
    }
    setPendingPaidState(null);
  };

  const handleTogglePaid = async (paid: boolean, skipQboEntry: boolean = false) => {
    const newDate = paid ? getLocalDateString() : null;

    // Optimistic update locally
    setLocalPaid(paid);
    setLocalPaidDate(newDate);

    // Update parent's local state for smooth UI
    if (onOptimisticUpdate) {
      onOptimisticUpdate(split.payment_split_id, { paid, paid_date: newDate });
    }

    const { error } = await supabase
      .from('payment_split')
      .update({
        paid: paid,
        paid_date: newDate,
      })
      .eq('id', split.payment_split_id);

    if (error) {
      console.error('Error updating payment split:', error);
      alert('Failed to update broker payment status');
      // Revert on error
      setLocalPaid(split.paid);
      setLocalPaidDate(split.paid_date);
      if (onOptimisticUpdate) {
        onOptimisticUpdate(split.payment_split_id, { paid: split.paid, paid_date: split.paid_date });
      }
      return;
    }

    // If marking as paid and NOT skipping QBO, create QBO commission entry (Bill or Journal Entry)
    if (paid && newDate && !skipQboEntry) {
      setIsCreatingQBEntry(true);
      const result = await createQBCommissionEntry(newDate);
      setIsCreatingQBEntry(false);

      if (result.success) {
        if (result.alreadyExists) {
          // Entry already exists, no action needed
          console.log('QBO commission entry already exists for this payment split');
        } else {
          // Show success message
          const entryType = result.qbEntityType === 'Bill' ? 'Bill' : 'Journal Entry';
          console.log(`Created QBO ${entryType} #${result.qbDocNumber} for ${split.broker_name}`);
        }
      } else if (result.error?.includes('No QuickBooks commission mapping configured')) {
        // No mapping configured - this is expected for brokers without QBO setup
        console.log(`No QBO mapping for ${split.broker_name} - skipping commission entry`);
      } else if (result.error?.includes('QuickBooks is not connected')) {
        // QBO not connected - silent fail, just log
        console.log('QuickBooks not connected - skipping commission entry');
      } else {
        // Other error - log but don't block the paid status update
        console.error('Failed to create QBO commission entry:', result.error);
      }
    } else if (paid && skipQboEntry) {
      console.log(`Skipping QBO commission entry for ${split.broker_name} (handled externally, e.g., via Bookkeeper)`);
    }

    // If unmarking as paid, delete the QBO commission entry (Bill or Journal Entry)
    if (!paid) {
      setIsCreatingQBEntry(true);
      const result = await deleteQBCommissionEntry();
      setIsCreatingQBEntry(false);

      if (result.success) {
        if (result.notFound) {
          // No entry to delete, which is fine
          console.log('No QBO commission entry to delete for this payment split');
        } else {
          // Show success message
          const entryType = result.qbEntityType === 'Bill' ? 'Bill' : 'Journal Entry';
          console.log(`Deleted QBO ${entryType} #${result.qbDocNumber} for ${split.broker_name}`);
        }
      } else {
        // Error deleting - log but don't block the unpaid status update
        console.error('Failed to delete QBO commission entry:', result.error);
      }
    }
  };

  const handleUpdatePaidDate = async (date: string) => {
    // Optimistic update locally
    setLocalPaidDate(date);

    // Update parent's local state for smooth UI
    if (onOptimisticUpdate) {
      onOptimisticUpdate(split.payment_split_id, { paid_date: date });
    }

    const { error } = await supabase
      .from('payment_split')
      .update({ paid_date: date })
      .eq('id', split.payment_split_id);

    if (error) {
      console.error('Error updating paid date:', error);
      alert('Failed to update paid date');
      // Revert on error
      setLocalPaidDate(split.paid_date);
      if (onOptimisticUpdate) {
        onOptimisticUpdate(split.payment_split_id, { paid_date: split.paid_date });
      }
    }
  };

  return (
    <>
      {/* Arty Commission Modal */}
      {showArtyCommissionModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => !isProcessingArty && setShowArtyCommissionModal(false)} />
            <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full">
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Process Arty's Commission
                </h3>

                {isLoadingArtyPreview ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
                    <span className="ml-3 text-gray-600">Loading breakdown...</span>
                  </div>
                ) : artyResult ? (
                  // Show result
                  <div className={`rounded-lg p-4 ${artyResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                    {artyResult.success ? (
                      <>
                        <p className="text-green-800 font-medium mb-3">Commission processed successfully!</p>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-green-700">Journal Entry:</span>
                            <span className="font-mono text-green-900">#{artyResult.journal_entry?.doc_number}</span>
                          </div>
                          {artyResult.bill && (
                            <div className="flex justify-between">
                              <span className="text-green-700">Bill Created:</span>
                              <span className="font-mono text-green-900">#{artyResult.bill.doc_number}</span>
                            </div>
                          )}
                          {artyResult.email_sent && (
                            <div className="flex justify-between">
                              <span className="text-green-700">Email:</span>
                              <span className="text-green-900">Sent to Arty</span>
                            </div>
                          )}
                          <div className="pt-2 border-t border-green-200 mt-2">
                            <div className="flex justify-between font-medium">
                              <span className="text-green-700">Net Payment:</span>
                              <span className="text-green-900">{formatCurrency(artyResult.net_payment)}</span>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <p className="text-red-800">Error: {artyResult.error}</p>
                    )}
                    <button
                      onClick={() => setShowArtyCommissionModal(false)}
                      className="mt-4 w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                    >
                      Close
                    </button>
                  </div>
                ) : artyPreview ? (
                  // Show preview
                  <>
                    <div className="bg-gray-50 rounded-lg p-4 mb-4">
                      <div className="text-sm text-gray-600 mb-2">{artyPreview.deal_name}</div>
                      <div className="space-y-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Gross Commission:</span>
                          <span className="font-medium text-gray-900">{formatCurrency(artyPreview.gross_commission)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Less Draw Balance:</span>
                          <span className="font-medium text-red-600">({formatCurrency(artyPreview.draw_balance)})</span>
                        </div>
                        <div className="border-t pt-2">
                          <div className="flex justify-between text-base font-semibold">
                            <span className="text-gray-900">Net Payment:</span>
                            <span className="text-emerald-600">{formatCurrency(artyPreview.net_payment)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-blue-50 rounded-lg p-3 mb-4 text-sm text-blue-800">
                      <strong>This will:</strong>
                      <ul className="list-disc ml-5 mt-1 space-y-1">
                        <li>Create journal entry (Commission Expense → Draw Account)</li>
                        {artyPreview.net_payment > 0 && <li>Create bill to Santos Real Estate Partners for {formatCurrency(artyPreview.net_payment)}</li>}
                        <li>Send breakdown email to Arty</li>
                        <li>Mark this payment split as paid</li>
                      </ul>
                    </div>

                    <div className="flex space-x-3">
                      <button
                        onClick={() => setShowArtyCommissionModal(false)}
                        disabled={isProcessingArty}
                        className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={processArtyCommission}
                        disabled={isProcessingArty}
                        className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center"
                      >
                        {isProcessingArty ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            Processing...
                          </>
                        ) : (
                          'Process Commission'
                        )}
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QBO Entry Confirmation Dialog */}
      {showQboConfirmDialog && (
        <tr>
          <td colSpan={7} className="px-2 py-3 bg-blue-50 border-y border-blue-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium text-blue-900">
                  Create QuickBooks entry for {split.broker_name}'s commission?
                </span>
                <span className="text-xs text-blue-600">
                  (Select "No" if already handled via Bookkeeper)
                </span>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => handleQboConfirmResponse(true)}
                  className="px-3 py-1 text-sm font-medium text-white bg-green-600 rounded hover:bg-green-700"
                >
                  Yes, create entry
                </button>
                <button
                  onClick={() => handleQboConfirmResponse(false)}
                  className="px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
                >
                  No, skip QBO
                </button>
                <button
                  onClick={() => {
                    setShowQboConfirmDialog(false);
                    setPendingPaidState(null);
                  }}
                  className="px-3 py-1 text-sm font-medium text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
      <tr className="hover:bg-gray-50">
        <td className="px-2 py-2 text-sm text-gray-900">
          <div className="flex items-center gap-2">
            {split.broker_name}
            {isArty && !localPaid && (
              <button
                onClick={handleOpenArtyModal}
                className="px-2 py-0.5 text-xs bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200 font-medium"
                title="Calculate net pay with draw balance"
              >
                Net Pay
              </button>
            )}
          </div>
        </td>
        <td className="px-2 py-2 text-sm text-center">
          <div className="flex flex-col items-center">
            <span className="text-gray-900">{formatCurrency(split.split_origination_usd)}</span>
            <span className="text-xs text-gray-500">{formatPercent(split.split_origination_percent)}</span>
          </div>
        </td>
        <td className="px-2 py-2 text-sm text-center">
          <div className="flex flex-col items-center">
            <span className="text-gray-900">{formatCurrency(split.split_site_usd)}</span>
            <span className="text-xs text-gray-500">{formatPercent(split.split_site_percent)}</span>
          </div>
        </td>
        <td className="px-2 py-2 text-sm text-center">
          <div className="flex flex-col items-center">
            <span className="text-gray-900">{formatCurrency(split.split_deal_usd)}</span>
            <span className="text-xs text-gray-500">{formatPercent(split.split_deal_percent)}</span>
          </div>
        </td>
        <td className="px-2 py-2 text-sm text-center font-medium text-gray-900">
          {formatCurrency(split.split_broker_total)}
        </td>
        <td className="px-2 py-2 text-sm">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={localPaid}
              onChange={(e) => handleCheckboxChange(e.target.checked)}
              disabled={isCreatingQBEntry || showQboConfirmDialog}
              className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded disabled:opacity-50"
            />
            {isCreatingQBEntry && (
              <span className="text-xs text-blue-600 animate-pulse">Syncing to QBO...</span>
            )}
            {localPaid && localPaidDate && !isCreatingQBEntry && (
              <input
                type="date"
                value={localPaidDate}
                onChange={(e) => handleUpdatePaidDate(e.target.value)}
                className="text-gray-500 text-xs border-0 p-0 focus:ring-0 cursor-pointer hover:text-gray-700"
                style={{ width: '90px' }}
              />
            )}
          </div>
        </td>
      </tr>
    </>
  );
};

export default BrokerPaymentRow;
