import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import Toast from './Toast';

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

interface Property {
  property_name: string | null;
  city: string | null;
  state: string | null;
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
  const [allClientContacts, setAllClientContacts] = useState<Contact[]>([]);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [clientId, setClientId] = useState<string | null>(null);
  const [roleId, setRoleId] = useState<string | null>(null);
  const [dealOwner, setDealOwner] = useState<DealOwner | null>(null);
  const [property, setProperty] = useState<Property | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [emailHtml, setEmailHtml] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [showAddRecipientModal, setShowAddRecipientModal] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [customEmail, setCustomEmail] = useState('');
  const [customFirstName, setCustomFirstName] = useState('');
  const [customLastName, setCustomLastName] = useState('');
  const [showCustomEmailForm, setShowCustomEmailForm] = useState(false);
  const [toast, setToast] = useState({ message: '', type: '' as 'success' | 'error' | '' });
  const { user } = useAuth();

  useEffect(() => {
    if (isOpen) {
      fetchRecipients();
    }
  }, [isOpen, dealId]);

  // Regenerate preview when any of these change
  useEffect(() => {
    if (isOpen) {
      generateEmailPreview();
    }
  }, [isOpen, subject, criticalDate, description, daysPrior, property, recipients]);

  const fetchRecipients = async () => {
    try {
      setLoading(true);

      // Fetch the deal to get client_id, owner_id, and property_id
      const { data: dealData, error: dealError } = await supabase
        .from('deal')
        .select('client_id, owner_id, property_id')
        .eq('id', dealId)
        .single();

      if (dealError) throw dealError;

      if (dealData?.client_id) {
        setClientId(dealData.client_id);
      }

      // Fetch owner data separately if owner_id exists
      if (dealData?.owner_id) {
        const { data: ownerData } = await supabase
          .from('user')
          .select('id, name, email')
          .eq('id', dealData.owner_id)
          .single();

        if (ownerData) {
          setDealOwner(ownerData as DealOwner);
        }
      }

      // Fetch property data separately if property_id exists
      if (dealData?.property_id) {
        const { data: propertyData } = await supabase
          .from('property')
          .select('property_name, city, state')
          .eq('id', dealData.property_id)
          .single();

        if (propertyData) {
          setProperty(propertyData as Property);
        }
      }

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

      setRoleId(roleData.id);

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

      // Fetch all contacts for the client (for add recipient dropdown)
      const { data: allContacts, error: allContactsError } = await supabase
        .from('contact_client_relation')
        .select(`
          contact:contact_id (
            id,
            first_name,
            last_name,
            email
          )
        `)
        .eq('client_id', dealData.client_id);

      if (allContactsError) throw allContactsError;

      const allContactsFiltered = allContacts
        ?.filter((item: any) => item.contact?.email)
        .map((item: any) => item.contact) || [];

      const uniqueAllContacts = Array.from(
        new Map(allContactsFiltered.map((c: any) => [c.email, c])).values()
      );

      setAllClientContacts(uniqueAllContacts);

      // Fetch ALL contacts from the database (not just client contacts)
      const { data: allContactsData, error: allContactsDataError } = await supabase
        .from('contact')
        .select('id, first_name, last_name, email')
        .not('email', 'is', null)
        .order('first_name');

      if (allContactsDataError) throw allContactsDataError;

      setAllContacts(allContactsData || []);
    } catch (err) {
      console.error('Error fetching recipients:', err);
    } finally {
      setLoading(false);
    }
  };

