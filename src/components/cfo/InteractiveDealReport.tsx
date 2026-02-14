/**
 * Interactive Deal Report Component
 *
 * Renders the CFO Agent's deal report with:
 * - Clickable deal names that navigate to deal details
 * - Inline editable payment date fields
 * - Real-time updates to the database
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, AlertTriangle, Check, X, Calendar, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import type { InteractiveDealItem } from '../../types/cfo';

interface InteractiveDealReportProps {
  deals: InteractiveDealItem[];
  summary: {
    total_deals: number;
    total_payments_missing_dates: number;
    total_house_net_at_risk: number;
  };
  onDateUpdated?: (paymentId: string, newDate: string) => void;
}

export default function InteractiveDealReport({
  deals,
  summary,
  onDateUpdated,
}: InteractiveDealReportProps) {
  const navigate = useNavigate();
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [savingPaymentId, setSavingPaymentId] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<Record<string, 'success' | 'error'>>({});

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const handleDealClick = (dealId: string) => {
    navigate(`/deal/${dealId}`);
  };

  const handleStartEdit = (paymentId: string, currentDate: string | null) => {
    setEditingPaymentId(paymentId);
    setEditValue(currentDate || '');
  };

  const handleCancelEdit = () => {
    setEditingPaymentId(null);
    setEditValue('');
  };

  const handleSaveDate = async (dealId: string, paymentId: string) => {
    if (!editValue) {
      handleCancelEdit();
      return;
    }

    setSavingPaymentId(paymentId);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cfo-query`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            query: `Update payment ${paymentId} for deal ${dealId} to date ${editValue}`,
            // This is a direct tool call request pattern
          }),
        }
      );

      // Alternative: Direct database update (simpler, faster)
      const { error } = await supabase
        .from('payment')
        .update({ payment_date_estimated: editValue })
        .eq('id', paymentId)
        .eq('deal_id', dealId);

      if (error) throw error;

      setUpdateStatus((prev) => ({ ...prev, [paymentId]: 'success' }));
      onDateUpdated?.(paymentId, editValue);

      // Clear success status after 2 seconds
      setTimeout(() => {
        setUpdateStatus((prev) => {
          const newStatus = { ...prev };
          delete newStatus[paymentId];
          return newStatus;
        });
      }, 2000);
    } catch (err) {
      console.error('Failed to update payment date:', err);
      setUpdateStatus((prev) => ({ ...prev, [paymentId]: 'error' }));
    } finally {
      setSavingPaymentId(null);
      setEditingPaymentId(null);
      setEditValue('');
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
      {/* Summary Header */}
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900">Deal Payment Report</h3>
        <div className="flex items-center gap-4 mt-2 text-xs text-gray-600">
          <span>{summary.total_deals} deals</span>
          <span className="text-amber-600">
            {summary.total_payments_missing_dates} payments missing dates
          </span>
          <span className="text-red-600">
            {formatCurrency(summary.total_house_net_at_risk)} at risk
          </span>
        </div>
      </div>

      {/* Deals Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-2 font-medium text-gray-600">Deal</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Stage</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">House Net</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Payment</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Est. Date</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Issues</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {deals.map((deal) => (
              deal.payments.length > 0 ? (
                deal.payments.map((payment, idx) => (
                  <tr key={`${deal.deal_id}-${payment.payment_id}`} className="hover:bg-gray-50">
                    {idx === 0 ? (
                      <>
                        <td className="px-4 py-2" rowSpan={deal.payments.length}>
                          <button
                            onClick={() => handleDealClick(deal.deal_id)}
                            className="text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 font-medium"
                          >
                            {deal.deal_name}
                            <ExternalLink className="h-3 w-3" />
                          </button>
                          {deal.client_name && (
                            <div className="text-xs text-gray-500">{deal.client_name}</div>
                          )}
                        </td>
                        <td className="px-4 py-2 text-gray-600" rowSpan={deal.payments.length}>
                          {deal.stage_label}
                        </td>
                        <td className="px-4 py-2 text-right font-mono" rowSpan={deal.payments.length}>
                          {formatCurrency(deal.house_net)}
                        </td>
                      </>
                    ) : null}
                    <td className="px-4 py-2">
                      <div className="flex flex-col">
                        <span className="text-gray-900">{payment.payment_name || 'Payment'}</span>
                        {payment.payment_amount && (
                          <span className="text-xs text-gray-500">
                            {formatCurrency(payment.payment_amount)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      {editingPaymentId === payment.payment_id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="date"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSaveDate(deal.deal_id, payment.payment_id)}
                            disabled={savingPaymentId === payment.payment_id}
                            className="p-1 text-green-600 hover:text-green-800 disabled:opacity-50"
                          >
                            {savingPaymentId === payment.payment_id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="p-1 text-gray-400 hover:text-gray-600"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          {payment.payment_date_estimated ? (
                            <span className="text-gray-900">
                              {new Date(payment.payment_date_estimated).toLocaleDateString()}
                            </span>
                          ) : (
                            <span className="text-amber-600 italic">Not set</span>
                          )}
                          {payment.editable && (
                            <button
                              onClick={() => handleStartEdit(payment.payment_id, payment.payment_date_estimated)}
                              className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                              title="Edit date"
                            >
                              <Calendar className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {updateStatus[payment.payment_id] === 'success' && (
                            <Check className="h-4 w-4 text-green-500" />
                          )}
                          {updateStatus[payment.payment_id] === 'error' && (
                            <X className="h-4 w-4 text-red-500" />
                          )}
                        </div>
                      )}
                    </td>
                    {idx === 0 ? (
                      <td className="px-4 py-2" rowSpan={deal.payments.length}>
                        {deal.issues.length > 0 && (
                          <div className="flex flex-col gap-1">
                            {deal.issues.map((issue, i) => (
                              <div key={i} className="flex items-start gap-1 text-xs text-amber-600">
                                <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                                <span>{issue}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    ) : null}
                  </tr>
                ))
              ) : (
                <tr key={deal.deal_id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <button
                      onClick={() => handleDealClick(deal.deal_id)}
                      className="text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 font-medium"
                    >
                      {deal.deal_name}
                      <ExternalLink className="h-3 w-3" />
                    </button>
                    {deal.client_name && (
                      <div className="text-xs text-gray-500">{deal.client_name}</div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-600">{deal.stage_label}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatCurrency(deal.house_net)}</td>
                  <td className="px-4 py-2 text-gray-400 italic" colSpan={2}>No payments</td>
                  <td className="px-4 py-2">
                    {deal.issues.length > 0 && (
                      <div className="flex flex-col gap-1">
                        {deal.issues.map((issue, i) => (
                          <div key={i} className="flex items-start gap-1 text-xs text-amber-600">
                            <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                            <span>{issue}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              )
            ))}
          </tbody>
        </table>
      </div>

      {deals.length === 0 && (
        <div className="px-4 py-8 text-center text-gray-500">
          No deals match the selected filter.
        </div>
      )}
    </div>
  );
}
