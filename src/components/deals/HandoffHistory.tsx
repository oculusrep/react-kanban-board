import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';

interface HandoffHistoryProps {
  dealId: string;
  defaultCollapsed?: boolean;
}

interface HandoffRecord {
  id: string;
  document_type: 'LOI' | 'Lease';
  holder: 'us' | 'll';
  changed_at: string;
  created_at: string;
  days_held: number;
  total_turns: number;
}

/**
 * HandoffHistory - Collapsible section showing document handoff history
 *
 * Displays a table of all handoffs for a deal with:
 * - Date
 * - Document type (LOI/Lease)
 * - Holder (Us/LL)
 * - Days held
 */
export default function HandoffHistory({
  dealId,
  defaultCollapsed = true,
}: HandoffHistoryProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [handoffs, setHandoffs] = useState<HandoffRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isCollapsed && dealId) {
      fetchHandoffs();
    }
  }, [isCollapsed, dealId]);

  const fetchHandoffs = async () => {
    setLoading(true);
    try {
      // Use the view that calculates days_held and total_turns
      const { data, error } = await supabase
        .from('document_handoff_history')
        .select('*')
        .eq('deal_id', dealId)
        .order('changed_at', { ascending: false });

      if (error) {
        console.error('Error fetching handoff history:', error);
        // Fall back to regular table if view doesn't exist yet
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('document_handoff')
          .select('*')
          .eq('deal_id', dealId)
          .order('changed_at', { ascending: false });

        if (!fallbackError && fallbackData) {
          // Calculate days_held manually if using fallback
          const processed = fallbackData.map((h, idx, arr) => {
            const nextHandoff = arr[idx - 1]; // Previous in array = next chronologically
            let daysHeld = 0;
            if (nextHandoff) {
              const start = new Date(h.changed_at);
              const end = new Date(nextHandoff.changed_at);
              daysHeld = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
            } else {
              // Current/most recent - calculate to today
              const start = new Date(h.changed_at);
              const now = new Date();
              daysHeld = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
            }
            return {
              ...h,
              days_held: daysHeld,
              total_turns: fallbackData.length,
            };
          });
          setHandoffs(processed as HandoffRecord[]);
        }
      } else if (data) {
        setHandoffs(data as HandoffRecord[]);
      }
    } catch (err) {
      console.error('Error in fetchHandoffs:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  // Chevron icon
  const ChevronIcon = () => (
    <svg
      className={`w-4 h-4 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );

  return (
    <div className="border border-gray-200 rounded-lg bg-white">
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ChevronIcon />
          <span className="font-medium text-gray-900">Document Handoffs</span>
          {handoffs.length > 0 && (
            <span className="text-sm text-gray-500">({handoffs.length})</span>
          )}
        </div>
      </button>

      {/* Content */}
      {!isCollapsed && (
        <div className="border-t border-gray-200 px-4 py-3">
          {loading ? (
            <div className="text-gray-500 text-sm">Loading...</div>
          ) : handoffs.length === 0 ? (
            <div className="text-gray-500 text-sm">
              No handoff history yet. Click the badge on a kanban card or deal page to start tracking.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium">Document</th>
                  <th className="pb-2 font-medium">With</th>
                  <th className="pb-2 font-medium text-right">Days</th>
                </tr>
              </thead>
              <tbody>
                {handoffs.map((h, idx) => (
                  <tr key={h.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 text-gray-900">{formatDate(h.changed_at)}</td>
                    <td className="py-2 text-gray-700">{h.document_type}</td>
                    <td className="py-2">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          h.holder === 'us'
                            ? 'bg-cyan-100 text-cyan-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {h.holder === 'us' ? 'Us' : 'LL'}
                      </span>
                    </td>
                    <td className="py-2 text-right text-gray-600">
                      {idx === 0 ? h.days_held : h.days_held}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
