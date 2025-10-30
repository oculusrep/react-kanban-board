import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Database } from '../../../database-schema';
import SiteSubmitFormModal from '../SiteSubmitFormModal';
import SiteSubmitSidebar from '../SiteSubmitSidebar';
import ContactFormModal from '../ContactFormModal';
import AddContactsModal from './AddContactsModal';
import SidebarModule from '../sidebar/SidebarModule';
import FileManagerModule from '../sidebar/FileManagerModule';
import SiteSubmitItem from '../sidebar/SiteSubmitItem';

type Contact = Database['public']['Tables']['contact']['Row'];
type Deal = Database['public']['Tables']['deal']['Row'];
type SiteSubmit = Database['public']['Tables']['site_submit']['Row'];

interface PropertyContactWithDetails extends Contact {
  isPrimaryContact?: boolean;
}

interface PropertySidebarProps {
  propertyId: string;
  isMinimized?: boolean;
  onMinimize?: () => void;
  onDealClick?: (dealId: string) => void;
  onSiteSubmitModalChange?: (isOpen: boolean) => void;
  onContactModalChange?: (isOpen: boolean) => void;
}

// Contact Item Component
interface ContactItemProps {
  contact: PropertyContactWithDetails;
  isExpanded?: boolean;
  onToggle?: () => void;
  onEdit?: (contactId: string) => void;
  onRemove?: (contactId: string) => void;
}

