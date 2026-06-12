// Preview-and-send modal for Arty's commission email.
// Loads the rendered email template + QB-derived breakdown from process-arty-commission
// (preview mode), lets the user edit to/cc/subject/body, then calls the same edge function
// in full mode (with email_overrides) to post QB entries, mark the split paid, and send.

import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

interface ArtyCommissionPreviewResponse {
  success: boolean;
  broker_name: string;
  deal_name: string;
  payment_name?: string;
  gross_commission: number;
  draw_balance: number;
  draw_before?: number;
  credit_applied?: number;
  draw_after?: number;
  net_payment: number;
  arty_email?: string;
  default_cc?: string[];
  email_subject?: string;
  email_body_text?: string;
  error?: string;
}

interface ArtyCommissionProcessResponse {
  success: boolean;
  broker_name: string;
  deal_name: string;
  payment_name?: string;
  gross_commission: number;
  draw_balance: number;
  net_payment: number;
  journal_entry?: { id: string; doc_number: string };
  bill?: { id: string; doc_number: string };
  email_sent?: boolean;
  error?: string;
}

interface ArtyCommissionEmailModalProps {
  paymentSplitId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const parseEmailList = (raw: string): string[] =>
  raw
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);

const ArtyCommissionEmailModal: React.FC<ArtyCommissionEmailModalProps> = ({
  paymentSplitId,
  onClose,
  onSuccess,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ArtyCommissionPreviewResponse | null>(null);

  const [toField, setToField] = useState('');
  const [ccField, setCcField] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyText, setBodyText] = useState('');

  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ArtyCommissionProcessResponse | null>(null);
  const [processError, setProcessError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const { data, error } = await supabase.functions.invoke('process-arty-commission', {
          body: { payment_split_id: paymentSplitId, preview_only: true },
        });
        if (cancelled) return;
        if (error) throw new Error(error.message);
        if (data?.success === false && data?.error) throw new Error(data.error);

        const p = data as ArtyCommissionPreviewResponse;
        setPreview(p);
        // Dev safety: in non-prod, default "To" to mike@ so test runs don't ship to Arty.
        // Production still defaults to Arty's address from the broker user lookup.
        const defaultTo = import.meta.env.PROD
          ? (p.arty_email || '')
          : 'mike@oculusrep.com';
        setToField(defaultTo);
        setCcField((p.default_cc || []).join(', '));
        setSubject(p.email_subject || '');
        setBodyText(p.email_body_text || '');
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load preview');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [paymentSplitId]);

  const handleSend = async () => {
    const toList = parseEmailList(toField);
    if (toList.length === 0) {
      setProcessError('At least one recipient is required in "To".');
      return;
    }
    const ccList = parseEmailList(ccField);

    setIsProcessing(true);
    setProcessError(null);
    try {
      const { data, error } = await supabase.functions.invoke('process-arty-commission', {
        body: {
          payment_split_id: paymentSplitId,
          email_overrides: {
            to: toList,
            cc: ccList,
            subject,
            body_text: bodyText,
          },
        },
      });
      if (error) throw new Error(error.message);
      if (data?.success === false && data?.error) throw new Error(data.error);

      setResult(data as ArtyCommissionProcessResponse);
      onSuccess();
    } catch (err) {
      setProcessError(err instanceof Error ? err.message : 'Failed to process commission');
    } finally {
      setIsProcessing(false);
    }
  };

  const showResultView = result !== null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 py-6">
        <div
          className="fixed inset-0 bg-gray-500 bg-opacity-75"
          onClick={() => !isProcessing && onClose()}
        />
        <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full">
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {showResultView ? 'Commission Processed' : "Process Arty's Commission"}
            </h3>

            {isLoading && (
              <div className="flex items-center justify-center py-10">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
                <span className="ml-3 text-gray-600">Loading breakdown from QuickBooks…</span>
              </div>
            )}

            {!isLoading && loadError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800 font-medium">Could not load preview</p>
                <p className="text-red-700 text-sm mt-1">{loadError}</p>
                <button
                  onClick={onClose}
                  className="mt-4 w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                >
                  Close
                </button>
              </div>
            )}

            {!isLoading && !loadError && showResultView && result && (
              <div
                className={`rounded-lg p-4 ${
                  result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                }`}
              >
                {result.success ? (
                  <>
                    <p className="text-green-800 font-medium mb-3">
                      Commission processed and email sent!
                    </p>
                    <div className="space-y-2 text-sm">
                      {result.journal_entry && (
                        <div className="flex justify-between">
                          <span className="text-green-700">Journal Entry:</span>
                          <span className="font-mono text-green-900">#{result.journal_entry.doc_number}</span>
                        </div>
                      )}
                      {result.bill && (
                        <div className="flex justify-between">
                          <span className="text-green-700">Bill Created:</span>
                          <span className="font-mono text-green-900">#{result.bill.doc_number}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-green-700">Email:</span>
                        <span className="text-green-900">
                          {result.email_sent ? 'Sent' : 'Not sent (check edge function logs)'}
                        </span>
                      </div>
                      <div className="pt-2 border-t border-green-200 mt-2">
                        <div className="flex justify-between font-medium">
                          <span className="text-green-700">Net Payment:</span>
                          <span className="text-green-900">{formatCurrency(result.net_payment)}</span>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-red-800">Error: {result.error}</p>
                )}
                <button
                  onClick={onClose}
                  className="mt-4 w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                >
                  Close
                </button>
              </div>
            )}

            {!isLoading && !loadError && !showResultView && preview && (
              <>
                {/* Breakdown */}
                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  <div className="text-sm text-gray-600 mb-2">
                    {preview.deal_name}
                    {preview.payment_name ? ` — ${preview.payment_name}` : ''}
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Net commission (broker total):</span>
                      <span className="font-medium text-gray-900">
                        {formatCurrency(preview.gross_commission)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Draw balance before:</span>
                      <span className="font-medium text-gray-900">
                        {formatCurrency(preview.draw_before ?? preview.draw_balance)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Less credit applied:</span>
                      <span className="font-medium text-red-600">
                        ({formatCurrency(preview.credit_applied ?? 0)})
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Draw balance after:</span>
                      <span className="font-medium text-gray-900">
                        {formatCurrency(preview.draw_after ?? 0)}
                      </span>
                    </div>
                    <div className="border-t pt-2 flex justify-between text-base font-semibold">
                      <span className="text-gray-900">Direct deposit:</span>
                      <span className="text-emerald-600">{formatCurrency(preview.net_payment)}</span>
                    </div>
                  </div>
                </div>

                {!import.meta.env.PROD && (
                  <div className="mb-3 bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-800">
                    Dev mode: "To" defaults to mike@oculusrep.com to avoid sending real Arty emails from a non-prod build. Edit if you want.
                  </div>
                )}

                {/* Email editor */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">To</label>
                    <input
                      type="text"
                      value={toField}
                      onChange={e => setToField(e.target.value)}
                      placeholder="recipient@example.com"
                      className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Cc (comma-separated, leave blank for none)
                    </label>
                    <input
                      type="text"
                      value={ccField}
                      onChange={e => setCcField(e.target.value)}
                      placeholder="mike@oculusrep.com"
                      className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Subject</label>
                    <input
                      type="text"
                      value={subject}
                      onChange={e => setSubject(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Body</label>
                    <textarea
                      value={bodyText}
                      onChange={e => setBodyText(e.target.value)}
                      rows={14}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="bg-blue-50 rounded-lg p-3 mt-4 text-sm text-blue-800">
                  <strong>Clicking "Send & Mark Paid" will:</strong>
                  <ul className="list-disc ml-5 mt-1 space-y-1">
                    <li>Create QB journal entry (Commissions Paid Out → Draw Account)</li>
                    {preview.net_payment > 0 && (
                      <li>Create a bill to Santos Real Estate Partners for {formatCurrency(preview.net_payment)}</li>
                    )}
                    <li>Send the email above (from your connected Gmail)</li>
                    <li>Mark this payment split as paid</li>
                  </ul>
                </div>

                {processError && (
                  <div className="mt-3 bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">
                    {processError}
                  </div>
                )}

                <div className="flex space-x-3 mt-4">
                  <button
                    onClick={onClose}
                    disabled={isProcessing}
                    className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSend}
                    disabled={isProcessing}
                    className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center"
                  >
                    {isProcessing ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Sending…
                      </>
                    ) : (
                      'Send & Mark Paid'
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ArtyCommissionEmailModal;
