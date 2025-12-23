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
  ChevronLeftIcon,
  PencilIcon,
  TrashIcon,
  PlusIcon,
  SparklesIcon,
  ArrowPathIcon,
  FunnelIcon,
  XMarkIcon,
  NoSymbolIcon,
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
  hasReview: boolean; // Whether feedback/correction has been logged for this email
  reviewType: 'none' | 'feedback' | 'not_business'; // Type of review
  pendingChanges?: boolean; // Track if user has made changes in this session (links added, feedback given)
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

// Correction modal state
interface CorrectionModalState {
  isOpen: boolean;
  email: EmailWithLinks | null;
  incorrectLink: EmailObjectLink | null;
  correctObject: CRMObject | null;
  feedbackText: string;
}

// Not Business modal state
interface NotBusinessModalState {
  isOpen: boolean;
  email: EmailWithLinks | null;
  createRule: boolean;
  ruleType: 'sender' | 'domain';
}

const EmailClassificationReviewPage: React.FC = () => {
  const [emails, setEmails] = useState<EmailWithLinks[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'linked' | 'unlinked'>('linked');
  const [reviewFilter, setReviewFilter] = useState<'needs_review' | 'reviewed' | 'all'>('needs_review');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [showAddLink, setShowAddLink] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CRMObject[]>([]);
  const [searching, setSearching] = useState(false);
  const [feedbackReasoning, setFeedbackReasoning] = useState<Record<string, string>>({});
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);

  // Correction modal state
  const [correctionModal, setCorrectionModal] = useState<CorrectionModalState>({
    isOpen: false,
    email: null,
    incorrectLink: null,
    correctObject: null,
    feedbackText: '',
  });
  const [correctionSearchQuery, setCorrectionSearchQuery] = useState('');
  const [correctionSearchResults, setCorrectionSearchResults] = useState<CRMObject[]>([]);
  const [correctionSearching, setCorrectionSearching] = useState(false);

  // Not Business modal state
  const [notBusinessModal, setNotBusinessModal] = useState<NotBusinessModalState>({
    isOpen: false,
    email: null,
    createRule: false,
    ruleType: 'domain',
  });

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

      // Fetch reviewed email IDs from ai_correction_log with correction_type
      const { data: correctionLogData } = await supabase
        .from('ai_correction_log')
        .select('email_id, correction_type')
        .in('email_id', emailIds);

      // Fetch reviewed email IDs from agent_corrections
      const { data: agentCorrectionsData } = await supabase
        .from('agent_corrections')
        .select('email_id')
        .in('email_id', emailIds);

      // Build a map of email_id -> review type
      const reviewTypeMap = new Map<string, 'feedback' | 'not_business'>();

      // Process ai_correction_log entries
      for (const correction of correctionLogData || []) {
        if (correction.email_id) {
          if (correction.correction_type === 'not_business') {
            reviewTypeMap.set(correction.email_id, 'not_business');
          } else if (!reviewTypeMap.has(correction.email_id)) {
            reviewTypeMap.set(correction.email_id, 'feedback');
          }
        }
      }

      // Process agent_corrections entries (these are always feedback type)
      for (const correction of agentCorrectionsData || []) {
        if (correction.email_id && !reviewTypeMap.has(correction.email_id)) {
          reviewTypeMap.set(correction.email_id, 'feedback');
        }
      }

      // Resolve object names
      const linksWithNames = await resolveObjectNames(linksData || []);

      // Combine emails with their links and review status
      const emailsWithLinks = (emailsData || []).map(email => ({
        ...email,
        links: linksWithNames.filter(l => l.email_id === email.id),
        hasReview: reviewTypeMap.has(email.id),
        reviewType: reviewTypeMap.get(email.id) || 'none' as const,
      }));

      // Apply link filter
      let filteredEmails = emailsWithLinks;
      if (filter === 'linked') {
        filteredEmails = emailsWithLinks.filter(e => e.links.length > 0);
      } else if (filter === 'unlinked') {
        filteredEmails = emailsWithLinks.filter(e => e.links.length === 0);
      }

      // Apply review filter
      if (reviewFilter === 'needs_review') {
        filteredEmails = filteredEmails.filter(e => !e.hasReview);
      } else if (reviewFilter === 'reviewed') {
        filteredEmails = filteredEmails.filter(e => e.hasReview);
      }

      setEmails(filteredEmails);
    } catch (err: any) {
      console.error('Error fetching emails:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filter, reviewFilter]);

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

  // Load current user ID on mount (separate from fetchEmails to avoid re-running)
  useEffect(() => {
    const loadUserId = async () => {
      console.log('[User Lookup] Starting user ID lookup...');
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();

        if (authError) {
          console.error('[User Lookup] Auth error:', authError);
          return;
        }

        if (authData.user?.email) {
          // Try to get the user ID from the user table
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
            console.log('[User Lookup] Found user:', userData.id);
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
  }, []);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  const handleRemoveLink = async (linkId: string, emailId: string) => {
    if (!confirm('Remove this classification?')) return;

    setProcessingId(linkId);
    try {
      // Find the email and link for logging
      const email = emails.find(e => e.id === emailId);
      const link = email?.links.find(l => l.id === linkId);

      // Delete the link
      const { error } = await supabase
        .from('email_object_link')
        .delete()
        .eq('id', linkId);

      if (error) throw error;

      // Log removal as training data (AI was wrong to add this)
      if (email && link && link.link_source === 'ai_agent') {
        await supabase.from('agent_corrections').insert({
          email_id: emailId,
          incorrect_link_id: linkId,
          incorrect_object_type: link.object_type,
          incorrect_object_id: link.object_id,
          correct_object_type: 'none', // Indicates removal - should not have been linked
          correct_object_id: '00000000-0000-0000-0000-000000000000', // Null UUID placeholder
          feedback_text: `AI incorrectly linked to ${link.object_type} "${link.object_name}" - user removed this link`,
          sender_email: email.sender_email,
          email_subject: email.subject,
        }).then(() => {}).catch(err => console.error('Failed to log removal:', err));
      }

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
        // Smart contact search: split query into words to search across first_name + last_name
        const queryWords = query.trim().split(/\s+/);
        let contactQuery = supabase
          .from('contact')
          .select('id, first_name, last_name, email');

        if (queryWords.length >= 2) {
          // Multi-word search: first word as first_name, rest as last_name
          const firstName = queryWords[0];
          const lastName = queryWords.slice(1).join(' ');
          contactQuery = contactQuery.or(
            `and(first_name.ilike.%${firstName}%,last_name.ilike.%${lastName}%),email.ilike.%${query}%`
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
      // Find the email for logging
      const email = emails.find(e => e.id === emailId);

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

      // Log addition as training data (AI missed this link)
      if (email && email.ai_processed) {
        await supabase.from('agent_corrections').insert({
          email_id: emailId,
          incorrect_link_id: null, // No incorrect link - this is a missed classification
          incorrect_object_type: 'none', // AI didn't link to anything (missed it)
          incorrect_object_id: '00000000-0000-0000-0000-000000000000',
          correct_object_type: object.type,
          correct_object_id: object.id,
          feedback_text: `AI missed linking to ${object.type} "${object.name}" - user manually added this link`,
          sender_email: email.sender_email,
          email_subject: email.subject,
        }).then(() => {}).catch(err => console.error('Failed to log addition:', err));
      }

      // Create activity record if linking to a deal (so it shows in deal timeline)
      if (object.type === 'deal' && email) {
        // Get the Email activity type ID
        const { data: emailActivityType } = await supabase
          .from('activity_type')
          .select('id')
          .eq('name', 'Email')
          .single();

        if (emailActivityType) {
          const { error: activityError } = await supabase.from('activity').insert({
            activity_type_id: emailActivityType.id,
            subject: email.subject || 'Email',
            description: email.snippet || email.body_text?.substring(0, 500),
            activity_date: email.received_at,
            email_id: emailId,
            direction: email.direction,
            sf_status: 'Completed',
            deal_id: object.id,
          });

          if (activityError) {
            // Ignore duplicate key errors
            if (activityError.code !== '23505') {
              console.error('Failed to create activity:', activityError);
            }
          } else {
            console.log('[Manual Link] Created activity for deal:', object.id);
          }
        }
      }

      // Update local state with the new link and mark as having pending changes
      // Don't auto-remove from list - let user add more links/feedback before marking reviewed
      const newLink: EmailObjectLink = {
        ...data,
        object_name: object.name,
      };

      setEmails(prev =>
        prev.map(e =>
          e.id === emailId
            ? { ...e, links: [...e.links, newLink], pendingChanges: true }
            : e
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

  const handleSaveFeedback = async (email: EmailWithLinks) => {
    const reasoning = feedbackReasoning[email.id];
    if (!reasoning?.trim()) {
      alert('Please enter feedback before saving.');
      return;
    }

    if (!currentUserId) {
      console.warn('[AI Feedback] Cannot log - user ID not loaded yet');
      alert('Unable to save feedback: User ID not loaded. Please try again.');
      return;
    }

    setProcessingId(email.id);
    try {
      console.log('[AI Feedback] Logging feedback with user_id:', currentUserId, 'email_id:', email.id);

      // Log the correction for AI learning
      const { error } = await supabase.from('ai_correction_log').insert({
        user_id: currentUserId,
        email_id: email.id,
        correction_type: 'feedback',
        email_snippet: email.snippet || email.body_text?.substring(0, 200),
        sender_email: email.sender_email,
        reasoning_hint: reasoning,
      });

      if (error) {
        console.error('[AI Feedback] Error:', error.message, error.details, error.hint);
        throw error;
      }

      console.log('[AI Feedback] Feedback saved successfully');

      // Clear the feedback
      setFeedbackReasoning(prev => {
        const { [email.id]: _, ...rest } = prev;
        return rest;
      });

      // Mark email as having pending changes - don't auto-remove from list
      setEmails(prev =>
        prev.map(e => e.id === email.id ? { ...e, pendingChanges: true } : e)
      );

      alert('Feedback saved! Click "Mark Reviewed" when you\'re done with this email.');
    } catch (err: any) {
      alert('Error saving feedback: ' + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  // Explicitly mark an email as reviewed and remove from "Needs Review" list
  const handleMarkReviewed = async (email: EmailWithLinks) => {
    if (!currentUserId) {
      alert('Unable to save: User ID not loaded. Please try again.');
      return;
    }

    setProcessingId(email.id);
    try {
      // Log to ai_correction_log that the email was reviewed (even if no specific feedback)
      const { error } = await supabase.from('ai_correction_log').insert({
        user_id: currentUserId,
        email_id: email.id,
        correction_type: 'reviewed',
        email_snippet: email.snippet || email.body_text?.substring(0, 200),
        sender_email: email.sender_email,
        reasoning_hint: 'User marked email as reviewed after checking classifications',
      });

      if (error) {
        console.error('[Mark Reviewed] Error:', error.message, error.details);
        throw error;
      }

      // Remove from the list if on "needs_review" view, otherwise mark as reviewed
      setEmails(prev => {
        if (reviewFilter === 'needs_review') {
          return prev.filter(e => e.id !== email.id);
        }
        return prev.map(e =>
          e.id === email.id
            ? { ...e, hasReview: true, reviewType: 'feedback', pendingChanges: false }
            : e
        );
      });
    } catch (err: any) {
      alert('Error marking as reviewed: ' + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  // Bulk mark selected emails as reviewed
  const handleBulkMarkReviewed = async () => {
    if (selectedIds.size === 0) return;
    if (!currentUserId) {
      alert('Unable to save: User ID not loaded. Please try again.');
      return;
    }

    setBulkProcessing(true);
    try {
      const selectedEmails = emails.filter(e => selectedIds.has(e.id));

      // Insert all corrections in one batch
      const corrections = selectedEmails.map(email => ({
        user_id: currentUserId,
        email_id: email.id,
        correction_type: 'reviewed',
        email_snippet: email.snippet || email.body_text?.substring(0, 200),
        sender_email: email.sender_email,
        reasoning_hint: 'User marked email as reviewed after checking classifications (bulk action)',
      }));

      const { error } = await supabase.from('ai_correction_log').insert(corrections);
      if (error) throw error;

      // Remove from list if on "needs_review" view
      setEmails(prev => {
        if (reviewFilter === 'needs_review') {
          return prev.filter(e => !selectedIds.has(e.id));
        }
        return prev.map(e =>
          selectedIds.has(e.id)
            ? { ...e, hasReview: true, reviewType: 'feedback' as const, pendingChanges: false }
            : e
        );
      });

      // Clear selection
      setSelectedIds(new Set());
    } catch (err: any) {
      alert('Error marking emails as reviewed: ' + err.message);
    } finally {
      setBulkProcessing(false);
    }
  };

  // Toggle selection for a single email
  const toggleSelection = (emailId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(emailId)) {
        next.delete(emailId);
      } else {
        next.add(emailId);
      }
      return next;
    });
  };

  // Select all / deselect all
  const toggleSelectAll = () => {
    if (selectedIds.size === emails.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(emails.map(e => e.id)));
    }
  };

  // Open Not Business modal
  const openNotBusinessModal = (email: EmailWithLinks) => {
    setNotBusinessModal({
      isOpen: true,
      email,
      createRule: false,
      ruleType: 'domain',
    });
  };

  // Close Not Business modal
  const closeNotBusinessModal = () => {
    setNotBusinessModal({
      isOpen: false,
      email: null,
      createRule: false,
      ruleType: 'domain',
    });
  };

  // Handle Not Business action
  const handleNotBusiness = async () => {
    const { email, createRule, ruleType } = notBusinessModal;

    if (!email) return;

    if (!currentUserId) {
      alert('Unable to save: User ID not loaded. Please try again.');
      return;
    }

    setProcessingId(email.id);
    try {
      // 1. Remove all AI links for this email
      if (email.links.length > 0) {
        const aiLinkIds = email.links
          .filter(l => l.link_source === 'ai_agent')
          .map(l => l.id);

        if (aiLinkIds.length > 0) {
          const { error: deleteError } = await supabase
            .from('email_object_link')
            .delete()
            .in('id', aiLinkIds);

          if (deleteError) throw deleteError;
        }
      }

      // 2. Log to ai_correction_log with correction_type = 'not_business'
      console.log('[Not Business] Logging with user_id:', currentUserId, 'email_id:', email.id);
      const { error: logError } = await supabase.from('ai_correction_log').insert({
        user_id: currentUserId,
        email_id: email.id,
        correction_type: 'not_business',
        email_snippet: email.snippet || email.body_text?.substring(0, 200),
        sender_email: email.sender_email,
        reasoning_hint: `Marked as not business related. ${createRule ? `Created ${ruleType} exclusion rule.` : ''}`,
      });

      if (logError) {
        console.error('[Not Business] Error logging:', logError.message, logError.details, logError.hint);
        throw logError;
      }
      console.log('[Not Business] Successfully logged to ai_correction_log');

      // 3. Optionally create exclusion rule
      if (createRule) {
        const domain = email.sender_email.split('@')[1];
        const matchPattern = ruleType === 'domain' ? domain : email.sender_email;
        const ruleText = ruleType === 'domain'
          ? `Exclude all emails from @${domain} (not business related)`
          : `Exclude emails from ${email.sender_email} (not business related)`;

        const { error: ruleError } = await supabase.from('agent_rules').insert({
          rule_text: ruleText,
          rule_type: 'exclusion',
          match_pattern: matchPattern,
          priority: 100,
          is_active: true,
        });

        if (ruleError) {
          console.error('[Not Business] Error creating rule:', ruleError);
          // Don't throw - rule creation is optional
        }
      }

      // 4. Update local state - filter out if on "needs_review" view
      console.log('[Not Business] Updating local state for email:', email.id);
      setEmails(prev => {
        // If we're on "needs_review" filter, remove the email from the list
        if (reviewFilter === 'needs_review') {
          console.log('[Not Business] Removing email from needs_review list:', email.id);
          return prev.filter(e => e.id !== email.id);
        }
        // Otherwise update it in place
        return prev.map(e => {
          if (e.id !== email.id) return e;
          console.log('[Not Business] Marking email as reviewed:', e.id);
          return {
            ...e,
            links: e.links.filter(l => l.link_source !== 'ai_agent'),
            hasReview: true,
            reviewType: 'not_business' as const,
          };
        });
      });

      closeNotBusinessModal();
      alert('Email marked as not business related.' + (createRule ? ' Exclusion rule created.' : ''));
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  // Open correction modal for an AI link
  const openCorrectionModal = (email: EmailWithLinks, link: EmailObjectLink) => {
    setCorrectionModal({
      isOpen: true,
      email,
      incorrectLink: link,
      correctObject: null,
      feedbackText: '',
    });
    setCorrectionSearchQuery('');
    setCorrectionSearchResults([]);
  };

  // Close correction modal
  const closeCorrectionModal = () => {
    setCorrectionModal({
      isOpen: false,
      email: null,
      incorrectLink: null,
      correctObject: null,
      feedbackText: '',
    });
    setCorrectionSearchQuery('');
    setCorrectionSearchResults([]);
  };

  // Search for correct object in correction modal
  const handleCorrectionSearch = async (query: string) => {
    if (query.length < 2) {
      setCorrectionSearchResults([]);
      return;
    }

    setCorrectionSearching(true);
    try {
      const results: CRMObject[] = [];

      // Search deals
      const { data: deals } = await supabase
        .from('deal')
        .select('id, deal_name')
        .ilike('deal_name', `%${query}%`)
        .limit(5);
      results.push(...(deals || []).map(d => ({ id: d.id, type: 'deal', name: d.deal_name })));

      // Smart contact search
      const queryWords = query.trim().split(/\s+/);
      let contactQuery = supabase.from('contact').select('id, first_name, last_name, email');
      if (queryWords.length >= 2) {
        const firstName = queryWords[0];
        const lastName = queryWords.slice(1).join(' ');
        contactQuery = contactQuery.or(
          `and(first_name.ilike.%${firstName}%,last_name.ilike.%${lastName}%),email.ilike.%${query}%`
        );
      } else {
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

      // Search clients
      const { data: clients } = await supabase
        .from('client')
        .select('id, client_name')
        .ilike('client_name', `%${query}%`)
        .limit(5);
      results.push(...(clients || []).map(c => ({ id: c.id, type: 'client', name: c.client_name })));

      // Search properties
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

      setCorrectionSearchResults(results);
    } catch (err) {
      console.error('Correction search error:', err);
    } finally {
      setCorrectionSearching(false);
    }
  };

  // Save correction - the main transaction
  const handleSaveCorrection = async () => {
    const { email, incorrectLink, correctObject, feedbackText } = correctionModal;

    if (!email || !incorrectLink || !correctObject) {
      alert('Please select the correct object.');
      return;
    }

    setProcessingId(incorrectLink.id);
    try {
      // 1. Log the correction to agent_corrections table
      const { error: logError } = await supabase.from('agent_corrections').insert({
        email_id: email.id,
        incorrect_link_id: incorrectLink.id,
        incorrect_object_type: incorrectLink.object_type,
        incorrect_object_id: incorrectLink.object_id,
        correct_object_type: correctObject.type,
        correct_object_id: correctObject.id,
        feedback_text: feedbackText || `Corrected from ${incorrectLink.object_type} to ${correctObject.type}`,
        sender_email: email.sender_email,
        email_subject: email.subject,
      });

      if (logError) throw logError;

      // 2. Delete the old AI link
      const { error: deleteError } = await supabase
        .from('email_object_link')
        .delete()
        .eq('id', incorrectLink.id);

      if (deleteError) throw deleteError;

      // 3. Insert the new manual link
      const { data: newLink, error: insertError } = await supabase
        .from('email_object_link')
        .insert({
          email_id: email.id,
          object_type: correctObject.type,
          object_id: correctObject.id,
          link_source: 'manual',
          confidence_score: 1.0,
          reasoning_log: feedbackText || `Manually corrected from AI classification`,
        })
        .select()
        .single();

      if (insertError && insertError.code !== '23505') throw insertError; // Ignore duplicate key

      // 4. Update local state (update links and mark pending changes) - don't auto-remove
      setEmails(prev =>
        prev.map(e => {
          if (e.id !== email.id) return e;
          const updatedLinks = e.links.filter(l => l.id !== incorrectLink.id);
          if (newLink) {
            updatedLinks.push({
              ...newLink,
              object_name: correctObject.name,
            });
          }
          return { ...e, links: updatedLinks, pendingChanges: true };
        })
      );

      // 5. Close modal and show success
      closeCorrectionModal();
      alert('Correction saved! Click "Mark Reviewed" when you\'re done with this email.');
    } catch (err: any) {
      alert('Error saving correction: ' + err.message);
    } finally {
      setProcessingId(null);
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
              to="/admin/gmail"
              className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              <ChevronLeftIcon className="w-4 h-4 mr-1" />
              Gmail Settings
            </Link>
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
      <div className="mb-6 flex flex-wrap items-center gap-4">
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
        <div className="h-6 w-px bg-gray-300" />
        <div className="flex gap-2">
          {(['needs_review', 'reviewed', 'all'] as const).map((rf) => (
            <button
              key={rf}
              onClick={() => setReviewFilter(rf)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md ${
                reviewFilter === rf
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {rf === 'needs_review' ? 'Needs Review' : rf === 'reviewed' ? 'Reviewed' : 'All Status'}
            </button>
          ))}
        </div>
        <span className="text-sm text-gray-500">
          {emails.length} email{emails.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Bulk actions bar - shows when emails are loaded and on needs_review filter */}
      {!loading && emails.length > 0 && reviewFilter === 'needs_review' && (
        <div className="mb-4 flex items-center gap-4 p-3 bg-gray-50 rounded-lg border">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedIds.size === emails.length && emails.length > 0}
              onChange={toggleSelectAll}
              className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
            />
            <span className="text-sm font-medium text-gray-700">
              {selectedIds.size === emails.length ? 'Deselect All' : 'Select All'}
            </span>
          </label>
          {selectedIds.size > 0 && (
            <>
              <span className="text-sm text-gray-500">
                {selectedIds.size} selected
              </span>
              <button
                onClick={handleBulkMarkReviewed}
                disabled={bulkProcessing}
                className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                <CheckCircleIcon className="w-4 h-4 mr-1" />
                {bulkProcessing ? 'Processing...' : `Mark ${selectedIds.size} as Reviewed`}
              </button>
            </>
          )}
        </div>
      )}

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
              <div className="px-4 py-3 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    {/* Checkbox for multi-select (only on needs_review) */}
                    {reviewFilter === 'needs_review' && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(email.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleSelection(email.id);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 mt-1 text-green-600 border-gray-300 rounded focus:ring-green-500 cursor-pointer"
                      />
                    )}
                    <div
                      className="flex items-start gap-3 flex-1 cursor-pointer"
                      onClick={() => setExpandedId(expandedId === email.id ? null : email.id)}
                    >
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
                          {email.reviewType === 'feedback' && (
                            <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full flex items-center gap-1">
                              <CheckCircleIcon className="w-3 h-3" />
                              Reviewed
                            </span>
                          )}
                          {email.reviewType === 'not_business' && (
                            <span className="px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-700 rounded-full flex items-center gap-1">
                              <NoSymbolIcon className="w-3 h-3" />
                              Not Business
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-sm text-gray-500">
                          {email.sender_name ? `${email.sender_name} <${email.sender_email}>` : email.sender_email}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Mark Reviewed button in collapsed view (only on needs_review) */}
                    {reviewFilter === 'needs_review' && expandedId !== email.id && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMarkReviewed(email);
                        }}
                        disabled={processingId === email.id}
                        className="inline-flex items-center px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded hover:bg-green-200 disabled:opacity-50"
                        title="AI classifications look correct - mark as reviewed"
                      >
                        <CheckCircleIcon className="w-3.5 h-3.5 mr-1" />
                        {processingId === email.id ? '...' : 'Reviewed'}
                      </button>
                    )}
                    <div className="text-sm text-gray-500">
                      {formatDate(email.received_at)}
                    </div>
                  </div>
                </div>

                {/* Quick view of links */}
                {email.links.length > 0 && expandedId !== email.id && (
                  <div
                    className="mt-2 ml-12 flex flex-wrap gap-2 cursor-pointer"
                    onClick={() => setExpandedId(expandedId === email.id ? null : email.id)}
                  >
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
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openNotBusinessModal(email);
                          }}
                          disabled={email.reviewType === 'not_business'}
                          className="inline-flex items-center px-2 py-1 text-xs font-medium text-orange-700 bg-orange-100 rounded hover:bg-orange-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <NoSymbolIcon className="w-3 h-3 mr-1" />
                          Not Business
                        </button>
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
                        {/* Mark Reviewed button - shows when user has made changes or wants to confirm review */}
                        {reviewFilter === 'needs_review' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMarkReviewed(email);
                            }}
                            disabled={processingId === email.id}
                            className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded ${
                              email.pendingChanges
                                ? 'text-white bg-green-600 hover:bg-green-700 animate-pulse'
                                : 'text-green-700 bg-green-100 hover:bg-green-200'
                            } disabled:opacity-50`}
                          >
                            <CheckCircleIcon className="w-3 h-3 mr-1" />
                            {processingId === email.id ? 'Saving...' : email.pendingChanges ? 'Done - Mark Reviewed' : 'Mark Reviewed'}
                          </button>
                        )}
                      </div>
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
                              {/* Correct button - only for AI links */}
                              {link.link_source === 'ai_agent' && (
                                <button
                                  onClick={() => openCorrectionModal(email, link)}
                                  className="p-1 text-gray-400 hover:text-blue-600"
                                  title="Correct this AI classification"
                                >
                                  <PencilIcon className="w-4 h-4" />
                                </button>
                              )}
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

                  {/* AI Training / Feedback Section */}
                  <div className="mt-4 p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200">
                    <div className="flex items-start gap-3">
                      <SparklesIcon className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-purple-900 mb-2">
                          Train the AI
                        </h4>
                        <p className="text-xs text-purple-700 mb-3">
                          Provide feedback to help the AI learn from this example.
                        </p>

                        {/* Quick feedback buttons */}
                        <div className="flex flex-wrap gap-2 mb-3">
                          <button
                            onClick={() => setFeedbackReasoning(prev => ({
                              ...prev,
                              [email.id]: `This classification is correct. The AI made the right connections.`
                            }))}
                            className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-full hover:bg-green-200 transition-colors"
                          >
                            <CheckCircleIcon className="w-3 h-3 mr-1" />
                            Correct
                          </button>
                          <button
                            onClick={() => setFeedbackReasoning(prev => ({
                              ...prev,
                              [email.id]: `This person (${email.sender_email}) is a known contact in our CRM. The AI should recognize contacts by their email address.`
                            }))}
                            className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-purple-700 bg-purple-100 rounded-full hover:bg-purple-200 transition-colors"
                          >
                            Already in contacts
                          </button>
                          <button
                            onClick={() => setFeedbackReasoning(prev => ({
                              ...prev,
                              [email.id]: `This sender works for a company that is already a client in our CRM. Link emails from this domain to the client.`
                            }))}
                            className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-purple-700 bg-purple-100 rounded-full hover:bg-purple-200 transition-colors"
                          >
                            Works for existing client
                          </button>
                          <button
                            onClick={() => setFeedbackReasoning(prev => ({
                              ...prev,
                              [email.id]: `The classification is wrong. This email should NOT be linked to these objects.`
                            }))}
                            className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-red-700 bg-red-100 rounded-full hover:bg-red-200 transition-colors"
                          >
                            <XCircleIcon className="w-3 h-3 mr-1" />
                            Wrong
                          </button>
                        </div>

                        {/* Detailed feedback textarea */}
                        <textarea
                          placeholder="Add details about the correct classification. For example: 'This person works for Oculus' or 'This should be linked to the Milledgeville deal'..."
                          value={feedbackReasoning[email.id] || ''}
                          onChange={(e) => setFeedbackReasoning(prev => ({ ...prev, [email.id]: e.target.value }))}
                          className="w-full px-3 py-2 border border-purple-200 rounded-md text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white"
                          rows={2}
                        />

                        {feedbackReasoning[email.id] && (
                          <div className="mt-2 flex justify-end">
                            <button
                              onClick={() => handleSaveFeedback(email)}
                              disabled={processingId === email.id}
                              className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700 disabled:opacity-50"
                            >
                              <CheckCircleIcon className="w-4 h-4 mr-1" />
                              Save Feedback
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Processing Info */}
                  <div className="text-xs text-gray-500 border-t pt-3 mt-4">
                    Processed: {formatDate(email.ai_processed_at)}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Correction Modal */}
      {correctionModal.isOpen && correctionModal.email && correctionModal.incorrectLink && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">
                Correct AI Classification
              </h3>
              <button
                onClick={closeCorrectionModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-4 space-y-4">
              {/* Current (incorrect) classification */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Current AI Classification (Incorrect)
                </label>
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 text-xs font-medium rounded ${getObjectTypeColor(correctionModal.incorrectLink.object_type)}`}>
                      {correctionModal.incorrectLink.object_type}
                    </span>
                    <span className="font-medium text-gray-900">
                      {correctionModal.incorrectLink.object_name}
                    </span>
                    <span className="text-xs text-red-600">
                      ({Math.round(correctionModal.incorrectLink.confidence_score * 100)}% confidence)
                    </span>
                  </div>
                </div>
              </div>

              {/* Select correct object */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Correct Object
                </label>
                {correctionModal.correctObject ? (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded ${getObjectTypeColor(correctionModal.correctObject.type)}`}>
                          {correctionModal.correctObject.type}
                        </span>
                        <span className="font-medium text-gray-900">
                          {correctionModal.correctObject.name}
                        </span>
                      </div>
                      <button
                        onClick={() => setCorrectionModal(prev => ({ ...prev, correctObject: null }))}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <XMarkIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="Search for the correct deal, contact, client, or property..."
                      value={correctionSearchQuery}
                      onChange={(e) => {
                        setCorrectionSearchQuery(e.target.value);
                        handleCorrectionSearch(e.target.value);
                      }}
                      className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      autoFocus
                    />
                    {correctionSearching && (
                      <div className="text-sm text-gray-500">Searching...</div>
                    )}
                    {correctionSearchResults.length > 0 && (
                      <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
                        {correctionSearchResults.map((result) => (
                          <button
                            key={`${result.type}-${result.id}`}
                            onClick={() => {
                              setCorrectionModal(prev => ({ ...prev, correctObject: result }));
                              setCorrectionSearchQuery('');
                              setCorrectionSearchResults([]);
                            }}
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
                  </div>
                )}
              </div>

              {/* Feedback text */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Why was the AI wrong? (Optional)
                </label>
                <textarea
                  placeholder="e.g., 'Wrong address match' or 'This person works for a different company'..."
                  value={correctionModal.feedbackText}
                  onChange={(e) => setCorrectionModal(prev => ({ ...prev, feedbackText: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                />
                <p className="mt-1 text-xs text-gray-500">
                  This feedback helps train the AI to avoid similar mistakes.
                </p>
              </div>

              {/* Email context */}
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs font-medium text-gray-500 mb-1">Email Context:</p>
                <p className="text-sm text-gray-700 font-medium">{correctionModal.email.subject}</p>
                <p className="text-xs text-gray-500">{correctionModal.email.sender_email}</p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-gray-50">
              <button
                onClick={closeCorrectionModal}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCorrection}
                disabled={!correctionModal.correctObject || processingId === correctionModal.incorrectLink.id}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processingId === correctionModal.incorrectLink.id ? 'Saving...' : 'Save Correction'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Not Business Modal */}
      {notBusinessModal.isOpen && notBusinessModal.email && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">
                Mark as Not Business Related
              </h3>
              <button
                onClick={closeNotBusinessModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-4 space-y-4">
              {/* Email info */}
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm font-medium text-gray-900">{notBusinessModal.email.subject || '(No Subject)'}</p>
                <p className="text-xs text-gray-500 mt-1">{notBusinessModal.email.sender_email}</p>
              </div>

              <p className="text-sm text-gray-600">
                This will remove any AI classifications and mark this email as not business related.
                {notBusinessModal.email.links.filter(l => l.link_source === 'ai_agent').length > 0 && (
                  <span className="text-orange-600 font-medium">
                    {' '}({notBusinessModal.email.links.filter(l => l.link_source === 'ai_agent').length} AI link(s) will be removed)
                  </span>
                )}
              </p>

              {/* Create exclusion rule option */}
              <div className="border rounded-lg p-4 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notBusinessModal.createRule}
                    onChange={(e) => setNotBusinessModal(prev => ({ ...prev, createRule: e.target.checked }))}
                    className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Create exclusion rule for future emails
                  </span>
                </label>

                {notBusinessModal.createRule && (
                  <div className="ml-6 space-y-2">
                    <p className="text-xs text-gray-500">Exclude emails from:</p>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="ruleType"
                          value="domain"
                          checked={notBusinessModal.ruleType === 'domain'}
                          onChange={() => setNotBusinessModal(prev => ({ ...prev, ruleType: 'domain' }))}
                          className="w-4 h-4 text-orange-600 border-gray-300 focus:ring-orange-500"
                        />
                        <span className="text-sm text-gray-700">
                          @{notBusinessModal.email.sender_email.split('@')[1]}
                        </span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="ruleType"
                          value="sender"
                          checked={notBusinessModal.ruleType === 'sender'}
                          onChange={() => setNotBusinessModal(prev => ({ ...prev, ruleType: 'sender' }))}
                          className="w-4 h-4 text-orange-600 border-gray-300 focus:ring-orange-500"
                        />
                        <span className="text-sm text-gray-700">
                          {notBusinessModal.email.sender_email}
                        </span>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-gray-50">
              <button
                onClick={closeNotBusinessModal}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleNotBusiness}
                disabled={processingId === notBusinessModal.email.id}
                className="px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processingId === notBusinessModal.email.id ? 'Saving...' : 'Mark as Not Business'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmailClassificationReviewPage;
