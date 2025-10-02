import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Database } from '../../../database-schema';
import SiteSubmitFormModal from '../SiteSubmitFormModal';
import ContactFormModal from '../ContactFormModal';
import FileManagerModule from '../sidebar/FileManagerModule';

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

// Sidebar Module Component
interface SidebarModuleProps {
  title: string;
  count: number;
  onAddNew: () => void;
  children: React.ReactNode;
  isExpanded?: boolean;
  onToggle?: () => void;
  icon?: string;
  isEmpty?: boolean;
}

const SidebarModule: React.FC<SidebarModuleProps> = ({
  title,
  count,
  onAddNew,
  children,
  isExpanded = true,
  onToggle,
  icon,
  isEmpty = false
}) => (
  <div className={`bg-white border border-gray-200 rounded-lg mb-3 shadow-sm ${isEmpty ? 'opacity-60' : ''}`}>
    <div className={`flex items-center justify-between p-3 border-b border-gray-100 ${
      isEmpty ? 'bg-gray-50' : 'bg-gradient-to-r from-slate-50 to-gray-50'
    }`}>
      <button
        onClick={onToggle}
        className="flex items-center space-x-2 flex-1 text-left hover:bg-white/50 -mx-3 px-3 py-1 rounded-t-lg transition-colors"
      >
        <svg
          className={`w-4 h-4 text-gray-400 transform transition-transform ${
            isExpanded ? 'rotate-90' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {icon && (
          <div className="w-4 h-4 flex items-center justify-center">
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
            </svg>
          </div>
        )}
        <h4 className="font-medium text-gray-900 text-sm">{title}</h4>
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${
          isEmpty ? 'bg-gray-200 text-gray-600' : 'bg-blue-100 text-blue-800'
        }`}>
          {count}
        </span>
        {isEmpty && (
          <span className="text-xs text-gray-500 italic">(Empty)</span>
        )}
      </button>
      <button
        onClick={onAddNew}
        className="flex items-center px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors ml-2"
      >
        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        New
      </button>
    </div>
    {isExpanded && (
      <div className="max-h-48 overflow-y-auto">
        {count === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">
            <div className="w-12 h-12 mx-auto mb-2 bg-gray-100 rounded-full flex items-center justify-center">
              {icon && (
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
                </svg>
              )}
            </div>
            No {title.toLowerCase()} yet
          </div>
        ) : (
          children
        )}
      </div>
    )}
  </div>
);

// Contact Item Component
interface ContactItemProps {
  contact: PropertyContactWithDetails;
  isExpanded?: boolean;
  onToggle?: () => void;
  onEdit?: (contactId: string) => void;
}

const ContactItem: React.FC<ContactItemProps> = ({ contact, isExpanded = false, onToggle, onEdit }) => {
  const displayPhone = contact.mobile_phone || contact.phone;
  const phoneLabel = contact.mobile_phone ? 'Mobile' : 'Phone';
  
  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <div 
        className="p-2 hover:bg-gray-50 cursor-pointer transition-colors flex items-center justify-between"
        onClick={onToggle}
      >
        <div className="flex items-center space-x-3 flex-1 min-w-0">
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

// Site Submit Item Component
interface SiteSubmitItemProps {
  siteSubmit: SiteSubmit;
  onClick?: (siteSubmitId: string) => void;
}

const SiteSubmitItem: React.FC<SiteSubmitItemProps> = ({ siteSubmit, onClick }) => (
  <div 
    className="p-2 hover:bg-green-50 cursor-pointer transition-colors border-b border-gray-100 last:border-b-0 group"
    onClick={() => onClick?.(siteSubmit.id)}
  >
    <div className="flex items-center justify-between">
      <div className="flex-1 min-w-0">
        <div className="flex items-center space-x-2">
          <p className="text-sm font-medium text-gray-900 truncate group-hover:text-green-900">
            {siteSubmit.site_submit_name || siteSubmit.sf_account || 'Unnamed Submit'}
          </p>
          <svg className="w-3 h-3 text-gray-400 group-hover:text-green-600 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </div>
        <div className="flex items-center justify-between mt-1">
          <p className="text-xs text-green-600 font-medium">
            {siteSubmit.sf_submit_stage || 'Site Submit'}
          </p>
          {siteSubmit.property_unit?.property_unit_name && (
            <p className="text-xs text-gray-600 font-medium">
              {siteSubmit.property_unit.property_unit_name}
            </p>
          )}
          <p className="text-xs text-gray-500 truncate ml-2">
            {siteSubmit.client?.client_name || 'No client'}
          </p>
        </div>
      </div>
    </div>
  </div>
);

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
  const [showSiteSubmitModal, setShowSiteSubmitModal] = useState(false);
  const [editingSiteSubmitId, setEditingSiteSubmitId] = useState<string | null>(null);
  const [showContactModal, setShowContactModal] = useState(false);
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

  // Load real data
  useEffect(() => {
    if (!propertyId) return;

    const loadData = async () => {
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
                setEditingContactId(null);
                setShowContactModal(true);
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
                setEditingSiteSubmitId(null);
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
                    setEditingSiteSubmitId(id);
                    setShowSiteSubmitModal(true);
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

      {/* Site Submit Form Modal - Outside sidebar container for proper z-index layering */}
      <SiteSubmitFormModal
        isOpen={showSiteSubmitModal}
        onClose={() => {
          setShowSiteSubmitModal(false);
          setEditingSiteSubmitId(null);
          onSiteSubmitModalChange?.(false);
        }}
        siteSubmitId={editingSiteSubmitId}
        propertyId={propertyId}
        onSave={(newSiteSubmit) => {
          setSiteSubmits(prev => [newSiteSubmit, ...prev]);
          setShowSiteSubmitModal(false);
          onSiteSubmitModalChange?.(false);
        }}
        onUpdate={(updatedSiteSubmit) => {
          setSiteSubmits(prev => 
            prev.map(ss => ss.id === updatedSiteSubmit.id ? updatedSiteSubmit : ss)
          );
          setShowSiteSubmitModal(false);
          onSiteSubmitModalChange?.(false);
        }}
      />

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
          setContacts(prev => [{ ...newContact, isPrimaryContact: false }, ...prev]);
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
    </>
  );
};

export default PropertySidebar;