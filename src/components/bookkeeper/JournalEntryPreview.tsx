/**
 * Journal Entry Preview Component
 *
 * Displays a draft journal entry in T-account format with
 * debit/credit columns and balance validation.
 */

import { Check, X, AlertTriangle } from 'lucide-react';
import type { JournalEntryDraft } from '../../types/bookkeeper';

interface JournalEntryPreviewProps {
  draft: JournalEntryDraft;
  onCreateInQBO?: () => void;
  isCreating?: boolean;
}

export default function JournalEntryPreview({
  draft,
  onCreateInQBO,
  isCreating = false,
}: JournalEntryPreviewProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              Journal Entry Draft
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {formatDate(draft.transaction_date)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {draft.is_balanced ? (
              <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-1 rounded-full">
                <Check className="h-3 w-3" />
                Balanced
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 px-2 py-1 rounded-full">
                <X className="h-3 w-3" />
                Not Balanced
              </span>
            )}
          </div>
        </div>
        {draft.description && (
          <p className="text-sm text-gray-700 mt-2">{draft.description}</p>
        )}
      </div>

      {/* Warnings */}
      {draft.warnings && draft.warnings.length > 0 && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-100">
          {draft.warnings.map((warning, idx) => (
            <div key={idx} className="flex items-start gap-2 text-xs text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>{warning}</span>
            </div>
          ))}
        </div>
      )}

      {/* T-Account Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-2 font-medium text-gray-600">
                Account
              </th>
              <th className="text-right px-4 py-2 font-medium text-gray-600 w-28">
                Debit
              </th>
              <th className="text-right px-4 py-2 font-medium text-gray-600 w-28">
                Credit
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {draft.lines.map((line, idx) => (
              <tr key={idx} className="hover:bg-gray-50">
                <td className="px-4 py-2">
                  <div className="flex flex-col">
                    <span className="font-medium text-gray-900">
                      {line.account_name}
                    </span>
                    {line.description && (
                      <span className="text-xs text-gray-500">
                        {line.description}
                      </span>
                    )}
                    {line.entity_name && (
                      <span className="text-xs text-gray-400">
                        {line.entity_type}: {line.entity_name}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2 text-right font-mono">
                  {line.posting_type === 'Debit' ? (
                    <span className="text-gray-900">
                      {formatCurrency(line.amount)}
                    </span>
                  ) : (
                    <span className="text-gray-300">-</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right font-mono">
                  {line.posting_type === 'Credit' ? (
                    <span className="text-gray-900">
                      {formatCurrency(line.amount)}
                    </span>
                  ) : (
                    <span className="text-gray-300">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t-2 border-gray-300">
              <td className="px-4 py-2 font-semibold text-gray-700">Totals</td>
              <td className="px-4 py-2 text-right font-mono font-semibold">
                <span className={draft.is_balanced ? 'text-green-700' : 'text-red-700'}>
                  {formatCurrency(draft.total_debits)}
                </span>
              </td>
              <td className="px-4 py-2 text-right font-mono font-semibold">
                <span className={draft.is_balanced ? 'text-green-700' : 'text-red-700'}>
                  {formatCurrency(draft.total_credits)}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Memo */}
      {draft.memo && (
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-200">
          <p className="text-xs text-gray-500">
            <span className="font-medium">Memo:</span> {draft.memo}
          </p>
        </div>
      )}

      {/* Action Button */}
      {onCreateInQBO && draft.is_balanced && (
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
          <button
            onClick={onCreateInQBO}
            disabled={isCreating}
            className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isCreating ? 'Creating in QuickBooks...' : 'Create in QuickBooks'}
          </button>
        </div>
      )}
    </div>
  );
}
