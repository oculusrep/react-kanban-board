// components/FloatingContactPanel.tsx
import React from 'react';
import { usePanelManager } from './FloatingPanelManager';
import { useDealContacts } from '../hooks/useDealContacts';

interface FloatingContactPanelProps {
  dealId: string;
}

export const FloatingContactPanel: React.FC<FloatingContactPanelProps> = ({ dealId }) => {
  const { activePanel, closePanel } = usePanelManager();
  const { contacts, loading, error } = useDealContacts(dealId);
  
  const isOpen = activePanel === 'contacts';

  const getContactInitials = (name: string) => {
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
    }
    return name.charAt(0).toUpperCase() || '?';
  };

  const handleCall = (phone: string | null, name: string) => {
    if (phone) {
      window.open(`tel:${phone}`, '_self');
    } else {
      alert(`No phone number available for ${name}`);
    }
  };

  const handleEmail = (email: string | null, name: string) => {
    if (email) {
      window.open(`mailto:${email}`, '_self');
    } else {
      alert(`No email address available for ${name}`);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-20 transition-opacity duration-300 z-[998]"
        onClick={closePanel}
      />

      {/* Panel */}
      <div className={`
        fixed right-0 top-0 h-full w-96 bg-white shadow-2xl transform transition-transform duration-300 ease-in-out z-[999]
        ${isOpen ? 'translate-x-0' : 'translate-x-full'}
      `}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-sm">👥</span>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Contact Roles</h2>
              <p className="text-sm text-gray-500">{contacts.length} contact{contacts.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button
            onClick={closePanel}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-200 transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
                    <div className="flex-1">
                      <div className="h-4 bg-gray-200 rounded mb-2"></div>
                      <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="p-4 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-red-600 text-xl">⚠️</span>
              </div>
              <p className="text-red-600 font-medium mb-1">Error Loading Contacts</p>
              <p className="text-sm text-gray-500">{error}</p>
            </div>
          ) : contacts.length === 0 ? (
            <div className="p-4 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-gray-400 text-xl">👥</span>
              </div>
              <p className="text-gray-600 font-medium mb-1">No Contacts Yet</p>
              <p className="text-sm text-gray-500 mb-4">Add contacts to this deal to see them here</p>
              <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                Add Contact
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {contacts.map((contact) => (
                <div key={contact.id} className="p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start space-x-3">
                    {/* Avatar */}
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center">
                        <span className="text-white font-medium">
                          {getContactInitials(contact.contact_name)}
                        </span>
                      </div>
                    </div>

                    {/* Contact Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <button
                          className="text-base font-medium text-gray-900 hover:text-blue-600 transition-colors truncate"
                          onClick={() => {
                            // TODO: Navigate to contact details
                            console.log('View contact:', contact.contact_id);
                          }}
                        >
                          {contact.contact_name}
                        </button>
                        {contact.primary_contact && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Primary
                          </span>
                        )}
                      </div>
                      
                      <p className="text-sm text-gray-600 mb-2">
                        <span className="font-medium">{contact.role_label}</span>
                      </p>

                      {/* Contact Details */}
                      <div className="space-y-1">
                        {contact.contact_email && (
                          <p className="text-sm text-gray-500 truncate">
                            📧 {contact.contact_email}
                          </p>
                        )}
                        {contact.contact_phone && (
                          <p className="text-sm text-gray-500">
                            📞 {contact.contact_phone}
                          </p>
                        )}
                      </div>

                      {/* Quick Actions */}
                      <div className="flex items-center space-x-2 mt-3">
                        <button
                          onClick={() => handleCall(contact.contact_phone, contact.contact_name)}
                          className="flex items-center px-3 py-1.5 text-xs font-medium text-green-700 bg-green-100 rounded-lg hover:bg-green-200 transition-colors"
                        >
                          📞 Call
                        </button>
                        <button
                          onClick={() => handleEmail(contact.contact_email, contact.contact_name)}
                          className="flex items-center px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-100 rounded-lg hover:bg-blue-200 transition-colors"
                        >
                          📧 Email
                        </button>
                        <button
                          onClick={() => {
                            // TODO: View contact details
                            console.log('View contact details:', contact.contact_id);
                          }}
                          className="flex items-center px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                        >
                          👁️ View
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <button className="w-full flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <span className="mr-2">➕</span>
            Add Contact Role
          </button>
        </div>
      </div>
    </>
  );
};