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
  CheckIcon,
  NoSymbolIcon,
  TagIcon,
  PlusIcon,
  SparklesIcon,
  LightBulbIcon,
  CheckCircleIcon,
  ArrowPathIcon,
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
    message_id: string | null;
  };
}

interface CRMObject {
  id: string;
  type: string;
  name: string;
}

interface LinkedObject extends CRMObject {
  reasoning?: string;
}

const SuggestedContactsPage: React.FC = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<UnmatchedEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CRMObject[]>([]);
  const [searching, setSearching] = useState(false);

  // Track multiple linked objects before saving
  const [pendingLinks, setPendingLinks] = useState<Record<string, LinkedObject[]>>({});
  const [feedbackReasoning, setFeedbackReasoning] = useState<Record<string, string>>({});

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
            direction,
            message_id
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

  // Fetch items when filter changes
  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Load current user ID on mount (separate from fetchItems to avoid re-running)
  useEffect(() => {
    const loadUserId = async () => {
      console.log('[User Lookup] Starting user ID lookup...');
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();

        if (authError) {
          console.error('[User Lookup] Auth error:', authError);
          return;
        }

        console.log('[User Lookup] Auth user:', authData.user?.id, authData.user?.email);

        if (authData.user?.email) {
          const { data: userData, error } = await supabase
            .from('user')
            .select('id')
            .eq('email', authData.user.email)
            .single();

          if (error) {
            console.error('[User Lookup] Error fetching user:', error);
            // Fallback to auth.uid() if user table lookup fails
            if (authData.user?.id) {
              console.log('[User Lookup] Using auth.uid() as fallback:', authData.user.id);
              setCurrentUserId(authData.user.id);
            }
          } else if (userData) {
            console.log('[User Lookup] Found user ID:', userData.id);
            setCurrentUserId(userData.id);
          } else {
            console.warn('[User Lookup] No user found for email:', authData.user.email);
            // Fallback to auth.uid()
            if (authData.user?.id) {
              console.log('[User Lookup] Using auth.uid() as fallback:', authData.user.id);
              setCurrentUserId(authData.user.id);
            }
          }
        } else if (authData.user?.id) {
          // No email but we have auth.uid(), use that
          console.log('[User Lookup] No email, using auth.uid():', authData.user.id);
          setCurrentUserId(authData.user.id);
        } else {
          console.warn('[User Lookup] No auth user available');
        }
      } catch (err) {
        console.error('[User Lookup] Exception:', err);
      }
    };
    loadUserId();
  }, []); // Only run once on mount

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

      // Split query into words to search across first_name + last_name
      const queryWords = query.trim().split(/\s+/);
      let contactQuery = supabase
        .from('contact')
        .select('id, first_name, last_name, email');

      if (queryWords.length >= 2) {
        // Multi-word search: try first word as first_name, rest as last_name
        const firstName = queryWords[0];
        const lastName = queryWords.slice(1).join(' ');
        contactQuery = contactQuery.or(
          `first_name.ilike.%${firstName}%,last_name.ilike.%${lastName}%,email.ilike.%${query}%,and(first_name.ilike.%${firstName}%,last_name.ilike.%${lastName}%)`
        );
      } else {
        // Single word: search in any field
        contactQuery = contactQuery.or(
          `first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%`
        );
      }

      const { data: contacts } = await contactQuery.limit(10);
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

  // Add an object to pending links
  const handleAddLink = (itemId: string, object: CRMObject) => {
    setPendingLinks(prev => {
      const existing = prev[itemId] || [];
      if (existing.some(l => l.id === object.id && l.type === object.type)) {
        return prev;
      }
      return { ...prev, [itemId]: [...existing, object] };
    });
    setSearchQuery('');
    setSearchResults([]);
  };

  // Remove a pending link
  const handleRemoveLink = (itemId: string, objectId: string, objectType: string) => {
    setPendingLinks(prev => ({
      ...prev,
      [itemId]: (prev[itemId] || []).filter(l => !(l.id === objectId && l.type === objectType))
    }));
  };

  // Save all pending links and resolve the item
  const handleSaveAndResolve = async (item: UnmatchedEmail) => {
    const links = pendingLinks[item.id] || [];
    if (links.length === 0) {
      alert('Please add at least one link before saving.');
      return;
    }

    setProcessingId(item.id);
    try {
      const reasoning = feedbackReasoning[item.id] || '';

      // Create all the links
      for (const link of links) {
        const { error: linkError } = await supabase
          .from('email_object_link')
          .insert({
            email_id: item.email_id,
            object_type: link.type,
            object_id: link.id,
            link_source: 'manual',
            confidence_score: 1.0,
            reasoning_log: reasoning || `Manually linked from suggested contacts`,
          });

        if (linkError && linkError.code !== '23505') {
          throw linkError;
        }
      }

      // Log the correction for AI learning (only if we have reasoning text)
      if (reasoning) {
        if (!currentUserId) {
          console.warn('[AI Feedback] Cannot log - user ID not loaded yet');
        } else {
          console.log('[AI Feedback] Logging correction with user_id:', currentUserId, 'email_id:', item.email_id);
          const { error: logError } = await supabase.from('ai_correction_log').insert({
            user_id: currentUserId,
            email_id: item.email_id,
            correction_type: 'added_tag',
            object_type: links[0].type,
            correct_object_id: links[0].id,
            email_snippet: item.snippet,
            sender_email: item.sender_email,
            reasoning_hint: reasoning,
          });
          if (logError) {
            console.error('[AI Feedback] Error logging correction:', logError.message, logError.details, logError.hint);
            // Don't throw - this is non-critical
          } else {
            console.log('[AI Feedback] Correction logged successfully');
          }
        }
      }

      // Update the queue item
      const primaryLink = links[0];
      await supabase
        .from('unmatched_email_queue')
        .update({
          status: 'approved',
          matched_object_type: primaryLink.type,
          matched_object_id: primaryLink.id,
          matched_object_name: primaryLink.name,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', item.id);

      // Clear local state
      setPendingLinks(prev => {
        const { [item.id]: _, ...rest } = prev;
        return rest;
      });
      setFeedbackReasoning(prev => {
        const { [item.id]: _, ...rest } = prev;
        return rest;
      });

      // Refresh list
      await fetchItems();
    } catch (err: any) {
      alert('Error saving links: ' + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  // Mark as NOT business - creates exclusion rule and deletes email
  const handleNotBusiness = async (item: UnmatchedEmail) => {
    const domain = item.sender_email.split('@')[1];

    const choice = window.confirm(
      `Mark this as NOT business related?\n\n` +
      `This will:\n` +
      `1. Delete this email from your database\n` +
      `2. Create a rule to auto-delete future emails from @${domain}\n\n` +
      `Continue?`
    );

    if (!choice) return;

    setProcessingId(item.id);
    try {
      // Create exclusion rule
      const { error: ruleError } = await supabase
        .from('agent_rules')
        .insert({
          rule_text: `Emails from @${domain} are not business relevant - auto-delete`,
          rule_type: 'exclusion',
          match_pattern: domain,
          priority: 100,
          is_active: true,
        });

      if (ruleError && ruleError.code !== '23505') {
        throw ruleError;
      }

      // Store message_id to prevent re-fetch (ignore errors - table may not exist)
      if (item.email?.message_id) {
        try {
          await supabase.from('processed_message_ids').upsert(
            {
              message_id: item.email.message_id,
              action: 'deleted',
              processed_at: new Date().toISOString(),
            },
            { onConflict: 'message_id' }
          );
        } catch {
          // Ignore - this is optional tracking
        }
      }

      // Delete the queue entry
      await supabase.from('unmatched_email_queue').delete().eq('id', item.id);

      // Delete the email
      await supabase.from('emails').delete().eq('id', item.email_id);

      // Update local state
      setItems(prev => prev.filter(i => i.id !== item.id));

      alert(`Done! Future emails from @${domain} will be automatically deleted.`);
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setProcessingId(null);
    }
  };

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

  const handleDismiss = async (item: UnmatchedEmail) => {
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

      // Refresh list
      if (filter === 'pending') {
        setItems(prev => prev.filter(i => i.id !== item.id));
      } else {
        setItems(prev =>
          prev.map(i => i.id === item.id ? { ...i, status: 'dismissed' as const } : i)
        );
      }
    } catch (err: any) {
      console.error('Error dismissing item:', err);
      setError(err.message);
    } finally {
      setProcessingId(null);
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

  const pendingCount = items.filter(i => i.status === 'pending').length;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Suggested Contacts</h1>
            <p className="mt-1 text-sm text-gray-600">
              Review emails from unknown senders who are discussing your business.
            </p>
          </div>
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
          <CheckCircleIcon className="mx-auto h-12 w-12 text-green-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">Queue is clear!</h3>
          <p className="mt-1 text-sm text-gray-500">
            {filter === 'pending'
              ? 'All caught up! No new contacts to review.'
              : 'No suggested contacts found.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const isExpanded = expandedId === item.id;
            const itemPendingLinks = pendingLinks[item.id] || [];

            return (
              <div
                key={item.id}
                className={`bg-white border rounded-lg shadow-sm overflow-hidden ${
                  item.status === 'pending' ? 'border-l-4 border-l-yellow-400' : ''
                }`}
              >
                {/* Header */}
                <div className="px-4 py-3">
                  <div className="flex items-start justify-between">
                    {/* Left side - sender info and subject */}
                    <div
                      className="flex-1 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5">
                          {isExpanded ? (
                            <ChevronDownIcon className="w-5 h-5 text-gray-400" />
                          ) : (
                            <ChevronRightIcon className="w-5 h-5 text-gray-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          {/* Name on first line */}
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">
                              {item.suggested_contact_name || item.sender_name || 'Unknown Sender'}
                            </span>
                            {item.status !== 'pending' && (
                              <span
                                className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                  item.status === 'approved'
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-gray-100 text-gray-600'
                                }`}
                              >
                                {item.status === 'approved' ? 'Added' : 'Dismissed'}
                              </span>
                            )}
                          </div>
                          {/* Email on second line - FULL, with word break */}
                          <div className="text-sm text-gray-500 break-all">
                            {item.sender_email}
                          </div>
                          {/* Subject on third line */}
                          <div className="mt-1 text-sm text-gray-700">
                            {item.subject || '(No Subject)'}
                          </div>
                          {/* Company suggestion */}
                          {item.suggested_company && (
                            <div className="mt-1">
                              <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded bg-green-50 text-green-700">
                                Company: {item.suggested_company}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right side - quick actions */}
                    <div className="flex items-center gap-2 ml-4">
                      <span className="text-xs text-gray-500 whitespace-nowrap">
                        {format(new Date(item.received_at), 'MMM d')}
                      </span>

                      {item.status === 'pending' && (
                        <>
                          {/* Add Contact button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedId(item.id);
                            }}
                            className="inline-flex items-center px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-100 rounded hover:bg-blue-200"
                            title="Link to CRM object"
                          >
                            <TagIcon className="w-3.5 h-3.5 mr-1" />
                            Add Contact
                          </button>

                          {/* Not Business button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleNotBusiness(item);
                            }}
                            disabled={processingId === item.id}
                            className="inline-flex items-center px-2.5 py-1.5 text-xs font-medium text-red-700 bg-red-100 rounded hover:bg-red-200 disabled:opacity-50"
                            title="Not business - delete and block sender domain"
                          >
                            <NoSymbolIcon className="w-3.5 h-3.5 mr-1" />
                            Not Business
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="border-t px-4 py-4 bg-gray-50">
                    {/* Match Reason */}
                    {item.match_reason && (
                      <div className="mb-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                        <div className="flex items-start gap-2">
                          <LightBulbIcon className="w-5 h-5 text-yellow-600 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-yellow-800">Why AI flagged this:</p>
                            <p className="text-sm text-yellow-700">{item.match_reason}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Email Preview */}
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Email Preview</h4>
                      <div className="text-sm text-gray-600 bg-white rounded p-3 border max-h-32 overflow-y-auto whitespace-pre-wrap">
                        {item.email?.body_text || item.snippet || '(No content available)'}
                      </div>
                    </div>

                    {/* Link to Object Section */}
                    {item.status === 'pending' && (
                      <div className="mb-4 p-4 bg-white rounded-lg border">
                        <h4 className="text-sm font-medium text-gray-900 mb-3">
                          Link this email to CRM objects
                        </h4>

                        {/* Pending links */}
                        {itemPendingLinks.length > 0 && (
                          <div className="mb-3">
                            <p className="text-xs text-gray-500 mb-2">Objects to link:</p>
                            <div className="flex flex-wrap gap-2">
                              {itemPendingLinks.map((link) => (
                                <span
                                  key={`${link.type}-${link.id}`}
                                  className={`inline-flex items-center px-2 py-1 text-sm rounded ${getObjectTypeColor(link.type)}`}
                                >
                                  <span className="font-medium mr-1">{link.type}:</span>
                                  {link.name}
                                  <button
                                    onClick={() => handleRemoveLink(item.id, link.id, link.type)}
                                    className="ml-2 hover:text-red-600"
                                  >
                                    <XMarkIcon className="w-4 h-4" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Search input */}
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="Search for deal, contact, client, or property..."
                            value={searchQuery}
                            onChange={(e) => {
                              setSearchQuery(e.target.value);
                              handleSearch(e.target.value);
                            }}
                            className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                          {searching && (
                            <div className="absolute right-3 top-2.5">
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                            </div>
                          )}
                        </div>

                        {/* Search results */}
                        {searchResults.length > 0 && (
                          <div className="mt-2 border rounded-md divide-y max-h-48 overflow-y-auto">
                            {searchResults.map((result) => (
                              <button
                                key={`${result.type}-${result.id}`}
                                onClick={() => handleAddLink(item.id, result)}
                                className="w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-gray-50"
                              >
                                <span className="flex items-center gap-2">
                                  <span className={`inline-block px-1.5 py-0.5 text-xs font-medium rounded ${getObjectTypeColor(result.type)}`}>
                                    {result.type}
                                  </span>
                                  <span className="truncate">{result.name}</span>
                                </span>
                                <PlusIcon className="w-4 h-4 text-gray-400" />
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Create new contact button */}
                        <div className="mt-3 flex items-center gap-2">
                          <button
                            onClick={() => handleAddContact(item)}
                            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                          >
                            <UserPlusIcon className="w-4 h-4 mr-1" />
                            Create New Contact
                          </button>
                        </div>

                        {/* Save button */}
                        {itemPendingLinks.length > 0 && (
                          <div className="mt-4 flex justify-end">
                            <button
                              onClick={() => handleSaveAndResolve(item)}
                              disabled={processingId === item.id}
                              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                            >
                              <CheckCircleIcon className="w-4 h-4 mr-2" />
                              Save & Resolve
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* AI Training / Feedback Section - Always visible for pending items */}
                    {item.status === 'pending' && (
                      <div className="mb-4 p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200">
                        <div className="flex items-start gap-3">
                          <SparklesIcon className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <h4 className="text-sm font-medium text-purple-900 mb-2">
                              Train the AI
                            </h4>
                            <p className="text-xs text-purple-700 mb-3">
                              Help the AI learn from this example. Your feedback improves future classifications.
                            </p>

                            {/* Quick feedback buttons */}
                            <div className="flex flex-wrap gap-2 mb-3">
                              <button
                                onClick={() => setFeedbackReasoning(prev => ({
                                  ...prev,
                                  [item.id]: `This person (${item.sender_email}) is a known contact in our CRM. The AI should recognize contacts by their email address.`
                                }))}
                                className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-purple-700 bg-purple-100 rounded-full hover:bg-purple-200 transition-colors"
                              >
                                Already in contacts
                              </button>
                              <button
                                onClick={() => setFeedbackReasoning(prev => ({
                                  ...prev,
                                  [item.id]: `This sender works for a company that is already a client in our CRM. Link emails from this domain to the client.`
                                }))}
                                className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-purple-700 bg-purple-100 rounded-full hover:bg-purple-200 transition-colors"
                              >
                                Works for existing client
                              </button>
                              <button
                                onClick={() => setFeedbackReasoning(prev => ({
                                  ...prev,
                                  [item.id]: `This email is related to an active deal. The subject/content mentions the property or client.`
                                }))}
                                className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-purple-700 bg-purple-100 rounded-full hover:bg-purple-200 transition-colors"
                              >
                                Related to a deal
                              </button>
                              <button
                                onClick={() => setFeedbackReasoning(prev => ({
                                  ...prev,
                                  [item.id]: `This is a new business contact who should be added to the CRM. They are a potential lead.`
                                }))}
                                className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-purple-700 bg-purple-100 rounded-full hover:bg-purple-200 transition-colors"
                              >
                                New business lead
                              </button>
                            </div>

                            {/* Detailed feedback textarea */}
                            <textarea
                              placeholder="Add details about why this email should be linked this way. For example: 'Noree works for Oculus and handles our property inquiries' or 'This domain is our accounting firm'..."
                              value={feedbackReasoning[item.id] || ''}
                              onChange={(e) => setFeedbackReasoning(prev => ({ ...prev, [item.id]: e.target.value }))}
                              className="w-full px-3 py-2 border border-purple-200 rounded-md text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white"
                              rows={3}
                            />
                            <p className="mt-1 text-xs text-purple-600">
                              Tip: Explain relationships (who works where, which deals they're involved in) to help the AI make better connections.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Actions for pending items */}
                    {item.status === 'pending' && (
                      <div className="flex flex-wrap gap-2 pt-2">
                        <button
                          onClick={() => handleDismiss(item)}
                          disabled={processingId === item.id}
                          className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50"
                        >
                          <XMarkIcon className="w-4 h-4 mr-1" />
                          Keep but ignore
                        </button>
                      </div>
                    )}

                    {/* Resolution Info for resolved items */}
                    {item.status !== 'pending' && (
                      <div className="text-sm text-gray-500 pt-2">
                        {item.status === 'approved' && item.matched_object_type && (
                          <span className="flex items-center gap-2">
                            <CheckCircleIcon className="w-4 h-4 text-green-500" />
                            Linked to {item.matched_object_type}: {item.matched_object_name}
                          </span>
                        )}
                        {item.status === 'dismissed' && (
                          <span className="flex items-center gap-2">
                            <XMarkIcon className="w-4 h-4 text-gray-400" />
                            Dismissed (kept in database)
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SuggestedContactsPage;