  const addRecipient = async (contactId: string) => {
    if (!clientId || !roleId) {
      setToast({ message: 'Unable to add recipient', type: 'error' });
      return;
    }

    try {
      // Check if role already exists
      const { data: existing } = await supabase
        .from('contact_client_role')
        .select('id, is_active')
        .eq('contact_id', contactId)
        .eq('client_id', clientId)
        .eq('role_id', roleId)
        .maybeSingle();

      if (existing) {
        // If exists but inactive, reactivate it
        if (!existing.is_active) {
          const { error } = await supabase
            .from('contact_client_role')
            .update({ is_active: true })
            .eq('id', existing.id);

          if (error) throw error;
        } else {
          setToast({ message: 'Contact is already a recipient', type: 'error' });
          return;
        }
      } else {
        // Insert new role
        const { error } = await supabase
          .from('contact_client_role')
          .insert({
            contact_id: contactId,
            client_id: clientId,
            role_id: roleId,
            is_active: true
          });

        if (error) throw error;
      }

      setToast({ message: 'Recipient added successfully', type: 'success' });
      setShowAddRecipientModal(false);
      await fetchRecipients();
    } catch (err) {
      console.error('Error adding recipient:', err);
      setToast({ message: 'Failed to add recipient', type: 'error' });
    }
  };

  const removeRecipient = async (contactId: string) => {
    if (!clientId || !roleId) {
      setToast({ message: 'Unable to remove recipient', type: 'error' });
      return;
    }

    try {
      // Set role to inactive instead of deleting
      const { error } = await supabase
        .from('contact_client_role')
        .update({ is_active: false })
        .eq('contact_id', contactId)
        .eq('client_id', clientId)
        .eq('role_id', roleId);

      if (error) throw error;

      setToast({ message: 'Recipient removed successfully', type: 'success' });
      await fetchRecipients();
    } catch (err) {
      console.error('Error removing recipient:', err);
      setToast({ message: 'Failed to remove recipient', type: 'error' });
    }
  };

  const addCustomEmailRecipient = async () => {
    if (!clientId || !roleId) {
      setToast({ message: 'Unable to add recipient', type: 'error' });
      return;
    }

    // Validate email
    if (!customEmail || !customEmail.includes('@')) {
      setToast({ message: 'Please enter a valid email address', type: 'error' });
      return;
    }

    try {
      // Check if contact with this email already exists
      const { data: existingContact } = await supabase
        .from('contact')
        .select('id')
        .eq('email', customEmail)
        .maybeSingle();

      let contactId: string;

      if (existingContact) {
        // Use existing contact
        contactId = existingContact.id;
      } else {
        // Create new contact
        const { data: newContact, error: createError } = await supabase
          .from('contact')
          .insert({
            email: customEmail,
            first_name: customFirstName || null,
            last_name: customLastName || null,
          })
          .select('id')
          .single();

        if (createError) throw createError;
        contactId = newContact.id;
      }

      // Now add the role to this contact
      await addRecipient(contactId);

      // Reset form
      setCustomEmail('');
      setCustomFirstName('');
      setCustomLastName('');
      setShowCustomEmailForm(false);
    } catch (err) {
      console.error('Error adding custom email recipient:', err);
      setToast({ message: 'Failed to add recipient', type: 'error' });
    }
  };

  const generateEmailPreview = () => {
    // Get recipient first names separated by commas
    const recipientNames = recipients
      .map(r => r.first_name || 'there')
      .join(', ');

    const html = generateCriticalDateEmailTemplate({
      dealName,
      subject,
      criticalDate,
      description,
      daysPrior,
      contactFirstName: recipientNames || 'there',
      propertyName: property?.property_name || undefined,
      propertyCity: property?.city || undefined,
    });
    setEmailHtml(html);
  };

