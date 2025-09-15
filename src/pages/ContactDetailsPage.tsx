import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { Database } from '../../database-schema';
import ContactOverviewTab from '../components/ContactOverviewTab';
import GenericActivityTab from '../components/GenericActivityTab';
import { useTrackPageView } from '../hooks/useRecentlyViewed';

type Contact = Database['public']['Tables']['contact']['Row'];

const ContactDetailsPage: React.FC = () => {
  const { contactId } = useParams<{ contactId: string }>();
  const navigate = useNavigate();
  const [contact, setContact] = useState<Contact | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { trackView } = useTrackPageView();

  const isNewContact = contactId === 'new';

  useEffect(() => {
    const fetchContact = async () => {
      if (isNewContact) {
        setLoading(false);
        return;
      }

      if (!contactId) {
        setError('Contact ID not provided');
        setLoading(false);
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

  const handleDelete = async () => {
    if (!contactId || isNewContact) return;

    if (!confirm('Are you sure you want to delete this contact? This action cannot be undone.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('contact')
        .delete()
        .eq('id', contactId);

      if (error) throw error;

      alert('Contact deleted successfully!');
      navigate('/master-pipeline');
    } catch (error) {
      console.error('Error deleting contact:', error);
      alert(`Error deleting contact: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Contact Header Bar */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6 md:justify-start md:space-x-10">
            <div className="flex justify-start lg:w-0 lg:flex-1">
              <h1 className="text-2xl font-bold text-gray-900">
                {contactName}
              </h1>
              {contact?.company && (
                <span className="ml-3 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                  {contact.company}
                </span>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => navigate('/master-pipeline')}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Back to Pipeline
              </button>
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

      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
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
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <ContactOverviewTab
            contact={contact}
            isNewContact={isNewContact}
            onSave={handleContactUpdate}
            onDelete={handleDelete}
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
      </div>
    </div>
  );
};

export default ContactDetailsPage;