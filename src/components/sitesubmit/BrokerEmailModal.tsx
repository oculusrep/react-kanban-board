/**
 * BrokerEmailModal - Simple email composer for broker outreach from Call List
 *
 * Uses Gmail API via hunter-send-outreach edge function to send emails.
 * Simpler than EmailComposerModal - focused on broker follow-up emails.
 */

import React, { useState, useEffect } from 'react';
import { X, Send, Paperclip, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

interface BrokerContact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  company: string | null;
}

interface PropertyInfo {
  name: string;
  address?: string;
  city?: string;
  state?: string;
}

interface Attachment {
  filename: string;
  content: string; // Base64 encoded
  content_type: string;
}

interface BrokerEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  brokers: BrokerContact[];
  properties: PropertyInfo[];
  onSuccess?: () => void;
}

export default function BrokerEmailModal({
  isOpen,
  onClose,
  brokers,
  properties,
  onSuccess,
}: BrokerEmailModalProps) {
  const [toRecipients, setToRecipients] = useState<string[]>([]);
  const [ccRecipients, setCcRecipients] = useState<string[]>(['mike@oculusrep.com', 'asantos@oculusrep.com']);
  const [bccRecipients, setBccRecipients] = useState<string[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sending, setSending] = useState(false);
  const [newRecipient, setNewRecipient] = useState('');
  const [recipientType, setRecipientType] = useState<'to' | 'cc' | 'bcc'>('to');

  // Generate default email content when modal opens
  useEffect(() => {
    if (isOpen && brokers.length > 0) {
      // Set recipients from broker emails
      const emails = brokers.map(b => b.email).filter(Boolean) as string[];
      setToRecipients(emails);

      // Generate default subject
      const propertyList = properties.slice(0, 2).map(p => p.name).join(', ');
      const suffix = properties.length > 2 ? ` and ${properties.length - 2} more` : '';
      setSubject(`Following up - ${propertyList}${suffix}`);

      // Generate default body
      const brokerFirstName = brokers[0]?.first_name || 'there';
      const propertyBullets = properties.map(p => {
        const location = [p.city, p.state].filter(Boolean).join(', ');
        return `• ${p.name}${location ? ` (${location})` : ''}`;
      }).join('\n');

      setBody(`Hi ${brokerFirstName},

I wanted to follow up with you regarding the following properties:

${propertyBullets}

Please let me know if you have any updates or availability for a quick call.

Best regards`);
    }
  }, [isOpen, brokers, properties]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setToRecipients([]);
      setCcRecipients(['mike@oculusrep.com', 'asantos@oculusrep.com']);
      setBccRecipients([]);
      setSubject('');
      setBody('');
      setAttachments([]);
      setNewRecipient('');
    }
  }, [isOpen]);

  const isValidEmail = (email: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleAddRecipient = () => {
    const trimmed = newRecipient.trim();
    if (!trimmed || !isValidEmail(trimmed)) return;

    if (recipientType === 'to' && !toRecipients.includes(trimmed)) {
      setToRecipients([...toRecipients, trimmed]);
    } else if (recipientType === 'cc' && !ccRecipients.includes(trimmed)) {
      setCcRecipients([...ccRecipients, trimmed]);
    } else if (recipientType === 'bcc' && !bccRecipients.includes(trimmed)) {
      setBccRecipients([...bccRecipients, trimmed]);
    }
    setNewRecipient('');
  };

  const handleRemoveRecipient = (type: 'to' | 'cc' | 'bcc', email: string) => {
    if (type === 'to') {
      setToRecipients(toRecipients.filter(e => e !== email));
    } else if (type === 'cc') {
      setCcRecipients(ccRecipients.filter(e => e !== email));
    } else {
      setBccRecipients(bccRecipients.filter(e => e !== email));
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const maxSize = 25 * 1024 * 1024; // 25MB limit

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > maxSize) {
        alert(`File ${file.name} is too large. Maximum size is 25MB.`);
        continue;
      }

      try {
        const base64 = await fileToBase64(file);
        setAttachments(prev => [...prev, {
          filename: file.name,
          content: base64,
          content_type: file.type || 'application/octet-stream',
        }]);
      } catch (error) {
        console.error(`Error reading file ${file.name}:`, error);
      }
    }
    e.target.value = '';
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          const base64 = reader.result.split(',')[1];
          resolve(base64);
        } else {
          reject(new Error('Failed to read file'));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleSend = async () => {
    if (toRecipients.length === 0) {
      alert('Please add at least one recipient');
      return;
    }
    if (!subject.trim()) {
      alert('Please enter a subject line');
      return;
    }

    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) {
        throw new Error('Not authenticated');
      }

      // Get user info for tracking
      const { data: userData } = await supabase
        .from('user')
        .select('id, email')
        .eq('auth_user_id', user.id)
        .single();

      // Convert plain text body to HTML
      const htmlBody = `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.5; color: #333;">
        ${body.split('\n').map(line => `<p style="margin: 0 0 8px 0;">${line || '&nbsp;'}</p>`).join('')}
      </div>`;

      // Send via Gmail API
      const response = await supabase.functions.invoke('hunter-send-outreach', {
        body: {
          user_email: userData?.email || user.email,
          to: toRecipients,
          cc: ccRecipients.length > 0 ? ccRecipients : undefined,
          bcc: bccRecipients.length > 0 ? bccRecipients : undefined,
          subject,
          body_html: htmlBody,
          body_text: body,
          attachments: attachments.length > 0 ? attachments : undefined,
        }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      // Log activity for each broker contact
      for (const broker of brokers) {
        if (broker.id) {
          await supabase.from('activity').insert({
            type_id: (await supabase.from('activity_type').select('id').eq('name', 'Email').single()).data?.id,
            contact_id: broker.id,
            subject: `Sent: "${subject}"`,
            description: `Email sent to ${toRecipients.join(', ')} regarding ${properties.length} propert${properties.length === 1 ? 'y' : 'ies'}`,
            owner_id: userData?.id,
            activity_date: new Date().toISOString().split('T')[0],
          });
        }
      }

      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Error sending email:', error);
      alert(`Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  const brokerNames = brokers.map(b => [b.first_name, b.last_name].filter(Boolean).join(' ') || 'Unknown').join(', ');

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={onClose} />

        {/* Modal */}
        <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <div>
              <h3 className="text-lg font-medium text-gray-900">Email Broker</h3>
              <p className="text-sm text-gray-500">{brokerNames}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {/* Recipients */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
              <div className="flex flex-wrap gap-2 p-2 border border-gray-300 rounded-md min-h-[40px]">
                {toRecipients.map(email => (
                  <span key={email} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm">
                    {email}
                    <button onClick={() => handleRemoveRecipient('to', email)} className="text-blue-600 hover:text-blue-800">×</button>
                  </span>
                ))}
              </div>
            </div>

            {/* CC */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CC</label>
              <div className="flex flex-wrap gap-2 p-2 border border-gray-300 rounded-md min-h-[40px]">
                {ccRecipients.map(email => (
                  <span key={email} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-800 rounded text-sm">
                    {email}
                    <button onClick={() => handleRemoveRecipient('cc', email)} className="text-gray-600 hover:text-gray-800">×</button>
                  </span>
                ))}
              </div>
            </div>

            {/* Add Recipient */}
            <div className="flex gap-2">
              <select
                value={recipientType}
                onChange={(e) => setRecipientType(e.target.value as 'to' | 'cc' | 'bcc')}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="to">To</option>
                <option value="cc">CC</option>
                <option value="bcc">BCC</option>
              </select>
              <input
                type="email"
                value={newRecipient}
                onChange={(e) => setNewRecipient(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddRecipient()}
                placeholder="Add recipient email..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
              <button
                onClick={handleAddRecipient}
                disabled={!newRecipient.trim() || !isValidEmail(newRecipient)}
                className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50 text-sm"
              >
                Add
              </button>
            </div>

            {/* Subject */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>

            {/* Body */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={12}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-sans"
              />
            </div>

            {/* Attachments */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50 w-fit">
                <input type="file" multiple onChange={handleFileSelect} className="sr-only" />
                <Paperclip size={16} />
                Attach Files
              </label>
              {attachments.length > 0 && (
                <div className="mt-2 space-y-1">
                  {attachments.map((att, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-gray-600">
                      <Paperclip size={14} />
                      <span>{att.filename}</span>
                      <button
                        onClick={() => setAttachments(attachments.filter((_, idx) => idx !== i))}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
            <div className="text-sm text-gray-500">
              {properties.length} propert{properties.length === 1 ? 'y' : 'ies'} • {toRecipients.length} recipient{toRecipients.length !== 1 ? 's' : ''}
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                disabled={sending}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sending || toRecipients.length === 0 || !subject.trim()}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {sending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    Send
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
