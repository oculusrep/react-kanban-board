import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { format } from 'date-fns';
import {
  EnvelopeIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XMarkIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  UserPlusIcon,
  TagIcon,
  ArrowPathIcon,
  FunnelIcon,
  SparklesIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';

interface FlaggedEmail {
  id: string;
  email_id: string;
  sender_email: string;
  sender_name: string | null;
  subject: string | null;
  snippet: string | null;
  received_at: string;
  suggested_contact_name: string | null;
  suggested_company: string | null;
  match_reason: string | null;
  status: 'pending' | 'resolved' | 'dismissed';
  created_at: string;
  reviewed_at: string | null;
  email?: {
    body_text: string | null;
    direction: string | null;
  };
}

interface CRMObject {
  id: string;
  type: string;
  name: string;
}

const FlaggedEmailQueuePage: React.FC = () => {
  const [items, setItems] = useState<FlaggedEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [showLinkModal, setShowLinkModal] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CRMObject[]>([]);
  const [searching, setSearching] = useState(false);

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Use service role via edge function or direct query
      // Note: RLS requires gmail_connection_id, so we query via emails join
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

      if (fetchError) {
        // If RLS blocks access, show helpful message
        if (fetchError.code === '42501') {
          setError('Access denied. The flagged email queue requires proper permissions.');
          setItems([]);
          return;
        }
        throw fetchError;
      }

      setItems(data || []);
    } catch (err: any) {
      console.error('Error fetching flagged emails:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleSearch = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const results: CRMObject[] = [];

      const { data: deals } = await supabase
        .from('deal')
        .select('id, deal_name')
        .ilike('deal_name', `%${query}%`)
        .limit(5);
      results.push(...(deals || []).map(d => ({ id: d.id, type: 'deal', name: d.deal_name })));

      const { data: contacts } = await supabase
        .from('contact')
        .select('id, first_name, last_name, email')
        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%`)
        .limit(5);
      results.push(...(contacts || []).map(c => ({
        id: c.id,
        type: 'contact',
        name: `${c.first_name || ''} ${c.last_name || ''}`.trim() + (c.email ? ` (${c.email})` : ''),
      })));

      const { data: clients } = await supabase
        .from('client')
        .select('id, client_name')
        .ilike('client_name', `%${query}%`)
        .limit(5);
      results.push(...(clients || []).map(c => ({ id: c.id, type: 'client', name: c.client_name })));

      const { data: properties } = await supabase
        .from('property')
        .select('id, property_name, address')
        .or(`property_name.ilike.%${query}%,address.ilike.%${query}%`)
        .limit(5);
      results.push(...(properties || []).map(p => ({
        id: p.id,
        type: 'property',
        name: p.property_name || p.address || 'Unknown',
      })));

      setSearchResults(results);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setSearching(false);
    }
  };

  const handleLinkAndResolve = async (item: FlaggedEmail, object: CRMObject) => {
    setProcessingId(item.id);
    try {
      // Create the link
      const { error: linkError } = await supabase
        .from('email_object_link')
        .insert({
          email_id: item.email_id,
          object_type: object.type,
          object_id: object.id,
          link_source: 'manual',
          confidence_score: 1.0,
          reasoning_log: `Manually resolved from flagged queue: ${item.match_reason || 'User selected'}`,
        });

      if (linkError) throw linkError;

      // Update the queue item
      const { error: updateError } = await supabase
        .from('unmatched_email_queue')
        .update({
          status: 'resolved',
          matched_object_type: object.type,
          matched_object_id: object.id,
          matched_object_name: object.name,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', item.id);

      if (updateError) throw updateError;

      // Update local state
      if (filter === 'pending') {
        setItems(prev => prev.filter(i => i.id !== item.id));
      } else {
        setItems(prev =>
          prev.map(i =>
            i.id === item.id
              ? { ...i, status: 'resolved' as const, matched_object_type: object.type, matched_object_id: object.id, matched_object_name: object.name }
              : i
          )
        );
      }

      setShowLinkModal(null);
      setSearchQuery('');
      setSearchResults([]);
    } catch (err: any) {
      alert('Error linking email: ' + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleDismiss = async (item: FlaggedEmail) => {
    if (!confirm('Dismiss this flagged email? It will be marked as not relevant.')) return;

    setProcessingId(item.id);
    try {
      const { error } = await supabase
        .from('unmatched_email_queue')
        .update({
          status: 'dismissed',
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', item.id);

      if (error) throw error;

      if (filter === 'pending') {
        setItems(prev => prev.filter(i => i.id !== item.id));
      } else {
        setItems(prev =>
          prev.map(i => i.id === item.id ? { ...i, status: 'dismissed' as const } : i)
        );
      }
    } catch (err: any) {
      alert('Error dismissing: ' + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleCreateContact = (item: FlaggedEmail) => {
    // Navigate to contact creation with pre-filled data
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
    params.set('queue_id', item.id);

    window.open(`/contact/new?${params.toString()}`, '_blank');
  };

  const handleCreateRule = async (item: FlaggedEmail) => {
    const domain = item.sender_email.split('@')[1];
    const ruleType = prompt(
      'What type of rule?\n\n1. Ignore all emails from this domain\n2. Link to specific object\n\nEnter 1 or 2:',
      '1'
    );

    if (!ruleType) return;

    try {
      if (ruleType === '1') {
        const { error } = await supabase
          .from('agent_rules')
          .insert({
            rule_text: `Emails from @${domain} are not business relevant and should be ignored`,
            rule_type: 'exclusion',
            match_pattern: domain,
            priority: 100,
            is_active: true,
          });
        if (error) throw error;
        alert(`Rule created: Emails from @${domain} will be ignored`);
      } else if (ruleType === '2') {
        // Show link modal to select object
        setShowLinkModal(item.id);
        alert('Select an object to link, then the rule will be created automatically.');
      }
    } catch (err: any) {
      alert('Error creating rule: ' + err.message);
    }
  };

  const getObjectTypeColor = (type: string) => {
    switch (type) {
      case 'deal': return 'bg-purple-100 text-purple-800';
      case 'contact': return 'bg-blue-100 text-blue-800';
      case 'client': return 'bg-green-100 text-green-800';
      case 'property': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">Pending</span>;
      case 'resolved':
        return <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 rounded-full">Resolved</span>;
      case 'dismissed':
        return <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">Dismissed</span>;
      default:
        return null;
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    try {
      return format(new Date(dateStr), 'MMM d, yyyy h:mm a');
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Flagged Email Queue</h1>
            <p className="mt-1 text-sm text-gray-500">
              Emails the AI was uncertain about - review and classify manually
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/admin/email-review"
              className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              <TagIcon className="w-4 h-4 mr-2" />
              All Classifications
            </Link>
            <button
              onClick={() => fetchItems()}
              disabled={loading}
              className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              <ArrowPathIcon className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 flex items-center gap-4">
        <FunnelIcon className="w-5 h-5 text-gray-400" />
        <div className="flex gap-2">
          {(['pending', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md ${
                filter === f
                  ? 'bg-yellow-100 text-yellow-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {f === 'pending' ? 'Needs Review' : 'All'}
            </button>
          ))}
        </div>
        <span className="text-sm text-gray-500">
          {items.length} item{items.length !== 1 ? 's' : ''}
        </span>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-600"></div>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <CheckCircleIcon className="mx-auto h-12 w-12 text-green-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">Queue is clear!</h3>
          <p className="mt-1 text-sm text-gray-500">
            {filter === 'pending'
              ? 'No emails need review right now.'
              : 'No flagged emails found.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div
              key={item.id}
              className={`bg-white border rounded-lg shadow-sm overflow-hidden ${
                item.status === 'pending' ? 'border-yellow-200' : ''
              }`}
            >
              {/* Header */}
              <div
                className="px-4 py-3 cursor-pointer hover:bg-gray-50"
                onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    {expandedId === item.id ? (
                      <ChevronDownIcon className="w-5 h-5 text-gray-400 mt-0.5" />
                    ) : (
                      <ChevronRightIcon className="w-5 h-5 text-gray-400 mt-0.5" />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <ExclamationTriangleIcon className="w-4 h-4 text-yellow-500" />
                        <span className="font-medium text-gray-900">
                          {item.subject || '(No Subject)'}
                        </span>
                        {getStatusBadge(item.status)}
                      </div>
                      <div className="mt-1 text-sm text-gray-500">
                        {item.sender_name ? `${item.sender_name} <${item.sender_email}>` : item.sender_email}
                      </div>
                      {item.match_reason && (
                        <div className="mt-1 text-sm text-yellow-600">
                          <span className="font-medium">Reason:</span> {item.match_reason}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-sm text-gray-500">
                    {formatDate(item.received_at)}
                  </div>
                </div>

                {/* AI Suggestions */}
                {(item.suggested_contact_name || item.suggested_company) && (
                  <div className="mt-2 ml-8 flex flex-wrap gap-2">
                    {item.suggested_contact_name && (
                      <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded bg-blue-50 text-blue-700">
                        Suggested: {item.suggested_contact_name}
                      </span>
                    )}
                    {item.suggested_company && (
                      <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded bg-green-50 text-green-700">
                        Company: {item.suggested_company}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Expanded Content */}
              {expandedId === item.id && (
                <div className="border-t px-4 py-4">
                  {/* Email Content */}
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Email Content</h4>
                    <div className="text-sm text-gray-600 bg-gray-50 rounded p-3 max-h-40 overflow-y-auto whitespace-pre-wrap">
                      {item.email?.body_text || item.snippet || '(No content available)'}
                    </div>
                  </div>

                  {/* Link to Object Form */}
                  {showLinkModal === item.id && (
                    <div className="mb-4 p-3 bg-purple-50 rounded-lg border border-purple-200">
                      <h4 className="text-sm font-medium text-purple-900 mb-2">Link to CRM Object</h4>
                      <input
                        type="text"
                        placeholder="Search for deal, contact, client, or property..."
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          handleSearch(e.target.value);
                        }}
                        className="w-full px-3 py-2 border rounded-md text-sm"
                        autoFocus
                      />
                      {searching && (
                        <div className="mt-2 text-sm text-gray-500">Searching...</div>
                      )}
                      {searchResults.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {searchResults.map((result) => (
                            <button
                              key={`${result.type}-${result.id}`}
                              onClick={() => handleLinkAndResolve(item, result)}
                              disabled={processingId === item.id}
                              className="w-full flex items-center justify-between px-3 py-2 text-sm text-left bg-white rounded border hover:bg-gray-50 disabled:opacity-50"
                            >
                              <span>
                                <span className={`inline-block px-1.5 py-0.5 text-xs font-medium rounded mr-2 ${getObjectTypeColor(result.type)}`}>
                                  {result.type}
                                </span>
                                {result.name}
                              </span>
                              <CheckCircleIcon className="w-4 h-4 text-green-500" />
                            </button>
                          ))}
                        </div>
                      )}
                      <button
                        onClick={() => {
                          setShowLinkModal(null);
                          setSearchQuery('');
                          setSearchResults([]);
                        }}
                        className="mt-2 text-sm text-gray-500 hover:text-gray-700"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {/* Actions */}
                  {item.status === 'pending' && showLinkModal !== item.id && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setShowLinkModal(item.id)}
                        className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-purple-700 bg-purple-100 rounded-md hover:bg-purple-200"
                      >
                        <TagIcon className="w-4 h-4 mr-1" />
                        Link to Object
                      </button>
                      <button
                        onClick={() => handleCreateContact(item)}
                        className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-100 rounded-md hover:bg-blue-200"
                      >
                        <UserPlusIcon className="w-4 h-4 mr-1" />
                        Create Contact
                      </button>
                      <button
                        onClick={() => handleCreateRule(item)}
                        className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                      >
                        <SparklesIcon className="w-4 h-4 mr-1" />
                        Create Rule
                      </button>
                      <button
                        onClick={() => handleDismiss(item)}
                        disabled={processingId === item.id}
                        className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-red-700 bg-red-100 rounded-md hover:bg-red-200 disabled:opacity-50"
                      >
                        <XMarkIcon className="w-4 h-4 mr-1" />
                        Dismiss
                      </button>
                    </div>
                  )}

                  {/* Resolution Info */}
                  {item.status !== 'pending' && (
                    <div className="text-sm text-gray-500">
                      {item.status === 'resolved' && item.matched_object_type && (
                        <span>
                          Linked to {item.matched_object_type}: {item.matched_object_name}
                        </span>
                      )}
                      {item.status === 'dismissed' && <span>Dismissed as not relevant</span>}
                      {item.reviewed_at && (
                        <span className="ml-2">({formatDate(item.reviewed_at)})</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FlaggedEmailQueuePage;
