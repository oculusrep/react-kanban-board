import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { format } from 'date-fns';
import {
  EnvelopeIcon,
  UserPlusIcon,
  XMarkIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  BuildingOfficeIcon,
  DocumentTextIcon,
  CheckIcon
} from '@heroicons/react/24/outline';

interface UnmatchedEmail {
  id: string;
  email_id: string;
  sender_email: string;
  sender_name: string | null;
  subject: string | null;
  snippet: string | null;
  received_at: string;
  suggested_contact_name: string | null;
  suggested_company: string | null;
  matched_object_type: string | null;
  matched_object_id: string | null;
  matched_object_name: string | null;
  match_reason: string | null;
  status: 'pending' | 'approved' | 'dismissed';
  created_at: string;
  email?: {
    body_text: string | null;
    direction: string | null;
  };
}

const SuggestedContactsPage: React.FC = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<UnmatchedEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from('unmatched_email_queue')
        .select(`
          *,
          email:email_id (
            body_text,
            direction
          )
        `)
        .order('received_at', { ascending: false });

      if (filter === 'pending') {
        query = query.eq('status', 'pending');
      }

      const { data, error: fetchError } = await query.limit(100);

      if (fetchError) throw fetchError;
      setItems(data || []);
    } catch (err: any) {
      console.error('Error fetching suggested contacts:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleAddContact = async (item: UnmatchedEmail) => {
    // Navigate to new contact page with pre-filled data
    const params = new URLSearchParams();

    if (item.suggested_contact_name) {
      const nameParts = item.suggested_contact_name.split(' ');
      if (nameParts.length >= 2) {
        params.set('first_name', nameParts[0]);
        params.set('last_name', nameParts.slice(1).join(' '));
      } else {
        params.set('first_name', item.suggested_contact_name);
      }
    } else if (item.sender_name) {
      const nameParts = item.sender_name.split(' ');
      if (nameParts.length >= 2) {
        params.set('first_name', nameParts[0]);
        params.set('last_name', nameParts.slice(1).join(' '));
      } else {
        params.set('first_name', item.sender_name);
      }
    }

    params.set('email', item.sender_email);

    if (item.suggested_company) {
      params.set('company', item.suggested_company);
    }

    // Store the queue item ID to update after contact is created
    sessionStorage.setItem('pending_suggestion_id', item.id);
    sessionStorage.setItem('pending_email_id', item.email_id);

    navigate(`/contact/new?${params.toString()}`);
  };

  const handleDismiss = async (item: UnmatchedEmail, notRelevant: boolean = false) => {
    try {
      setProcessingId(item.id);

      // Update status to dismissed
      await supabase
        .from('unmatched_email_queue')
        .update({
          status: 'dismissed',
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', item.id);

      // If marked as not relevant, log for AI learning
      if (notRelevant) {
        await supabase.from('ai_correction_log').insert({
          correction_type: 'not_relevant',
          email_snippet: item.snippet,
          sender_email: item.sender_email,
          reasoning_hint: 'User marked as not business relevant',
        });
      }

      // Refresh list
      await fetchItems();
    } catch (err: any) {
      console.error('Error dismissing item:', err);
      setError(err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const getObjectTypeIcon = (type: string | null) => {
    switch (type) {
      case 'property':
        return <BuildingOfficeIcon className="w-4 h-4" />;
      case 'deal':
        return <DocumentTextIcon className="w-4 h-4" />;
      case 'client':
        return <BuildingOfficeIcon className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const getObjectTypeLabel = (type: string | null) => {
    switch (type) {
      case 'property':
        return 'Property';
      case 'deal':
        return 'Deal';
      case 'client':
        return 'Client';
      default:
        return 'CRM Object';
    }
  };

  const pendingCount = items.filter(i => i.status === 'pending').length;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Suggested Contacts</h1>
        <p className="mt-1 text-sm text-gray-600">
          Review emails from unknown senders who are discussing your business.
        </p>
      </div>

      {/* Filter Tabs */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setFilter('pending')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              filter === 'pending'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Pending Review
            {pendingCount > 0 && (
              <span className="ml-2 bg-blue-100 text-blue-600 py-0.5 px-2 rounded-full text-xs">
                {pendingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              filter === 'all'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            All
          </button>
        </nav>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-sm text-gray-500">Loading suggestions...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <EnvelopeIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No suggestions</h3>
          <p className="mt-1 text-sm text-gray-500">
            {filter === 'pending'
              ? 'All caught up! No new contacts to review.'
              : 'No suggested contacts found.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div
              key={item.id}
              className={`bg-white border rounded-lg overflow-hidden ${
                item.status !== 'pending' ? 'opacity-60' : ''
              }`}
            >
              {/* Header */}
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    {/* Sender Info */}
                    <div className="flex items-center gap-2 mb-1">
                      <button
                        onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                        className="flex-shrink-0"
                      >
                        {expandedId === item.id ? (
                          <ChevronDownIcon className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronRightIcon className="w-5 h-5 text-gray-400" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {item.sender_name || item.sender_email}
                        </p>
                        {item.sender_name && (
                          <p className="text-xs text-gray-500 truncate">{item.sender_email}</p>
                        )}
                      </div>
                    </div>

                    {/* Subject */}
                    <p className="text-sm text-gray-700 ml-7 truncate">{item.subject || '(No Subject)'}</p>

                    {/* Match Reason */}
                    {item.matched_object_name && (
                      <div className="mt-2 ml-7 flex items-center gap-2 text-xs">
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 text-blue-700">
                          {getObjectTypeIcon(item.matched_object_type)}
                          <span>Discussing: {item.matched_object_name}</span>
                        </span>
                      </div>
                    )}

                    {/* Suggested Info */}
                    {(item.suggested_contact_name || item.suggested_company) && (
                      <div className="mt-2 ml-7 flex items-center gap-2 text-xs text-gray-500">
                        {item.suggested_contact_name && (
                          <span>Suggested name: {item.suggested_contact_name}</span>
                        )}
                        {item.suggested_company && (
                          <span>Company: {item.suggested_company}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 ml-4">
                    {item.status === 'pending' ? (
                      <>
                        <button
                          onClick={() => handleAddContact(item)}
                          disabled={processingId === item.id}
                          className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                        >
                          <UserPlusIcon className="w-4 h-4 mr-1" />
                          Add Contact
                        </button>
                        <button
                          onClick={() => handleDismiss(item, false)}
                          disabled={processingId === item.id}
                          className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                          title="Dismiss without adding"
                        >
                          <XMarkIcon className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          item.status === 'approved'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {item.status === 'approved' ? (
                          <>
                            <CheckIcon className="w-3 h-3 mr-1" />
                            Added
                          </>
                        ) : (
                          'Dismissed'
                        )}
                      </span>
                    )}
                  </div>
                </div>

                {/* Timestamp */}
                <div className="mt-2 ml-7 text-xs text-gray-400">
                  Received {format(new Date(item.received_at), 'MMM d, yyyy h:mm a')}
                </div>
              </div>

              {/* Expanded Content */}
              {expandedId === item.id && (
                <div className="border-t bg-gray-50 p-4">
                  <div className="ml-7">
                    <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Email Preview</h4>
                    <div className="bg-white rounded border p-3 text-sm text-gray-700 whitespace-pre-wrap max-h-64 overflow-y-auto">
                      {item.email?.body_text || item.snippet || 'No preview available'}
                    </div>

                    {item.match_reason && (
                      <div className="mt-4">
                        <h4 className="text-xs font-medium text-gray-500 uppercase mb-1">Why this was flagged</h4>
                        <p className="text-sm text-gray-600">{item.match_reason}</p>
                      </div>
                    )}

                    {item.status === 'pending' && (
                      <div className="mt-4 pt-4 border-t">
                        <button
                          onClick={() => handleDismiss(item, true)}
                          disabled={processingId === item.id}
                          className="text-xs text-gray-500 hover:text-red-600"
                        >
                          Mark as "Not Business Relevant" (helps AI learn)
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SuggestedContactsPage;