const ContactItem: React.FC<ContactItemProps> = ({ contact, isExpanded = false, onToggle, onEdit, onRemove }) => {
  const displayPhone = contact.mobile_phone || contact.phone;
  const phoneLabel = contact.mobile_phone ? 'Mobile' : 'Phone';
  
  return (
    <div className="border-b border-gray-100 last:border-b-0 group">
      <div
        className="p-2 hover:bg-gray-50 cursor-pointer transition-colors flex items-center justify-between"
      >
        <div className="flex items-center space-x-3 flex-1 min-w-0" onClick={onToggle}>
          <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-white font-medium text-xs">
              {contact.first_name?.[0] || '?'}{contact.last_name?.[0] || ''}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-gray-900 truncate">
                {contact.first_name} {contact.last_name}
              </span>
              {displayPhone && (
                <span className="text-xs text-gray-500 truncate">{phoneLabel}: {displayPhone}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {/* Trash icon - visible on hover */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm('Remove this contact from the property? The contact will not be deleted, only the association.')) {
                onRemove?.(contact.id);
              }
            }}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-50 rounded"
            title="Remove contact from property"
          >
            <svg
              className="w-4 h-4 text-gray-400 hover:text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          {/* Chevron - always visible */}
          <div onClick={onToggle}>
            <svg
              className={`w-3 h-3 text-gray-400 transform transition-transform flex-shrink-0 ${
                isExpanded ? 'rotate-90' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>
      {isExpanded && (
        <div className="px-2 pb-2 bg-blue-25">
          <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
                <span className="font-medium text-blue-900">Contact Details</span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit?.(contact.id);
                }}
                className="text-blue-600 hover:text-blue-800 font-medium"
                title="Edit contact"
              >
                Edit
              </button>
            </div>
            <div className="space-y-1 ml-4">
              {contact.title && (
                <div><span className="font-medium text-blue-800">Title:</span> <span className="text-blue-700">{contact.title}</span></div>
              )}
              {contact.company && (
                <div><span className="font-medium text-blue-800">Company:</span> <span className="text-blue-700">{contact.company}</span></div>
              )}
              {contact.email && (
                <div><span className="font-medium text-blue-800">Email:</span> <span className="text-blue-700">{contact.email}</span></div>
              )}
              {contact.phone && (
                <div><span className="font-medium text-blue-800">Phone:</span> <span className="text-blue-700">{contact.phone}</span></div>
              )}
              {contact.mobile_phone && (
                <div><span className="font-medium text-blue-800">Mobile:</span> <span className="text-blue-700">{contact.mobile_phone}</span></div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Deal Item Component
interface DealItemProps {
  deal: Deal;
  onClick?: (dealId: string) => void;
}

const DealItem: React.FC<DealItemProps> = ({ deal, onClick }) => (
  <div 
    className="p-2 hover:bg-blue-50 cursor-pointer transition-colors border-b border-gray-100 last:border-b-0 group"
    onClick={() => onClick?.(deal.id)}
  >
    <div className="flex items-center justify-between">
      <div className="flex-1 min-w-0">
        <div className="flex items-center space-x-2">
          <p className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-900">
            {deal.deal_name || 'Unnamed Deal'}
          </p>
          <svg className="w-3 h-3 text-gray-400 group-hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </div>
        <div className="flex items-center justify-between mt-1">
          <p className="text-xs text-blue-600 font-medium">
            {deal.deal_stage?.label || 'No stage'}
          </p>
          <p className="text-xs text-gray-500 truncate ml-2">
            {deal.client?.client_name || 'No client'}
          </p>
        </div>
      </div>
    </div>
  </div>
);


const PropertySidebar: React.FC<PropertySidebarProps> = ({
  propertyId,
  isMinimized = false,
  onMinimize,
  onDealClick,
  onSiteSubmitModalChange,
  onContactModalChange
}) => {
  const [contacts, setContacts] = useState<PropertyContactWithDetails[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [siteSubmits, setSiteSubmits] = useState<SiteSubmit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSiteSubmitModal, setShowSiteSubmitModal] = useState(false); // For creating new
  const [siteSubmitSidebarOpen, setSiteSubmitSidebarOpen] = useState(false); // For viewing existing
  const [siteSubmitSidebarId, setSiteSubmitSidebarId] = useState<string | null>(null);
  const [siteSubmitSidebarMinimized, setSiteSubmitSidebarMinimized] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [showAddContactsModal, setShowAddContactsModal] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);

  // Expansion states
  const getSmartDefaults = () => ({
    contacts: contacts.length > 0,
    deals: deals.length > 0,
    siteSubmits: siteSubmits.length > 0,
    files: true  // Files expanded by default
  });

  const [expandedSidebarModules, setExpandedSidebarModules] = useState(() => {
    const saved = localStorage.getItem(`expandedSidebarModules_${propertyId}`);
    return saved ? JSON.parse(saved) : getSmartDefaults();
  });

  const [expandedContacts, setExpandedContacts] = useState<Record<string, boolean>>({});

  // Load real data function (extracted so it can be called from modal callbacks)
  const loadData = async () => {
    if (!propertyId) return;
      setLoading(true);
      setError(null);

      try {
        // Load contacts
        const { data: propertyContacts, error: contactError } = await supabase
          .from('property_contact')
          .select(`
            *,
            contact!fk_property_contact_contact_id (*)
          `)
          .eq('property_id', propertyId);

        if (contactError) throw contactError;

        const contactsData: PropertyContactWithDetails[] = [];
        if (propertyContacts) {
          propertyContacts.forEach((pc: any) => {
            if (pc.contact) {
              contactsData.push({
                ...pc.contact,
                isPrimaryContact: false
              });
            }
          });
        }

        // Check for primary contact
        const { data: property, error: propertyError } = await supabase
          .from('property')
          .select('contact_id')
          .eq('id', propertyId)
          .single();

        if (!propertyError && property?.contact_id) {
          const primaryContactIndex = contactsData.findIndex(c => c.id === property.contact_id);
          if (primaryContactIndex >= 0) {
            contactsData[primaryContactIndex].isPrimaryContact = true;
          } else {
            const { data: primaryContact } = await supabase
              .from('contact')
              .select('*')
              .eq('id', property.contact_id)
              .single();

            if (primaryContact) {
              contactsData.unshift({ ...primaryContact, isPrimaryContact: true });
            }
          }
        }

        setContacts(contactsData);

        // Load deals with account name and stage information
        const { data: dealsData, error: dealsError } = await supabase
          .from('deal')
          .select(`
            *,
            deal_stage (
              label,
              sort_order
            ),
            client!client_id (
              client_name
            )
          `)
          .eq('property_id', propertyId)
          .order('created_at', { ascending: false });

        if (dealsError) throw dealsError;
        setDeals(dealsData || []);

        // Load site submits
        const { data: siteSubmitsData, error: siteSubmitsError } = await supabase
          .from('site_submit')
          .select(`
            *,
            client!client_id (
              client_name
            ),
            property_unit (
              property_unit_name
            ),
            submit_stage!submit_stage_id (
              name
            )
          `)
          .eq('property_id', propertyId)
          .order('created_at', { ascending: false });

        if (siteSubmitsError) throw siteSubmitsError;
        setSiteSubmits(siteSubmitsData || []);


      } catch (err) {
        console.error('Error loading sidebar data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

  // Load data on mount and when propertyId changes
  useEffect(() => {
    loadData();
  }, [propertyId]);

  // Update smart defaults when data changes
  useEffect(() => {
    if (!loading) {
      setExpandedSidebarModules(prev => {
        const defaults = getSmartDefaults();
        const saved = localStorage.getItem(`expandedSidebarModules_${propertyId}`);
        return saved ? JSON.parse(saved) : defaults;
      });
    }
  }, [contacts.length, deals.length, siteSubmits.length, loading, propertyId]);

  const toggleSidebarModule = (module: keyof typeof expandedSidebarModules) => {
    const newState = {
      ...expandedSidebarModules,
      [module]: !expandedSidebarModules[module]
    };
    setExpandedSidebarModules(newState);
    localStorage.setItem(`expandedSidebarModules_${propertyId}`, JSON.stringify(newState));
  };

  const toggleContact = (contactId: string) => {
    const newState = {
      ...expandedContacts,
      [contactId]: !expandedContacts[contactId]
    };
    setExpandedContacts(newState);
    localStorage.setItem(`expandedContacts_${propertyId}`, JSON.stringify(newState));
  };

  const handleRemoveContact = async (contactId: string) => {
    try {
      // Delete the association from property_contact table (not the contact itself)
      const { error } = await supabase
        .from('property_contact')
        .delete()
        .eq('property_id', propertyId)
        .eq('contact_id', contactId);

      if (error) throw error;

      // Update local state to remove the contact from the list
      setContacts(prev => prev.filter(c => c.id !== contactId));
    } catch (err) {
      console.error('Error removing contact from property:', err);
      alert('Failed to remove contact from property. Please try again.');
    }
  };

  return (
    <>
      <div 
        className={`fixed right-0 top-0 h-full bg-white border-l border-gray-200 shadow-xl transition-all duration-300 ${
          isMinimized ? 'w-12' : 'w-[500px]'
        } z-40 ${isMinimized ? 'overflow-hidden' : 'overflow-y-auto'}`}
        style={{ top: '180px', height: 'calc(100vh - 180px)' }}
      >
        {/* Header with minimize/expand controls */}
        <div className={`flex items-center ${isMinimized ? 'justify-center' : 'justify-between'} p-2 border-b border-gray-200 bg-gray-50`}>
          {!isMinimized && (
            <h3 className="text-sm font-medium text-gray-700">Property Info</h3>
          )}
          <button
            onClick={onMinimize}
            className={`p-2 hover:bg-blue-100 hover:text-blue-600 rounded-md transition-colors group ${
              isMinimized ? 'text-gray-600' : 'text-gray-500'
            }`}
            title={isMinimized ? "Expand sidebar" : "Minimize sidebar"}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isMinimized ? (
                // Expand icon - panel expand right
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7M4 12h16" />
              ) : (
                // Minimize icon - panel collapse right  
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M20 12H4" />
              )}
            </svg>
          </button>
        </div>
        
        {/* Sidebar Content */}
        {!isMinimized && (
          <div className="p-3">
        {loading ? (
          <div className="p-4 space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="h-4 bg-gray-200 rounded mb-2"></div>
                  <div className="space-y-2">
                    <div className="h-3 bg-gray-200 rounded"></div>
                    <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="p-4 text-center text-red-600">
            <p className="font-medium">Error loading data</p>
            <p className="text-sm">{error}</p>
          </div>
        ) : (
          <>
            {/* Associated Contacts */}
            <SidebarModule
              title="Associated Contacts"
              count={contacts.length}
              onAddNew={() => {
                setShowAddContactsModal(true);
                onContactModalChange?.(true);
              }}
              isExpanded={expandedSidebarModules.contacts}
              onToggle={() => toggleSidebarModule('contacts')}
              icon="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
              isEmpty={contacts.length === 0}
            >
              {contacts.map(contact => (
                <ContactItem
                  key={contact.id}
                  contact={contact}
                  isExpanded={expandedContacts[contact.id]}
                  onToggle={() => toggleContact(contact.id)}
                  onEdit={(contactId) => {
                    setEditingContactId(contactId);
                    setShowContactModal(true);
                    onContactModalChange?.(true);
                  }}
                  onRemove={handleRemoveContact}
                />
              ))}
            </SidebarModule>

            {/* Deals */}
            <SidebarModule
              title="Deals"
              count={deals.length}
              onAddNew={() => console.log('Add new deal')}
              isExpanded={expandedSidebarModules.deals}
              onToggle={() => toggleSidebarModule('deals')}
              icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"
              isEmpty={deals.length === 0}
            >
              {deals.map(deal => (
                <DealItem 
                  key={deal.id} 
                  deal={deal} 
                  onClick={onDealClick}
                />
              ))}
            </SidebarModule>


            {/* Site Submits */}
            <SidebarModule
              title="Site Submits"
              count={siteSubmits.length}
              onAddNew={() => {
                setShowSiteSubmitModal(true);
                onSiteSubmitModalChange?.(true);
              }}
              isExpanded={expandedSidebarModules.siteSubmits}
              onToggle={() => toggleSidebarModule('siteSubmits')}
              icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              isEmpty={siteSubmits.length === 0}
            >
              {siteSubmits.map(siteSubmit => (
                <SiteSubmitItem
                  key={siteSubmit.id}
                  siteSubmit={siteSubmit}
                  onClick={(id) => {
                    setSiteSubmitSidebarId(id);
                    setSiteSubmitSidebarOpen(true);
                    setSiteSubmitSidebarMinimized(false);
                    onSiteSubmitModalChange?.(true);
                  }}
                />
              ))}
            </SidebarModule>

            {/* Files */}
            <FileManagerModule
              entityType="property"
              entityId={propertyId}
              isExpanded={expandedSidebarModules.files}
              onToggle={() => toggleSidebarModule('files')}
            />
          </>
        )}
          </div>
        )}
      </div>

      {/* Site Submit Form Modal - For creating new site submits */}
      <SiteSubmitFormModal
        isOpen={showSiteSubmitModal}
        onClose={() => {
          setShowSiteSubmitModal(false);
          onSiteSubmitModalChange?.(false);
        }}
        propertyId={propertyId}
        onSave={(newSiteSubmit) => {
          setSiteSubmits(prev => [newSiteSubmit, ...prev]);
          setShowSiteSubmitModal(false);
          onSiteSubmitModalChange?.(false);
        }}
      />

      {/* Site Submit Sidebar - For viewing existing site submits */}
      {siteSubmitSidebarOpen && siteSubmitSidebarId && (
        <SiteSubmitSidebar
          siteSubmitId={siteSubmitSidebarId}
          isMinimized={siteSubmitSidebarMinimized}
          onMinimize={() => setSiteSubmitSidebarMinimized(!siteSubmitSidebarMinimized)}
          onClose={() => {
            setSiteSubmitSidebarOpen(false);
            setSiteSubmitSidebarId(null);
            onSiteSubmitModalChange?.(false);
          }}
        />
      )}

      {/* Contact Form Modal - Outside sidebar container for proper z-index layering */}
      <ContactFormModal
        isOpen={showContactModal}
        onClose={() => {
          setShowContactModal(false);
          setEditingContactId(null);
          onContactModalChange?.(false);
        }}
        contactId={editingContactId}
        propertyId={propertyId}
        onSave={(newContact) => {
          // Contact is already associated via ContactFormModal when propertyId is provided
          loadData();
          setShowContactModal(false);
          onContactModalChange?.(false);
        }}
        onUpdate={(updatedContact) => {
          setContacts(prev =>
            prev.map(contact => contact.id === updatedContact.id ? { ...updatedContact, isPrimaryContact: contact.isPrimaryContact } : contact)
          );
          setShowContactModal(false);
          onContactModalChange?.(false);
        }}
      />

      {/* Add Contacts Modal */}
      <AddContactsModal
        isOpen={showAddContactsModal}
        onClose={() => {
          setShowAddContactsModal(false);
          onContactModalChange?.(false);
        }}
        propertyId={propertyId}
        existingContactIds={contacts.map(c => c.id)}
        onContactsAdded={() => {
          loadData();
          setShowAddContactsModal(false);
          onContactModalChange?.(false);
        }}
        onCreateNew={() => {
          setShowContactModal(true);
          setEditingContactId(null);
        }}
      />
    </>
  );
};

export default PropertySidebar;