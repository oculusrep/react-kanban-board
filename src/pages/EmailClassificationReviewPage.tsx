import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { format } from 'date-fns';
import {
  EnvelopeIcon,
  CheckCircleIcon,
  XCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  TagIcon,
  PencilIcon,
  TrashIcon,
  PlusIcon,
  SparklesIcon,
  ArrowPathIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';

interface EmailWithLinks {
  id: string;
  subject: string;
  sender_email: string;
  sender_name: string | null;
  snippet: string | null;
  body_text: string | null;
  received_at: string;
  direction: string | null;
  ai_processed: boolean;
  ai_processed_at: string | null;
  links: EmailObjectLink[];
}

interface EmailObjectLink {
  id: string;
  object_type: string;
  object_id: string;
  confidence_score: number;
  reasoning_log: string | null;
  link_source: string;
  created_at: string;
  object_name?: string;
}

interface CRMObject {
  id: string;
  type: string;
  name: string;
}

const EmailClassificationReviewPage: React.FC = () => {
  const [emails, setEmails] = useState<EmailWithLinks[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'linked' | 'unlinked'>('linked');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [showAddLink, setShowAddLink] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CRMObject[]>([]);
  const [searching, setSearching] = useState(false);

  const fetchEmails = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch emails with their links
      let query = supabase
        .from('emails')
        .select(`
          id,
          subject,
          sender_email,
          sender_name,
          snippet,
          body_text,
          received_at,
          direction,
          ai_processed,
          ai_processed_at
        `)
        .eq('ai_processed', true)
        .order('received_at', { ascending: false })
        .limit(50);

      const { data: emailsData, error: emailsError } = await query;
      if (emailsError) throw emailsError;

      // Fetch links for these emails
      const emailIds = (emailsData || []).map(e => e.id);
      const { data: linksData, error: linksError } = await supabase
        .from('email_object_link')
        .select('*')
        .in('email_id', emailIds);

      if (linksError) throw linksError;

      // Resolve object names
      const linksWithNames = await resolveObjectNames(linksData || []);

      // Combine emails with their links
      const emailsWithLinks = (emailsData || []).map(email => ({
        ...email,
        links: linksWithNames.filter(l => l.email_id === email.id),
      }));

      // Apply filter
      let filteredEmails = emailsWithLinks;
      if (filter === 'linked') {
        filteredEmails = emailsWithLinks.filter(e => e.links.length > 0);
      } else if (filter === 'unlinked') {
        filteredEmails = emailsWithLinks.filter(e => e.links.length === 0);
      }

      setEmails(filteredEmails);
    } catch (err: any) {
      console.error('Error fetching emails:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const resolveObjectNames = async (links: any[]): Promise<EmailObjectLink[]> => {
    const resolvedLinks: EmailObjectLink[] = [];

    for (const link of links) {
      let objectName = 'Unknown';
      try {
        if (link.object_type === 'deal') {
          const { data: deal } = await supabase
            .from('deal')
            .select('deal_name')
            .eq('id', link.object_id)
            .single();
          objectName = deal?.deal_name || 'Unknown Deal';
        } else if (link.object_type === 'contact') {
          const { data: contact } = await supabase
            .from('contact')
            .select('first_name, last_name')
            .eq('id', link.object_id)
            .single();
          objectName = contact ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim() : 'Unknown Contact';
        } else if (link.object_type === 'client') {
          const { data: client } = await supabase
            .from('client')
            .select('client_name')
            .eq('id', link.object_id)
            .single();
          objectName = client?.client_name || 'Unknown Client';
        } else if (link.object_type === 'property') {
          const { data: property } = await supabase
            .from('property')
            .select('property_name, address')
            .eq('id', link.object_id)
            .single();
          objectName = property?.property_name || property?.address || 'Unknown Property';
        }
      } catch (e) {
        // Ignore resolution errors
      }
      resolvedLinks.push({ ...link, object_name: objectName });
    }

    return resolvedLinks;
  };

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  const handleRemoveLink = async (linkId: string, emailId: string) => {
    if (!confirm('Remove this classification?')) return;

    setProcessingId(linkId);
    try {
      const { error } = await supabase
        .from('email_object_link')
        .delete()
        .eq('id', linkId);

      if (error) throw error;

      // Update local state
      setEmails(prev =>
        prev.map(email =>
          email.id === emailId
            ? { ...email, links: email.links.filter(l => l.id !== linkId) }
            : email
        )
      );
    } catch (err: any) {
      alert('Error removing link: ' + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleSearch = async (query: string, types: string[] = ['deal', 'contact', 'client', 'property']) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const results: CRMObject[] = [];

      if (types.includes('deal')) {
        const { data: deals } = await supabase
          .from('deal')
          .select('id, deal_name')
          .ilike('deal_name', `%${query}%`)
          .limit(5);
        results.push(...(deals || []).map(d => ({ id: d.id, type: 'deal', name: d.deal_name })));
      }

      if (types.includes('contact')) {
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
      }

      if (types.includes('client')) {
        const { data: clients } = await supabase
          .from('client')
          .select('id, client_name')
          .ilike('client_name', `%${query}%`)
          .limit(5);
        results.push(...(clients || []).map(c => ({ id: c.id, type: 'client', name: c.client_name })));
      }

      if (types.includes('property')) {
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
      }

      setSearchResults(results);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setSearching(false);
    }
  };

  const handleAddLink = async (emailId: string, object: CRMObject) => {
    setProcessingId(emailId);
    try {
      const { data, error } = await supabase
        .from('email_object_link')
        .insert({
          email_id: emailId,
          object_type: object.type,
          object_id: object.id,
          link_source: 'manual',
          confidence_score: 1.0,
          reasoning_log: 'Manually added by user',
        })
        .select()
        .single();

      if (error) throw error;

      // Update local state with the new link
      const newLink: EmailObjectLink = {
        ...data,
        object_name: object.name,
      };

      setEmails(prev =>
        prev.map(email =>
          email.id === emailId
            ? { ...email, links: [...email.links, newLink] }
            : email
        )
      );

      setShowAddLink(null);
      setSearchQuery('');
      setSearchResults([]);
    } catch (err: any) {
      alert('Error adding link: ' + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleCreateRule = async (email: EmailWithLinks, link: EmailObjectLink) => {
    const domain = email.sender_email.split('@')[1];
    const ruleText = `Emails from @${domain} should be linked to ${link.object_type} "${link.object_name}"`;

    if (!confirm(`Create rule?\n\n"${ruleText}"`)) return;

    try {
      const { error } = await supabase
        .from('agent_rules')
        .insert({
          rule_text: ruleText,
          rule_type: 'domain_mapping',
          match_pattern: domain,
          target_object_type: link.object_type,
          target_object_id: link.object_id,
          priority: 50,
          is_active: true,
        });

      if (error) throw error;
      alert('Rule created successfully! The AI will use this for future emails.');
    } catch (err: any) {
      alert('Error creating rule: ' + err.message);
    }
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 0.9) return 'text-green-600 bg-green-100';
    if (score >= 0.7) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
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
            <h1 className="text-2xl font-bold text-gray-900">Email Classification Review</h1>
            <p className="mt-1 text-sm text-gray-500">
              Review AI classifications, correct mistakes, and teach the AI with rules
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/admin/agent-rules"
              className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              <SparklesIcon className="w-4 h-4 mr-2" />
              Manage Rules
            </Link>
            <button
              onClick={() => fetchEmails()}
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
          {(['all', 'linked', 'unlinked'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md ${
                filter === f
                  ? 'bg-purple-100 text-purple-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {f === 'all' ? 'All Processed' : f === 'linked' ? 'With Links' : 'No Links'}
            </button>
          ))}
        </div>
        <span className="text-sm text-gray-500">
          {emails.length} email{emails.length !== 1 ? 's' : ''}
        </span>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
        </div>
      ) : emails.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <EnvelopeIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No emails found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {filter === 'linked'
              ? 'No emails with AI classifications yet.'
              : filter === 'unlinked'
              ? 'All processed emails have been classified.'
              : 'No processed emails found.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {emails.map((email) => (
            <div
              key={email.id}
              className="bg-white border rounded-lg shadow-sm overflow-hidden"
            >
              {/* Email Header */}
              <div
                className="px-4 py-3 cursor-pointer hover:bg-gray-50"
                onClick={() => setExpandedId(expandedId === email.id ? null : email.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    {expandedId === email.id ? (
                      <ChevronDownIcon className="w-5 h-5 text-gray-400 mt-0.5" />
                    ) : (
                      <ChevronRightIcon className="w-5 h-5 text-gray-400 mt-0.5" />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">
                          {email.subject || '(No Subject)'}
                        </span>
                        {email.links.length > 0 && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 rounded-full">
                            {email.links.length} link{email.links.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-sm text-gray-500">
                        {email.sender_name ? `${email.sender_name} <${email.sender_email}>` : email.sender_email}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm text-gray-500">
                    {formatDate(email.received_at)}
                  </div>
                </div>

                {/* Quick view of links */}
                {email.links.length > 0 && expandedId !== email.id && (
                  <div className="mt-2 ml-8 flex flex-wrap gap-2">
                    {email.links.map((link) => (
                      <span
                        key={link.id}
                        className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded ${getObjectTypeColor(link.object_type)}`}
                      >
                        {link.object_type}: {link.object_name}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Expanded Content */}
              {expandedId === email.id && (
                <div className="border-t px-4 py-4">
                  {/* Email Body */}
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Email Content</h4>
                    <div className="text-sm text-gray-600 bg-gray-50 rounded p-3 max-h-40 overflow-y-auto whitespace-pre-wrap">
                      {email.body_text || email.snippet || '(No content)'}
                    </div>
                  </div>

                  {/* Classifications */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-medium text-gray-700">AI Classifications</h4>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowAddLink(showAddLink === email.id ? null : email.id);
                        }}
                        className="inline-flex items-center px-2 py-1 text-xs font-medium text-purple-700 bg-purple-100 rounded hover:bg-purple-200"
                      >
                        <PlusIcon className="w-3 h-3 mr-1" />
                        Add Link
                      </button>
                    </div>

                    {/* Add Link Form */}
                    {showAddLink === email.id && (
                      <div className="mb-3 p-3 bg-purple-50 rounded-lg">
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
                                onClick={() => handleAddLink(email.id, result)}
                                disabled={processingId === email.id}
                                className="w-full flex items-center justify-between px-3 py-2 text-sm text-left bg-white rounded border hover:bg-gray-50 disabled:opacity-50"
                              >
                                <span>
                                  <span className={`inline-block px-1.5 py-0.5 text-xs font-medium rounded mr-2 ${getObjectTypeColor(result.type)}`}>
                                    {result.type}
                                  </span>
                                  {result.name}
                                </span>
                                <PlusIcon className="w-4 h-4 text-gray-400" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {email.links.length === 0 ? (
                      <p className="text-sm text-gray-500 italic">No classifications</p>
                    ) : (
                      <div className="space-y-2">
                        {email.links.map((link) => (
                          <div
                            key={link.id}
                            className="flex items-start justify-between p-3 bg-gray-50 rounded-lg"
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 text-xs font-medium rounded ${getObjectTypeColor(link.object_type)}`}>
                                  {link.object_type}
                                </span>
                                <span className="font-medium text-gray-900">
                                  {link.object_name}
                                </span>
                                <span className={`px-1.5 py-0.5 text-xs rounded ${getConfidenceColor(link.confidence_score)}`}>
                                  {Math.round(link.confidence_score * 100)}%
                                </span>
                                <span className="text-xs text-gray-500">
                                  via {link.link_source === 'ai_agent' ? 'AI' : link.link_source}
                                </span>
                              </div>
                              {link.reasoning_log && (
                                <p className="mt-1 text-sm text-gray-600">
                                  {link.reasoning_log}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 ml-4">
                              <button
                                onClick={() => handleCreateRule(email, link)}
                                className="p-1 text-gray-400 hover:text-purple-600"
                                title="Create rule from this classification"
                              >
                                <SparklesIcon className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleRemoveLink(link.id, email.id)}
                                disabled={processingId === link.id}
                                className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-50"
                                title="Remove this classification"
                              >
                                <TrashIcon className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Processing Info */}
                  <div className="text-xs text-gray-500 border-t pt-3">
                    Processed: {formatDate(email.ai_processed_at)}
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

export default EmailClassificationReviewPage;
