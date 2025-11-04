import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

interface CriticalDateEmailPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  criticalDateId: string | null;
  dealId: string;
  dealName: string;
  subject: string;
  criticalDate: string;
  description: string;
  daysPrior: string;
}

interface Contact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
}

interface DealOwner {
  id: string;
  name: string | null;
  email: string | null;
}

const CriticalDateEmailPreviewModal: React.FC<CriticalDateEmailPreviewModalProps> = ({
  isOpen,
  onClose,
  criticalDateId,
  dealId,
  dealName,
  subject,
  criticalDate,
  description,
  daysPrior,
}) => {
  const [loading, setLoading] = useState(false);
  const [recipients, setRecipients] = useState<Contact[]>([]);
  const [dealOwner, setDealOwner] = useState<DealOwner | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [emailHtml, setEmailHtml] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchRecipients();
      generateEmailPreview();
    }
  }, [isOpen, dealId, subject, criticalDate, description, daysPrior]);

  const fetchRecipients = async () => {
    try {
      setLoading(true);

      // Fetch the deal to get owner info and client_id
      const { data: dealData, error: dealError } = await supabase
        .from('deal')
        .select(`
          client_id,
          owner:owner_id (
            id,
            name,
            email
          )
        `)
        .eq('id', dealId)
        .single();

      if (dealError) throw dealError;

      setDealOwner(dealData?.owner as DealOwner);

      // Fetch contacts with "Critical Dates Reminders" role
      const { data: roleData, error: roleError } = await supabase
        .from('contact_client_role_type')
        .select('id')
        .eq('role_name', 'Critical Dates Reminders')
        .single();

      if (roleError) {
        console.error('Error fetching role:', roleError);
        return;
      }

      if (!roleData || !dealData?.client_id) {
        console.log('No role or client_id found');
        return;
      }

      // Fetch all contacts with Critical Dates Reminders role for this client
      const { data: contacts, error: contactsError } = await supabase
        .from('contact_client_role')
        .select(`
          contact:contact_id (
            id,
            first_name,
            last_name,
            email
          )
        `)
        .eq('client_id', dealData.client_id)
        .eq('role_id', roleData.id)
        .eq('is_active', true);

      if (contactsError) throw contactsError;

      // Filter for contacts with emails and deduplicate
      const contactsWithEmail = contacts
        ?.filter((item: any) => item.contact?.email)
        .map((item: any) => item.contact) || [];

      const uniqueContacts = Array.from(
        new Map(contactsWithEmail.map((c: any) => [c.email, c])).values()
      );

      setRecipients(uniqueContacts);
    } catch (err) {
      console.error('Error fetching recipients:', err);
    } finally {
      setLoading(false);
    }
  };

  const generateEmailPreview = () => {
    const html = generateCriticalDateEmailTemplate({
      dealName,
      subject,
      criticalDate,
      description,
      daysPrior,
      contactFirstName: 'John', // Placeholder for preview
    });
    setEmailHtml(html);
  };

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return 'TBD';
    const [year, month, day] = dateStr.split('-');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${monthNames[parseInt(month) - 1]} ${parseInt(day)}, ${year}`;
  };

  const calculateReminderDate = (criticalDateStr: string, daysPriorStr: string): string => {
    if (!criticalDateStr || !daysPriorStr) return 'N/A';
    const criticalDateObj = new Date(criticalDateStr);
    const daysPriorNum = parseInt(daysPriorStr);
    if (isNaN(daysPriorNum)) return 'N/A';

    const reminderDate = new Date(criticalDateObj);
    reminderDate.setDate(reminderDate.getDate() - daysPriorNum);

    return reminderDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-[800px] max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800">
            Email Preview - Critical Date Reminder
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-md transition-colors text-gray-500 hover:text-gray-700"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Preview/Edit Toggle */}
        <div className="flex border-b border-gray-200 bg-gray-50">
          <button
            onClick={() => setShowPreview(true)}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              showPreview
                ? 'bg-white border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Preview
          </button>
          <button
            onClick={() => setShowPreview(false)}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              !showPreview
                ? 'bg-white border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Recipients
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {showPreview ? (
            <div className="space-y-4">
              {/* Email Metadata */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-2 border border-gray-200">
                <div className="flex items-start">
                  <span className="text-xs font-medium text-gray-600 w-24">From:</span>
                  <span className="text-xs text-gray-800">notifications@oculusrep.com</span>
                </div>
                <div className="flex items-start">
                  <span className="text-xs font-medium text-gray-600 w-24">To:</span>
                  <span className="text-xs text-gray-800">
                    {recipients.length > 0
                      ? `${recipients.length} contact${recipients.length !== 1 ? 's' : ''} with "Critical Dates Reminders" role`
                      : 'No recipients found'}
                  </span>
                </div>
                <div className="flex items-start">
                  <span className="text-xs font-medium text-gray-600 w-24">CC:</span>
                  <span className="text-xs text-gray-800">
                    {dealOwner?.email || 'Deal Owner'}, mike@oculusrep.com (Admin)
                  </span>
                </div>
                <div className="flex items-start">
                  <span className="text-xs font-medium text-gray-600 w-24">Subject:</span>
                  <span className="text-xs text-gray-800 font-medium">
                    Critical Date Reminder: {subject || 'Untitled'} - {dealName}
                  </span>
                </div>
                {criticalDate && daysPrior && (
                  <div className="flex items-start">
                    <span className="text-xs font-medium text-gray-600 w-24">Send Date:</span>
                    <span className="text-xs text-gray-800">
                      {calculateReminderDate(criticalDate, daysPrior)}
                    </span>
                  </div>
                )}
              </div>

              {/* Email Preview */}
              <div className="border border-gray-300 rounded-lg overflow-hidden">
                <div
                  dangerouslySetInnerHTML={{ __html: emailHtml }}
                  className="bg-white"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-blue-800 mb-2">Email Recipients</h4>
                <p className="text-xs text-blue-700">
                  This email will be sent to the following people when the scheduled date arrives:
                </p>
              </div>

              {/* TO Recipients */}
              <div>
                <h5 className="text-xs font-semibold text-gray-700 mb-2">
                  TO ({recipients.length})
                </h5>
                {loading ? (
                  <div className="text-xs text-gray-500">Loading recipients...</div>
                ) : recipients.length > 0 ? (
                  <div className="space-y-2">
                    {recipients.map((contact) => (
                      <div
                        key={contact.id}
                        className="flex items-center space-x-2 p-2 bg-gray-50 rounded border border-gray-200"
                      >
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                          <span className="text-xs font-medium text-blue-600">
                            {(contact.first_name?.[0] || '') + (contact.last_name?.[0] || '')}
                          </span>
                        </div>
                        <div className="flex-1">
                          <div className="text-xs font-medium text-gray-800">
                            {contact.first_name} {contact.last_name}
                          </div>
                          <div className="text-xs text-gray-600">{contact.email}</div>
                        </div>
                        <span className="text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded">
                          Critical Dates Reminders
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                    <p className="text-xs text-yellow-800">
                      No contacts found with "Critical Dates Reminders" role for this deal's client.
                    </p>
                  </div>
                )}
              </div>

              {/* CC Recipients */}
              <div>
                <h5 className="text-xs font-semibold text-gray-700 mb-2">CC</h5>
                <div className="space-y-2">
                  {dealOwner && (
                    <div className="flex items-center space-x-2 p-2 bg-gray-50 rounded border border-gray-200">
                      <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                        <span className="text-xs font-medium text-green-600">
                          {dealOwner.name?.split(' ').map(n => n[0]).join('') || '?'}
                        </span>
                      </div>
                      <div className="flex-1">
                        <div className="text-xs font-medium text-gray-800">
                          {dealOwner.name || 'Unknown'}
                        </div>
                        <div className="text-xs text-gray-600">{dealOwner.email || 'No email'}</div>
                      </div>
                      <span className="text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded">
                        Deal Owner
                      </span>
                    </div>
                  )}
                  <div className="flex items-center space-x-2 p-2 bg-gray-50 rounded border border-gray-200">
                    <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                      <span className="text-xs font-medium text-purple-600">AD</span>
                    </div>
                    <div className="flex-1">
                      <div className="text-xs font-medium text-gray-800">Admin</div>
                      <div className="text-xs text-gray-600">mike@oculusrep.com</div>
                    </div>
                    <span className="text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded">
                      Admin
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end space-x-2 p-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// Email template generator
function generateCriticalDateEmailTemplate(data: {
  dealName: string;
  subject: string;
  criticalDate: string;
  description: string;
  daysPrior: string;
  contactFirstName: string;
}): string {
  const { dealName, subject, criticalDate, description, daysPrior, contactFirstName } = data;

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return 'TBD';
    const [year, month, day] = dateStr.split('-');
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${monthNames[parseInt(month) - 1]} ${parseInt(day)}, ${year}`;
  };

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background-color: #dc2626;
            color: white;
            padding: 20px;
            border-radius: 8px 8px 0 0;
          }
          .content {
            background-color: #f9fafb;
            padding: 20px;
            border: 1px solid #e5e7eb;
            border-top: none;
          }
          .field {
            margin-bottom: 15px;
          }
          .label {
            font-weight: 600;
            color: #4b5563;
            display: block;
            margin-bottom: 4px;
            font-size: 14px;
          }
          .value {
            color: #1f2937;
            font-size: 15px;
          }
          .critical-date-box {
            background-color: #fef2f2;
            border: 2px solid #dc2626;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
            text-align: center;
          }
          .critical-date-label {
            font-size: 12px;
            text-transform: uppercase;
            color: #991b1b;
            font-weight: 600;
            margin-bottom: 8px;
          }
          .critical-date-value {
            font-size: 24px;
            font-weight: bold;
            color: #dc2626;
          }
          .footer {
            background-color: #f3f4f6;
            padding: 15px;
            border-radius: 0 0 8px 8px;
            text-align: center;
            font-size: 14px;
            color: #6b7280;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h2 style="margin: 0;">Critical Date Reminder</h2>
        </div>

        <div class="content">
          <p>Hello ${contactFirstName},</p>

          <p>This is a reminder that an important critical date is approaching for one of your deals.</p>

          <div class="field">
            <span class="label">Deal:</span>
            <span class="value">${dealName || 'Untitled Deal'}</span>
          </div>

          <div class="field">
            <span class="label">Critical Date Type:</span>
            <span class="value">${subject || 'Untitled'}</span>
          </div>

          <div class="critical-date-box">
            <div class="critical-date-label">Critical Date</div>
            <div class="critical-date-value">${formatDate(criticalDate)}</div>
            ${daysPrior ? `<div style="margin-top: 8px; font-size: 12px; color: #991b1b;">
              ${daysPrior} day${parseInt(daysPrior) !== 1 ? 's' : ''} prior notification
            </div>` : ''}
          </div>

          ${description ? `
          <div class="field">
            <span class="label">Description:</span>
            <span class="value">${description}</span>
          </div>
          ` : ''}

          <div style="margin-top: 20px; padding: 15px; background-color: #eff6ff; border-left: 4px solid #2563eb; border-radius: 4px;">
            <p style="margin: 0; font-size: 14px; color: #1e40af;">
              <strong>Action Required:</strong> Please review this critical date and take any necessary actions to ensure all deadlines are met.
            </p>
          </div>
        </div>

        <div class="footer">
          <p style="margin: 0;">This is an automated reminder from your CRM system.</p>
          <p style="margin: 5px 0 0 0; font-size: 12px;">
            You are receiving this email because you have the "Critical Dates Reminders" role for this client.
          </p>
        </div>
      </body>
    </html>
  `;
}

export default CriticalDateEmailPreviewModal;
