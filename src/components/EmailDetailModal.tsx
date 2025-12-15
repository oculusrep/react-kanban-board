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
  PaperClipIcon
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

          // Fetch linked objects via email_tags
          const { data: tags, error: tagsError } = await supabase
            .from('email_tags')
            .select('object_type, object_id')
            .eq('email_id', emailId);

          if (tagsError) {
            console.error('Error fetching email tags:', tagsError);
          } else if (tags && tags.length > 0) {
            // Fetch names for each linked object
            const linkedObjectsWithNames: LinkedObject[] = [];

            for (const tag of tags) {
              let name = '';
              try {
                switch (tag.object_type) {
                  case 'deal':
                    const { data: deal } = await supabase
                      .from('deal')
                      .select('deal_name')
                      .eq('id', tag.object_id)
                      .single();
                    name = deal?.deal_name || 'Unknown Deal';
                    break;
                  case 'contact':
                    const { data: contact } = await supabase
                      .from('contact')
                      .select('first_name, last_name')
                      .eq('id', tag.object_id)
                      .single();
                    name = contact ? `${contact.first_name} ${contact.last_name}`.trim() : 'Unknown Contact';
                    break;
                  case 'client':
                    const { data: client } = await supabase
                      .from('client')
                      .select('client_name')
                      .eq('id', tag.object_id)
                      .single();
                    name = client?.client_name || 'Unknown Client';
                    break;
                  case 'property':
                    const { data: property } = await supabase
                      .from('property')
                      .select('property_name')
                      .eq('id', tag.object_id)
                      .single();
                    name = property?.property_name || 'Unknown Property';
                    break;
                }

                linkedObjectsWithNames.push({
                  type: tag.object_type as LinkedObject['type'],
                  id: tag.object_id,
                  name
                });
              } catch (err) {
                console.error(`Error fetching ${tag.object_type} name:`, err);
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

              {/* Linked CRM Objects */}
              {linkedObjects.length > 0 && (
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-blue-900 mb-2 flex items-center gap-2">
                    <LinkIcon className="w-4 h-4" />
                    Linked to CRM Objects
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {linkedObjects.map((obj, index) => (
                      <span
                        key={`${obj.type}-${obj.id}-${index}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-full text-sm border border-blue-200"
                      >
                        {getObjectIcon(obj.type)}
                        <span className="text-gray-700">{obj.name}</span>
                        <span className="text-xs text-gray-400 capitalize">({obj.type})</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

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
                          className="flex items-center gap-3 p-2 bg-gray-50 rounded-md"
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
