// components/FloatingContactPanel.tsx - Improved Design with Scrolling
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
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop - No Blur */}
      <div 
        className="fixed inset-0 bg-black/10 transition-all duration-300 z-40"
        onClick={closePanel}
      />

      {/* Panel - Improved Design */}
      <div className={`
        fixed right-0 top-0 h-full w-80 bg-white shadow-2xl border-l border-gray-200
        transform transition-all duration-300 ease-out z-50
        ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        flex flex-col
      `}>
        {/* Header - Fixed */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-white shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center shadow-sm">
              <span className="text-white text-sm">👥</span>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Contacts</h2>
              <p className="text-xs text-gray-500">{contacts.length} contact{contacts.length !== 1 ? 's' : ''} on this deal</p>
            </div>
          </div>
          <button
            onClick={closePanel}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
                    <div className="flex-1">
                      <div className="h-4 bg-gray-200 rounded mb-2"></div>
                      <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-red-500 text-lg">⚠️</span>
              </div>
              <p className="text-red-600 font-medium mb-1">Error Loading Contacts</p>
              <p className="text-sm text-gray-500">{error}</p>
            </div>
          ) : contacts.length === 0 ? (
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-gray-300 text-2xl">👥</span>
              </div>
              <p className="text-gray-700 font-medium mb-2">No Contacts Yet</p>
              <p className="text-sm text-gray-500 mb-4">Add contacts to this deal to see them here</p>
              <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
                Add Contact
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {contacts.map((contact) => (
                <div key={contact.id} className="p-4 hover:bg-gray-25 transition-colors">
                  <div className="flex items-start space-x-3">
                    {/* Avatar */}
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-500 rounded-full flex items-center justify-center shadow-sm">
                        <span className="text-white font-medium text-sm">
                          {getContactInitials(contact.contact_name)}
                        </span>
                      </div>
                    </div>

                    {/* Contact Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <button
                          className="text-sm font-semibold text-gray-900 hover:text-blue-600 transition-colors truncate"
                          onClick={() => {
                            console.log('View contact:', contact.contact_id);
                          }}
                        >
                          {contact.contact_name}
                        </button>
                        {contact.primary_contact && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 border border-green-200">
                            Primary
                          </span>
                        )}
                      </div>
                      
                      <p className="text-xs font-medium text-blue-600 mb-2">
                        {contact.role_label}
                      </p>

                      {/* Contact Details */}
                      <div className="space-y-1">
                        {contact.contact_email && (
                          <p className="text-xs text-gray-600 truncate">
                            📧 {contact.contact_email}
                          </p>
                        )}
                        {contact.contact_phone && (
                          <button
                            onClick={() => handleCall(contact.contact_phone, contact.contact_name)}
                            className="text-xs text-gray-600 hover:text-blue-600 transition-colors cursor-pointer"
                          >
                            📞 {contact.contact_phone}
                          </button>
                        )}
                        {contact.contact_mobile && (
                          <button
                            onClick={() => handleCall(contact.contact_mobile, contact.contact_name)}
                            className="text-xs text-gray-600 hover:text-blue-600 transition-colors cursor-pointer block"
                          >
                            📱 {contact.contact_mobile}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer - Fixed */}
        <div className="p-4 border-t border-gray-100 bg-gray-50 shrink-0">
          <button className="w-full flex items-center justify-center px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
            <span className="mr-2">+</span>
            Add Contact Role
          </button>
        </div>
      </div>
    </>
  );
};