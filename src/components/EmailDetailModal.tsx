import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ActivityWithRelations } from '../hooks/useActivities';
import { supabase } from '../lib/supabaseClient';
import AdvancedEmailView from './AdvancedEmailView';
import AIReasoningTrace from './AIReasoningTrace';
import RecordMetadata from './RecordMetadata';
import {
  XMarkIcon,
  EnvelopeIcon,
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  UserIcon,
  CalendarIcon,
  LinkIcon,
  BuildingOfficeIcon,
  DocumentTextIcon,
  PaperClipIcon,
  ArrowDownTrayIcon,
  EyeIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';

interface EmailDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  activity: ActivityWithRelations | null;
}

interface EmailDetails {
  id: string;
  subject: string;
  body_text: string;
  body_html: string;
  snippet: string;
  sender_email: string;
  sender_name: string;
  recipient_list: Array<{ email: string; name: string | null; type: 'to' | 'cc' | 'bcc' }>;
  direction: 'INBOUND' | 'OUTBOUND';
  received_at: string;
  thread_id: string;
  labels: string[];
}

interface LinkedObject {
  type: 'deal' | 'contact' | 'client' | 'property';
  id: string;
  name: string;
  linkId?: string; // ID of the email_object_link record for removal
  linkSource?: string; // Whether link was from 'ai_agent' or 'manual'
}

interface CRMSearchResult {
  id: string;
  type: string;
  name: string;
}

interface EmailAttachment {
  id: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
}

