import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { Database } from '../../database-schema';
import ContactOverviewTab from '../components/ContactOverviewTab';
import GenericActivityTab from '../components/GenericActivityTab';
import ContactSidebar from '../components/ContactSidebar';
import FileManager from '../components/FileManager/FileManager';
import { useTrackPageView } from '../hooks/useRecentlyViewed';
import Toast from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../hooks/useToast';

type Contact = Database['public']['Tables']['contact']['Row'];

const ContactDetailsPage: React.FC = () => {
  const { contactId } = useParams<{ contactId: string }>();
  const navigate = useNavigate();
  const [contact, setContact] = useState<Contact | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSidebarMinimized, setIsSidebarMinimized] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { trackView } = useTrackPageView();
  const { toast, showToast } = useToast();

  console.log('ContactDetailsPage - contactId from URL:', contactId);
  const isNewContact = contactId === 'new';
  console.log('ContactDetailsPage - isNewContact:', isNewContact);

  // Reset state when navigating to new contact
  useEffect(() => {
    if (isNewContact) {
      setError(null);
      setContact(null);
      setActiveTab('overview');
    }
  }, [isNewContact]);

  // Set page title
  useEffect(() => {
    if (isNewContact) {
      document.title = "New Contact | OVIS";
    } else if (contact) {
      const name = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
      document.title = name ? `${name} | OVIS` : "Contact | OVIS";
    } else {
      document.title = "Contact | OVIS";
    }
  }, [contact, isNewContact]);

  useEffect(() => {
    const fetchContact = async () => {
      // Handle new contact creation - check this FIRST
      if (!contactId || isNewContact || contactId === 'new') {
        setLoading(false);
        setError(null); // Clear any previous errors
        setContact(null); // Clear any previous contact data
        return;
      }

      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('contact')
          .select('*')
          .eq('id', contactId)
          .single();

        if (error) {
          console.error('Error fetching contact:', error);
          setError(`Failed to load contact: ${error.message}`);
        } else if (data) {
          setContact(data);
          // Track this contact as recently viewed
          trackView(
            data.id,
            'contact',
            `${data.first_name || ''} ${data.last_name || ''}`.trim() || 'Unnamed Contact',
            data.company || data.email || undefined
          );
        } else {
          setError('Contact not found');
        }
      } catch (err) {
        console.error('Unexpected error:', err);
        setError('An unexpected error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchContact();
  }, [contactId, isNewContact]);

  const handleContactUpdate = (updatedContact: Contact) => {
    setContact(updatedContact);
    // If this was a new contact that just got saved, update the URL and navigate
    if (isNewContact && updatedContact.id) {
      navigate(`/contact/${updatedContact.id}`, { replace: true });
    }
  };

  const handleDelete = () => {
    if (!contactId || isNewContact) return;
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    setShowDeleteConfirm(false);

    try {
      // If contact has portal access, clean up the auth user first
      if (contact?.portal_auth_user_id || contact?.portal_access_enabled) {
        try {
          const response = await supabase.functions.invoke('delete-portal-user', {
            body: { contactId }
          });
          if (response.error) {
            console.warn('Portal user cleanup warning:', response.error);
            // Continue with deletion even if auth cleanup fails
          }
        } catch (portalError) {
          console.warn('Portal user cleanup failed:', portalError);
          // Continue with deletion - auth user will be orphaned but harmless
        }
      }

      // Delete all activities associated with this contact
      const { error: activitiesError } = await supabase
        .from('activity')
        .delete()
        .eq('contact_id', contactId);

      if (activitiesError) {
        console.error('Error deleting associated activities:', activitiesError);
        throw new Error('Failed to delete associated activities');
      }

      // Then delete the contact
      const { error } = await supabase
        .from('contact')
        .delete()
        .eq('id', contactId);

      if (error) throw error;

      showToast('Contact and associated activities deleted successfully!', { type: 'success' });

      // Navigate after a brief delay to show the toast
      setTimeout(() => {
        navigate('/master-pipeline');
      }, 1000);
    } catch (error) {
      console.error('Error deleting contact:', error);
      showToast(`Error deleting contact: ${error instanceof Error ? error.message : 'Unknown error'}`, { type: 'error' });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-sm text-gray-600">Loading contact...</div>
        </div>
      </div>
    );
  }

  if (error && !isNewContact) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg border border-red-200 p-6 max-w-md mx-4">
          <div className="text-red-600 text-center">
            <svg className="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.732 15.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <h3 className="text-lg font-semibold mb-2">Contact Not Found</h3>
            <p className="text-sm text-gray-600 mb-4">{error}</p>
            <button
              onClick={() => navigate(-1)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  const contactName = contact
    ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Contact'
    : 'New Contact';

  const ContactIcon = () => (
    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );

  return (
    <>
      <div className="min-h-screen bg-gray-50">
        {/* Contact Header Bar */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 border-b border-slate-600 text-white px-6 py-4">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-3">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-600 rounded-lg">
                  <ContactIcon />
                  <span className="text-white text-sm font-medium">Contact</span>
                </div>
                <h1 className="text-xl font-bold leading-tight">
                  {contactName}
                </h1>
                {contact?.company && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-600 text-white">
                    {contact.company}
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-2">
                {!isNewContact && contactId && (
                  <button
                    onClick={handleDelete}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-md transition-colors"
                    title="Delete Contact"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Delete
                  </button>
                )}
                {contact?.source_type && (
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    contact.source_type === 'Lead'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-blue-100 text-blue-800'
                  }`}>
                    {contact.source_type}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className={`max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8 transition-all duration-300 ${
          !isSidebarMinimized ? 'mr-[500px]' : 'mr-12'
        }`}>
        {/* Tab Navigation */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'overview'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Details
            </button>
            <button
              onClick={() => setActiveTab('activity')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'activity'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Activity
            </button>
            <button
              onClick={() => setActiveTab('files')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'files'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Files
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <ContactOverviewTab
            contact={contact}
            isNewContact={isNewContact}
            onSave={handleContactUpdate}
          />
        )}

        {activeTab === 'activity' && (
          <>
            {isNewContact || !contact?.id ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                <div className="flex">
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-yellow-800">Save Contact First</h3>
                    <div className="mt-2 text-sm text-yellow-700">
                      <p>Please save the contact in the Details tab before viewing activities.</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <GenericActivityTab
                config={{
                  parentObject: {
                    id: contact.id,
                    type: 'contact' as const,
                    name: contactName
                  },
                  title: 'Contact Activities',
                  showSummary: true,
                  allowAdd: true
                }}
              />
            )}
          </>
        )}

        {activeTab === 'files' && (
          <>
            {isNewContact || !contact?.id ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                <div className="flex">
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-yellow-800">Save Contact First</h3>
                    <div className="mt-2 text-sm text-yellow-700">
                      <p>Please save the contact in the Details tab before viewing files.</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mb-6">
                <FileManager
                  entityType="contact"
                  entityId={contact.id}
                />
              </div>
            )}
          </>
        )}
        </div>
      </div>

      {/* Contact Sidebar */}
      {contactId && contactId !== 'new' && (
        <ContactSidebar
          contactId={contactId}
          isMinimized={isSidebarMinimized}
          onMinimize={() => setIsSidebarMinimized(!isSidebarMinimized)}
          onPropertyClick={(propertyId) => navigate(`/property/${propertyId}`)}
          onDealClick={(dealId) => navigate(`/deal/${dealId}`)}
          onClientClick={(clientId) => navigate(`/client/${clientId}`)}
        />
      )}

      {/* Toast Notification */}
      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Contact"
        message="Are you sure you want to delete this contact? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </>
  );
};

export default ContactDetailsPage;