  const sendTestEmail = async () => {
    if (!user?.email || !user?.name) {
      setToast({ message: 'User information not found', type: 'error' });
      return;
    }

    try {
      setSendingTest(true);

      // Call the Edge Function to send test email
      const { data, error } = await supabase.functions.invoke('send-test-critical-date-email', {
        body: {
          toEmail: user.email,
          toName: user.name,
          subject: subject || 'Untitled',
          criticalDate: criticalDate || '',
          description: description || '',
          propertyName: property?.property_name,
          propertyCity: property?.city,
        },
      });

      if (error) throw error;

      setToast({ message: `Test email sent to ${user.email}`, type: 'success' });

      // Close the modal after 1.5 seconds
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Error sending test email:', err);
      setToast({ message: 'Failed to send test email', type: 'error' });
    } finally {
      setSendingTest(false);
    }
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
          <div className="flex items-center space-x-2">
            <button
              onClick={sendTestEmail}
              disabled={sendingTest}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
            >
              {sendingTest ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Sending...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span>Send Test Email</span>
                </>
              )}
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-md transition-colors text-gray-500 hover:text-gray-700"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
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
                    Critical Date Approaching - {subject || 'Untitled'}
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
                <div className="flex items-center justify-between mb-2">
                  <h5 className="text-xs font-semibold text-gray-700">
                    TO ({recipients.length})
                  </h5>
                  <button
                    onClick={() => setShowAddRecipientModal(true)}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center space-x-1"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span>Add Recipient</span>
                  </button>
                </div>
                {loading ? (
                  <div className="text-xs text-gray-500">Loading recipients...</div>
                ) : recipients.length > 0 ? (
                  <div className="space-y-2">
                    {recipients.map((contact) => (
                      <div
                        key={contact.id}
                        className="flex items-center space-x-2 p-2 bg-gray-50 rounded border border-gray-200 group"
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
                        <button
                          onClick={() => removeRecipient(contact.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 rounded transition-opacity"
                          title="Remove recipient"
                        >
                          <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                    <p className="text-xs text-yellow-800 mb-2">
                      No contacts found with "Critical Dates Reminders" role for this deal's client.
                    </p>
                    <button
                      onClick={() => setShowAddRecipientModal(true)}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium underline"
                    >
                      Click here to add recipients
                    </button>
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

      {/* Add Recipient Modal */}
      {showAddRecipientModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg shadow-xl w-[600px] max-h-[700px] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-800">Add Recipient</h3>
              <button
                onClick={() => {
                  setShowAddRecipientModal(false);
                  setShowCustomEmailForm(false);
                  setContactSearch('');
                  setCustomEmail('');
                  setCustomFirstName('');
                  setCustomLastName('');
                }}
                className="p-2 hover:bg-gray-100 rounded-md transition-colors text-gray-500 hover:text-gray-700"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {!showCustomEmailForm ? (
                <>
                  <p className="text-sm text-gray-600 mb-3">
                    Search for any contact or enter a custom email address.
                  </p>

                  {/* Search Input */}
                  <div className="mb-4">
                    <input
                      type="text"
                      placeholder="Search contacts by name or email..."
                      value={contactSearch}
                      onChange={(e) => setContactSearch(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Custom Email Button */}
                  <button
                    onClick={() => setShowCustomEmailForm(true)}
                    className="w-full mb-4 flex items-center justify-center space-x-2 p-3 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 transition-colors"
                  >
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="text-sm font-medium text-blue-700">Add Custom Email Address</span>
                  </button>

                  {/* Contact List */}
                  <div className="space-y-2">
                    {(() => {
                      const searchLower = contactSearch.toLowerCase();
                      const filteredContacts = allContacts
                        .filter(c => !recipients.find(r => r.id === c.id))
                        .filter(c => {
                          if (!contactSearch) return true;
                          const fullName = `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase();
                          const email = (c.email || '').toLowerCase();
                          return fullName.includes(searchLower) || email.includes(searchLower);
                        });

                      if (filteredContacts.length === 0) {
                        return (
                          <div className="text-sm text-gray-500 text-center py-8">
                            {contactSearch ? 'No contacts found matching your search' : 'All contacts are already recipients'}
                          </div>
                        );
                      }

                      return filteredContacts.map((contact) => (
                        <button
                          key={contact.id}
                          onClick={() => addRecipient(contact.id)}
                          className="w-full flex items-center space-x-2 p-3 bg-gray-50 hover:bg-gray-100 rounded border border-gray-200 transition-colors text-left"
                        >
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                            <span className="text-xs font-medium text-blue-600">
                              {(contact.first_name?.[0] || '') + (contact.last_name?.[0] || '')}
                            </span>
                          </div>
                          <div className="flex-1">
                            <div className="text-sm font-medium text-gray-800">
                              {contact.first_name || contact.last_name ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim() : 'No Name'}
                            </div>
                            <div className="text-xs text-gray-600">{contact.email}</div>
                          </div>
                          <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                      ));
                    })()}
                  </div>
                </>
              ) : (
                <>
                  {/* Custom Email Form */}
                  <div className="mb-4">
                    <button
                      onClick={() => setShowCustomEmailForm(false)}
                      className="text-sm text-blue-600 hover:text-blue-700 flex items-center space-x-1 mb-4"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                      <span>Back to search</span>
                    </button>
                  </div>

                  <h4 className="text-md font-semibold text-gray-800 mb-3">Add Custom Email</h4>
                  <p className="text-sm text-gray-600 mb-4">
                    Enter an email address to add as a recipient. If this email doesn't exist in contacts, a new contact will be created.
                  </p>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email Address <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        value={customEmail}
                        onChange={(e) => setCustomEmail(e.target.value)}
                        placeholder="email@example.com"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        First Name (Optional)
                      </label>
                      <input
                        type="text"
                        value={customFirstName}
                        onChange={(e) => setCustomFirstName(e.target.value)}
                        placeholder="John"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Last Name (Optional)
                      </label>
                      <input
                        type="text"
                        value={customLastName}
                        onChange={(e) => setCustomLastName(e.target.value)}
                        placeholder="Doe"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="flex justify-end space-x-2 p-4 border-t border-gray-200">
              <button
                onClick={() => {
                  setShowAddRecipientModal(false);
                  setShowCustomEmailForm(false);
                  setContactSearch('');
                  setCustomEmail('');
                  setCustomFirstName('');
                  setCustomLastName('');
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              {showCustomEmailForm && (
                <button
                  onClick={addCustomEmailRecipient}
                  disabled={!customEmail}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  Add Recipient
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: '', type: '' })}
      />
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
  propertyName?: string;
  propertyCity?: string;
}): string {
  const { subject, criticalDate, description, contactFirstName, propertyName, propertyCity } = data;
  const finalDescription = description || subject;

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
            font-size: 14px;
          }
          .content {
            background-color: #ffffff;
            padding: 30px;
          }
          .signature {
            margin-top: 30px;
            padding-top: 20px;
          }
        </style>
      </head>
      <body>
        <div class="content">
          <p>${contactFirstName},</p>
          <br>
          <p>This is a reminder email to let you know that the following Critical Date for our deal at ${propertyName || 'the property'} in ${propertyCity || 'the area'} is approaching.</p>

          <p style="margin-top: 20px; margin-bottom: 5px;"><strong>Critical Date:</strong> ${subject || 'Untitled'}</p>
          <p style="margin-top: 5px; margin-bottom: 5px;"><strong>Due Date:</strong> ${formatDate(criticalDate)}</p>
          <p style="margin-top: 5px; margin-bottom: 20px;"><strong>Description:</strong> ${finalDescription}</p>

          <p>Please give Mike or Arty a call if you have any questions or there are any concerns with the approaching deadline.</p>

          <div class="signature">
            <p style="margin-bottom: 5px;">Best,</p>
            <p style="margin-bottom: 5px;">Mike</p>
            <br>
            <p style="margin-bottom: 3px; font-size: 12px;"><strong>Mike Minihan</strong></p>
            <p style="margin-bottom: 3px; font-size: 12px;">Principal | Managing Broker</p>
            <p style="margin-bottom: 3px; font-size: 12px;">Oculus Real Estate Partners, LLC</p>
            <p style="margin-bottom: 3px; font-size: 12px;">M: 404-326-4010</p>
            <p style="margin-bottom: 3px; font-size: 12px;">E: <a href="mailto:mike@oculusrep.com" style="color: #2563eb; text-decoration: none;">mike@oculusrep.com</a></p>
          </div>
        </div>
      </body>
    </html>
  `;
}

export default CriticalDateEmailPreviewModal;