const EmailDetailModal: React.FC<EmailDetailModalProps> = ({
  isOpen,
  onClose,
  activity
}) => {
  const [emailDetails, setEmailDetails] = useState<EmailDetails | null>(null);
  const [linkedObjects, setLinkedObjects] = useState<LinkedObject[]>([]);
  const [attachments, setAttachments] = useState<EmailAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingAttachment, setDownloadingAttachment] = useState<string | null>(null);

  // Tag management state
  const [showAddTag, setShowAddTag] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CRMSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [processingTag, setProcessingTag] = useState<string | null>(null);

  // Get the Supabase URL for the edge function
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://rqbvcvwbziilnycqtmnc.supabase.co';

  // Handle attachment download/preview
  const handleAttachmentClick = async (attachment: EmailAttachment, preview: boolean = false) => {
    setDownloadingAttachment(attachment.id);
    try {
      const url = `${supabaseUrl}/functions/v1/get-attachment?attachment_id=${attachment.id}`;

      if (preview && isPreviewable(attachment.mime_type)) {
        // For Office documents, use Google Docs Viewer
        if (isOfficeDocument(attachment.mime_type)) {
          const viewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=false`;
          window.open(viewerUrl, '_blank');
        } else {
          // Open directly in new tab for images, PDFs, text
          window.open(url, '_blank');
        }
      } else {
        // Download the file
        const link = document.createElement('a');
        link.href = url;
        link.download = attachment.filename;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      console.error('Error downloading attachment:', error);
    } finally {
      setDownloadingAttachment(null);
    }
  };

  // Check if file type is previewable in browser
  const isPreviewable = (mimeType: string | null): boolean => {
    if (!mimeType) return false;
    return mimeType.startsWith('image/') ||
           mimeType === 'application/pdf' ||
           mimeType.startsWith('text/') ||
           isOfficeDocument(mimeType);
  };

  // Check if file is an Office document (Word, Excel, PowerPoint)
  const isOfficeDocument = (mimeType: string | null): boolean => {
    if (!mimeType) return false;
    const officeTypes = [
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ];
    return officeTypes.includes(mimeType);
  };

  // Search for CRM objects to tag
  const handleSearch = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const results: CRMSearchResult[] = [];

      // Search deals
      const { data: deals } = await supabase
        .from('deal')
        .select('id, deal_name')
        .ilike('deal_name', `%${query}%`)
        .limit(5);
      results.push(...(deals || []).map(d => ({ id: d.id, type: 'deal', name: d.deal_name })));

      // Search contacts
      const queryWords = query.trim().split(/\s+/);
      let contactQuery = supabase
        .from('contact')
        .select('id, first_name, last_name, email');

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
      const { data: contacts } = await contactQuery.limit(5);
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

      setSearchResults(results);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setSearching(false);
    }
  };

  // Add a tag (link) to the email
  const handleAddTag = async (object: CRMSearchResult) => {
    const emailId = (activity as any)?.email_id;
    if (!emailId) return;

    setProcessingTag(object.id);
    try {
      // Check if link already exists
      const existingLink = linkedObjects.find(
        lo => lo.type === object.type && lo.id === object.id
      );
      if (existingLink) {
        alert('This link already exists');
        return;
      }

      // Create the link
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

      // Log as AI training correction (AI missed this link)
      if (emailDetails) {
        await supabase.from('agent_corrections').insert({
          email_id: emailId,
          incorrect_link_id: null,
          incorrect_object_type: 'none',
          incorrect_object_id: '00000000-0000-0000-0000-000000000000',
          correct_object_type: object.type,
          correct_object_id: object.id,
          feedback_text: `AI missed linking to ${object.type} "${object.name}" - user manually added this link`,
          sender_email: emailDetails.sender_email,
          email_subject: emailDetails.subject,
        }).catch(err => console.error('Failed to log correction:', err));
      }

      // Create activity record if linking to a deal (so it shows in deal timeline)
      if (object.type === 'deal' && emailDetails) {
        const { data: emailActivityType } = await supabase
          .from('activity_type')
          .select('id')
          .eq('name', 'Email')
          .single();

        if (emailActivityType) {
          await supabase.from('activity').insert({
            activity_type_id: emailActivityType.id,
            subject: emailDetails.subject || 'Email',
            description: emailDetails.snippet || emailDetails.body_text?.substring(0, 500),
            activity_date: emailDetails.received_at,
            email_id: emailId,
            direction: emailDetails.direction,
            sf_status: 'Completed',
            deal_id: object.id,
          }).catch(err => {
            // Ignore duplicate key errors
            if (err.code !== '23505') console.error('Failed to create activity:', err);
          });
        }
      }

      // Update local state
      setLinkedObjects(prev => [...prev, {
        type: object.type as LinkedObject['type'],
        id: object.id,
        name: object.name,
        linkId: data.id,
        linkSource: 'manual',
      }]);

      // Clear search
      setSearchQuery('');
      setSearchResults([]);
      setShowAddTag(false);
    } catch (err: any) {
      alert('Error adding tag: ' + err.message);
    } finally {
      setProcessingTag(null);
    }
  };

  // Remove a tag (link) from the email
  const handleRemoveTag = async (linkedObject: LinkedObject) => {
    if (!linkedObject.linkId) {
      alert('Cannot remove this tag - no link ID found');
      return;
    }
    if (!confirm(`Remove "${linkedObject.name}" tag?`)) return;

    const emailId = (activity as any)?.email_id;
    setProcessingTag(linkedObject.linkId);
    try {
      // Delete the link
      const { error } = await supabase
        .from('email_object_link')
        .delete()
        .eq('id', linkedObject.linkId);

      if (error) throw error;

      // Log removal as training data (AI was wrong to add this)
      if (emailDetails && linkedObject.linkSource === 'ai_agent') {
        await supabase.from('agent_corrections').insert({
          email_id: emailId,
          incorrect_link_id: linkedObject.linkId,
          incorrect_object_type: linkedObject.type,
          incorrect_object_id: linkedObject.id,
          correct_object_type: 'none',
          correct_object_id: '00000000-0000-0000-0000-000000000000',
          feedback_text: `AI incorrectly linked to ${linkedObject.type} "${linkedObject.name}" - user removed this link`,
          sender_email: emailDetails.sender_email,
          email_subject: emailDetails.subject,
        }).catch(err => console.error('Failed to log removal:', err));
      }

      // Update local state
      setLinkedObjects(prev => prev.filter(lo => lo.linkId !== linkedObject.linkId));
    } catch (err: any) {
      alert('Error removing tag: ' + err.message);
    } finally {
      setProcessingTag(null);
    }
  };

  // Fetch full email details when modal opens
  useEffect(() => {
    const fetchEmailDetails = async () => {
      if (!isOpen || !activity) {
        setEmailDetails(null);
        setLinkedObjects([]);
        setAttachments([]);
        return;
      }

      setLoading(true);
      try {
        // Get email_id from activity
        const emailId = (activity as any).email_id;

        if (emailId) {
          // Fetch full email details
          const { data: email, error } = await supabase
            .from('emails')
            .select('*')
            .eq('id', emailId)
            .single();

          if (error) {
            console.error('Error fetching email details:', error);
          } else if (email) {
            setEmailDetails(email);
          }

          // Fetch linked objects via email_object_link (includes link ID for removal)
          const { data: links, error: linksError } = await supabase
            .from('email_object_link')
            .select('id, object_type, object_id, link_source')
            .eq('email_id', emailId);

          if (linksError) {
            console.error('Error fetching email links:', linksError);
          } else if (links && links.length > 0) {
            // Fetch names for each linked object
            const linkedObjectsWithNames: LinkedObject[] = [];

            for (const link of links) {
              let name = '';
              try {
                switch (link.object_type) {
                  case 'deal':
                    const { data: deal } = await supabase
                      .from('deal')
                      .select('deal_name')
                      .eq('id', link.object_id)
                      .single();
                    name = deal?.deal_name || 'Unknown Deal';
                    break;
                  case 'contact':
                    const { data: contact } = await supabase
                      .from('contact')
                      .select('first_name, last_name')
                      .eq('id', link.object_id)
                      .single();
                    name = contact ? `${contact.first_name} ${contact.last_name}`.trim() : 'Unknown Contact';
                    break;
                  case 'client':
                    const { data: client } = await supabase
                      .from('client')
                      .select('client_name')
                      .eq('id', link.object_id)
                      .single();
                    name = client?.client_name || 'Unknown Client';
                    break;
                  case 'property':
                    const { data: property } = await supabase
                      .from('property')
                      .select('property_name')
                      .eq('id', link.object_id)
                      .single();
                    name = property?.property_name || 'Unknown Property';
                    break;
                }

                linkedObjectsWithNames.push({
                  type: link.object_type as LinkedObject['type'],
                  id: link.object_id,
                  name,
                  linkId: link.id,
                  linkSource: link.link_source,
                });
              } catch (err) {
                console.error(`Error fetching ${link.object_type} name:`, err);
              }
            }

            setLinkedObjects(linkedObjectsWithNames);
          }

          // Fetch attachments
          const { data: attachmentsData, error: attachmentsError } = await supabase
            .from('email_attachments')
            .select('id, filename, mime_type, size_bytes')
            .eq('email_id', emailId);

          if (attachmentsError) {
            console.error('Error fetching attachments:', attachmentsError);
          } else if (attachmentsData) {
            setAttachments(attachmentsData);
          }
        }
      } catch (error) {
        console.error('Error in fetchEmailDetails:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchEmailDetails();
  }, [isOpen, activity]);

  if (!isOpen || !activity) return null;

  const activityType = activity.activity_type?.name || activity.sf_task_subtype;
  const direction = (activity as any).direction as 'INBOUND' | 'OUTBOUND' | undefined;
  const emailData = (activity as any).email;

  // Format recipients for display
  const formatRecipients = (recipients: Array<{ email: string; name: string | null; type: string }> | undefined, type: string) => {
    if (!recipients) return [];
    return recipients.filter(r => r.type === type).map(r => r.name || r.email);
  };

  const toRecipients = emailDetails?.recipient_list
    ? formatRecipients(emailDetails.recipient_list, 'to')
    : emailData?.recipient_list
      ? formatRecipients(emailData.recipient_list, 'to')
      : [];

  const ccRecipients = emailDetails?.recipient_list
    ? formatRecipients(emailDetails.recipient_list, 'cc')
    : emailData?.recipient_list
      ? formatRecipients(emailData.recipient_list, 'cc')
      : [];

  const getObjectIcon = (type: string) => {
    switch (type) {
      case 'deal':
        return <DocumentTextIcon className="w-4 h-4 text-blue-500" />;
      case 'contact':
        return <UserIcon className="w-4 h-4 text-green-500" />;
      case 'client':
        return <BuildingOfficeIcon className="w-4 h-4 text-purple-500" />;
      case 'property':
        return <BuildingOfficeIcon className="w-4 h-4 text-orange-500" />;
      default:
        return <LinkIcon className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50 z-[60]" onClick={onClose} />

      {/* Modal Slidebar */}
      <div className={`fixed inset-0 lg:inset-y-0 lg:right-0 lg:left-auto w-full lg:w-[700px] bg-white shadow-xl transform transition-transform duration-300 z-[60] ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      } flex flex-col`}>

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="relative">
              <EnvelopeIcon className="w-6 h-6 text-blue-600" />
              {direction === 'INBOUND' && (
                <ArrowDownLeftIcon className="w-3 h-3 text-green-600 absolute -bottom-1 -right-1" />
              )}
              {direction === 'OUTBOUND' && (
                <ArrowUpRightIcon className="w-3 h-3 text-orange-500 absolute -bottom-1 -right-1" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {direction === 'INBOUND' ? 'Received Email' : direction === 'OUTBOUND' ? 'Sent Email' : 'Email'}
              </h2>
              <p className="text-sm text-gray-500">
                {activity.activity_date && format(new Date(activity.activity_date), 'MMM d, yyyy h:mm a')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-full transition-colors"
          >
            <XMarkIcon className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-600">Loading email details...</span>
            </div>
          ) : (
            <>
              {/* Email Header Section */}
              <div className="bg-white border rounded-lg shadow-sm">
                <div className="p-4 space-y-3">
                  {/* Subject */}
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">
                      {activity.subject || emailDetails?.subject || '(No Subject)'}
                    </h3>
                  </div>

                  {/* From/To Section */}
                  <div className="space-y-2 text-sm">
                    {/* Sender */}
                    <div className="flex items-start gap-2">
                      <span className="w-12 text-gray-500 font-medium shrink-0">From:</span>
                      <span className="text-gray-900">
                        {emailDetails?.sender_name || emailData?.sender_name || 'Unknown'}
                        {(emailDetails?.sender_email || emailData?.sender_email) && (
                          <span className="text-gray-500 ml-1">
                            &lt;{emailDetails?.sender_email || emailData?.sender_email}&gt;
                          </span>
                        )}
                      </span>
                    </div>

                    {/* To Recipients */}
                    {toRecipients.length > 0 && (
                      <div className="flex items-start gap-2">
                        <span className="w-12 text-gray-500 font-medium shrink-0">To:</span>
                        <span className="text-gray-900">{toRecipients.join(', ')}</span>
                      </div>
                    )}

                    {/* CC Recipients */}
                    {ccRecipients.length > 0 && (
                      <div className="flex items-start gap-2">
                        <span className="w-12 text-gray-500 font-medium shrink-0">CC:</span>
                        <span className="text-gray-900">{ccRecipients.join(', ')}</span>
                      </div>
                    )}

                    {/* Date */}
                    <div className="flex items-start gap-2">
                      <span className="w-12 text-gray-500 font-medium shrink-0">Date:</span>
                      <span className="text-gray-900">
                        {emailDetails?.received_at
                          ? format(new Date(emailDetails.received_at), 'EEEE, MMMM d, yyyy h:mm a')
                          : activity.activity_date
                            ? format(new Date(activity.activity_date), 'EEEE, MMMM d, yyyy h:mm a')
                            : 'Unknown'
                        }
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Linked CRM Objects - with tag management */}
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-blue-900 flex items-center gap-2">
                    <LinkIcon className="w-4 h-4" />
                    Linked to CRM Objects
                  </h4>
                  <button
                    onClick={() => setShowAddTag(!showAddTag)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded transition-colors"
                  >
                    <PlusIcon className="w-3 h-3" />
                    Add Tag
                  </button>
                </div>

                {/* Add Tag Search */}
                {showAddTag && (
                  <div className="mb-3 p-3 bg-white rounded-lg border border-blue-200">
                    <div className="relative">
                      <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search deals, contacts, clients, properties..."
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          handleSearch(e.target.value);
                        }}
                        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        autoFocus
                      />
                    </div>

                    {/* Search Results */}
                    {searching && (
                      <div className="mt-2 text-sm text-gray-500">Searching...</div>
                    )}
                    {!searching && searchResults.length > 0 && (
                      <div className="mt-2 max-h-48 overflow-y-auto">
                        {searchResults.map((result) => (
                          <button
                            key={`${result.type}-${result.id}`}
                            onClick={() => handleAddTag(result)}
                            disabled={processingTag === result.id}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-blue-50 rounded-md transition-colors disabled:opacity-50"
                          >
                            {getObjectIcon(result.type)}
                            <span className="flex-1 truncate">{result.name}</span>
                            <span className="text-xs text-gray-400 capitalize">{result.type}</span>
                            {processingTag === result.id && (
                              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    {!searching && searchQuery.length >= 2 && searchResults.length === 0 && (
                      <div className="mt-2 text-sm text-gray-500">No results found</div>
                    )}
                  </div>
                )}

                {/* Linked Objects List */}
                {linkedObjects.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {linkedObjects.map((obj, index) => (
                      <span
                        key={`${obj.type}-${obj.id}-${index}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-full text-sm border border-blue-200 group"
                      >
                        {getObjectIcon(obj.type)}
                        <span className="text-gray-700">{obj.name}</span>
                        <span className="text-xs text-gray-400 capitalize">({obj.type})</span>
                        {obj.linkSource === 'ai_agent' && (
                          <span className="text-xs text-purple-500" title="Added by AI">✨</span>
                        )}
                        <button
                          onClick={() => handleRemoveTag(obj)}
                          disabled={processingTag === obj.linkId}
                          className="ml-1 p-0.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                          title="Remove tag"
                        >
                          {processingTag === obj.linkId ? (
                            <div className="w-3 h-3 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <XMarkIcon className="w-3 h-3" />
                          )}
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-blue-700 italic">No CRM objects linked to this email yet.</p>
                )}
              </div>

              {/* Attachments */}
              {attachments.length > 0 && (
                <div className="bg-white border rounded-lg shadow-sm">
                  <div className="px-4 py-3 border-b bg-gray-50">
                    <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                      <PaperClipIcon className="w-4 h-4" />
                      Attachments ({attachments.length})
                    </h4>
                  </div>
                  <div className="p-4">
                    <ul className="space-y-2">
                      {attachments.map((attachment) => (
                        <li
                          key={attachment.id}
                          className="flex items-center gap-3 p-2 bg-gray-50 rounded-md hover:bg-gray-100 transition-colors"
                        >
                          <PaperClipIcon className="w-5 h-5 text-gray-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {attachment.filename}
                            </p>
                            <p className="text-xs text-gray-500">
                              {attachment.mime_type || 'Unknown type'}
                              {attachment.size_bytes && (
                                <span className="ml-2">
                                  {attachment.size_bytes < 1024
                                    ? `${attachment.size_bytes} B`
                                    : attachment.size_bytes < 1024 * 1024
                                      ? `${(attachment.size_bytes / 1024).toFixed(1)} KB`
                                      : `${(attachment.size_bytes / (1024 * 1024)).toFixed(1)} MB`
                                  }
                                </span>
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {isPreviewable(attachment.mime_type) && (
                              <button
                                onClick={() => handleAttachmentClick(attachment, true)}
                                disabled={downloadingAttachment === attachment.id}
                                className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                title="Preview"
                              >
                                <EyeIcon className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => handleAttachmentClick(attachment, false)}
                              disabled={downloadingAttachment === attachment.id}
                              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="Download"
                            >
                              {downloadingAttachment === attachment.id ? (
                                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <ArrowDownTrayIcon className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Email Body */}
              <div className="bg-white border rounded-lg shadow-sm">
                <div className="px-4 py-3 border-b bg-gray-50">
                  <h4 className="text-sm font-medium text-gray-700">Email Content</h4>
                </div>
                <div className="p-4">
                  {emailDetails?.body_html ? (
                    <div
                      className="prose prose-sm max-w-none text-gray-700"
                      dangerouslySetInnerHTML={{ __html: emailDetails.body_html }}
                    />
                  ) : emailDetails?.body_text ? (
                    <div className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed">
                      {emailDetails.body_text}
                    </div>
                  ) : activity.description ? (
                    <div className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed">
                      {activity.description}
                    </div>
                  ) : (
                    <p className="text-gray-500 italic">No email content available.</p>
                  )}
                </div>
              </div>

              {/* AI Classification Trace */}
              {(activity as any).email_id && (
                <AIReasoningTrace emailId={(activity as any).email_id} />
              )}

              {/* Activity Metadata */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-700 mb-3">Activity Record</h4>
                <div className="grid grid-cols-2 gap-3 text-xs text-gray-600">
                  {activity.contact && (
                    <div>
                      <span className="font-medium">Related Contact:</span>{' '}
                      {activity.contact.first_name} {activity.contact.last_name}
                    </div>
                  )}
                  {activity.sf_id && (
                    <div>
                      <span className="font-medium">Salesforce ID:</span> {activity.sf_id}
                    </div>
                  )}
                </div>

                <div className="mt-3 pt-3 border-t border-gray-200">
                  <RecordMetadata
                    createdAt={activity.created_at}
                    createdById={activity.created_by_id}
                    updatedAt={activity.updated_at}
                    updatedById={activity.updated_by_id}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-4 bg-gray-50">
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default EmailDetailModal;
