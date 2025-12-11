import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { format, formatDistanceToNow } from 'date-fns';
import {
  ArrowPathIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  UserIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline';

interface DealSynopsisData {
  id: string;
  deal_id: string;
  ball_in_court: string | null;
  ball_in_court_type: string | null;
  status_summary: string | null;
  key_document_status: string | null;
  alert_level: 'green' | 'yellow' | 'red' | null;
  alert_reason: string | null;
  last_activity_at: string | null;
  days_since_activity: number | null;
  generated_at: string;
}

interface DealSynopsisProps {
  dealId: string;
}

const DealSynopsis: React.FC<DealSynopsisProps> = ({ dealId }) => {
  const [synopsis, setSynopsis] = useState<DealSynopsisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSynopsis = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('deal_synopsis')
        .select('*')
        .eq('deal_id', dealId)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        // PGRST116 is "no rows returned" which is fine
        throw fetchError;
      }

      setSynopsis(data);
    } catch (err: any) {
      console.error('Error fetching synopsis:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      setError(null);

      const session = await supabase.auth.getSession();
      if (!session.data.session) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/deal-synopsis`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.data.session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            deal_id: dealId,
            force_refresh: true,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to refresh synopsis');
      }

      // Refetch the updated synopsis
      await fetchSynopsis();
    } catch (err: any) {
      console.error('Error refreshing synopsis:', err);
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchSynopsis();
  }, [dealId]);

  const getAlertColor = (level: string | null) => {
    switch (level) {
      case 'green':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'yellow':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'red':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getAlertIcon = (level: string | null) => {
    switch (level) {
      case 'green':
        return <CheckCircleIcon className="w-5 h-5 text-green-600" />;
      case 'yellow':
        return <ClockIcon className="w-5 h-5 text-yellow-600" />;
      case 'red':
        return <ExclamationTriangleIcon className="w-5 h-5 text-red-600" />;
      default:
        return null;
    }
  };

  const getBallInCourtIcon = (type: string | null) => {
    switch (type) {
      case 'us':
        return <UserIcon className="w-4 h-4" />;
      case 'them':
      case 'landlord':
      case 'tenant':
      case 'broker':
        return <UserIcon className="w-4 h-4" />;
      default:
        return <UserIcon className="w-4 h-4" />;
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-3"></div>
          <div className="h-3 bg-gray-200 rounded w-3/4 mb-2"></div>
          <div className="h-3 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 rounded-lg border border-red-200 p-4">
        <p className="text-sm text-red-700">Error loading synopsis: {error}</p>
        <button
          onClick={fetchSynopsis}
          className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!synopsis) {
    return (
      <div className="bg-gray-50 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-900">AI Deal Synopsis</h3>
            <p className="text-sm text-gray-500 mt-1">
              No synopsis generated yet. Click refresh to analyze this deal.
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            {refreshing ? (
              <ArrowPathIcon className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <ArrowPathIcon className="w-4 h-4 mr-1" />
            )}
            Generate
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border p-4 ${getAlertColor(synopsis.alert_level)}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {getAlertIcon(synopsis.alert_level)}
          <h3 className="text-sm font-medium">AI Deal Synopsis</h3>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-1 rounded hover:bg-black/5 disabled:opacity-50"
          title="Refresh synopsis"
        >
          <ArrowPathIcon className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Ball in Court */}
      {synopsis.ball_in_court && (
        <div className="flex items-center gap-2 mb-2">
          {getBallInCourtIcon(synopsis.ball_in_court_type)}
          <span className="text-sm font-medium">Ball in Court:</span>
          <span className="text-sm">{synopsis.ball_in_court}</span>
        </div>
      )}

      {/* Status Summary */}
      {synopsis.status_summary && (
        <p className="text-sm mb-3">{synopsis.status_summary}</p>
      )}

      {/* Key Document Status */}
      {synopsis.key_document_status && (
        <div className="flex items-center gap-2 mb-2 text-sm">
          <DocumentTextIcon className="w-4 h-4" />
          <span>{synopsis.key_document_status}</span>
        </div>
      )}

      {/* Alert Reason */}
      {synopsis.alert_reason && synopsis.alert_level !== 'green' && (
        <div className="text-sm opacity-80 mb-2">
          {synopsis.alert_reason}
        </div>
      )}

      {/* Metadata */}
      <div className="flex items-center justify-between text-xs opacity-70 mt-3 pt-2 border-t border-current/10">
        <span>
          {synopsis.days_since_activity !== null && (
            <>Last activity: {synopsis.days_since_activity} day{synopsis.days_since_activity !== 1 ? 's' : ''} ago</>
          )}
        </span>
        <span>
          Updated {formatDistanceToNow(new Date(synopsis.generated_at), { addSuffix: true })}
        </span>
      </div>
    </div>
  );
};

export default DealSynopsis;
