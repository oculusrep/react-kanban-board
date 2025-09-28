import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Database } from '../../database-schema';
import RichTextNote from './RichTextNote';
import ContactFormModal from './ContactFormModal';
import SiteSubmitFormModal from './SiteSubmitFormModal';
import NoteFormModal from './NoteFormModal';

type Contact = Database['public']['Tables']['contact']['Row'];
type Note = Database['public']['Tables']['note']['Row'];
type Deal = Database['public']['Tables']['deal']['Row'];
type SiteSubmit = Database['public']['Tables']['site_submit']['Row'];

interface ClientSidebarProps {
  clientId: string;
  isMinimized?: boolean;
  onMinimize?: () => void;
  onContactClick?: (contactId: string) => void;
  onDealClick?: (dealId: string) => void;
  onContactModalChange?: (isOpen: boolean) => void;
  onSiteSubmitModalChange?: (isOpen: boolean) => void;
}

// Sidebar Module Component
interface SidebarModuleProps {
  title: string;
  count: number;
  onAddNew?: () => void;
  children: React.ReactNode;
  isExpanded?: boolean;
  onToggle?: () => void;
  icon?: string;
  isEmpty?: boolean;
  showAddButton?: boolean;
}

const SidebarModule: React.FC<SidebarModuleProps> = ({
  title,
  count,
  onAddNew,
  children,
  isExpanded = true,
  onToggle,
  icon,
  isEmpty = false,
  showAddButton = true
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
      {showAddButton && onAddNew && (
        <button
          onClick={onAddNew}
          className="flex items-center px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors ml-2"
        >
          <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New
        </button>
      )}
    </div>
    {isExpanded && (
      <div className="max-h-64 overflow-y-auto">
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
  contact: Contact;
  isExpanded?: boolean;
  onToggle?: () => void;
  onEdit?: (contactId: string) => void;
  onClick?: (contactId: string) => void;
}

const ContactItem: React.FC<ContactItemProps> = ({
  contact,
  isExpanded = false,
  onToggle,
  onEdit,
  onClick
}) => {
  const displayPhone = contact.mobile_phone || contact.phone;
  const phoneLabel = contact.mobile_phone ? 'Mobile' : 'Phone';
  const isLead = contact.source_type === 'Lead';

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <div
        className="p-2 hover:bg-gray-50 cursor-pointer transition-colors flex items-center justify-between"
        onClick={() => onClick?.(contact.id)}
      >
        <div className="flex items-center space-x-3 flex-1 min-w-0">
          <div className={`w-6 h-6 ${isLead ? 'bg-orange-500' : 'bg-blue-500'} rounded-full flex items-center justify-center flex-shrink-0`}>
            <span className="text-white font-medium text-xs">
              {contact.first_name?.[0] || '?'}{contact.last_name?.[0] || ''}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-gray-900 truncate">
                {contact.first_name} {contact.last_name}
                {isLead && <span className="text-orange-600 text-xs ml-1">(Lead)</span>}
              </span>
              {displayPhone && (
                <span className="text-xs text-gray-500 truncate">{phoneLabel}: {displayPhone}</span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle?.();
          }}
        >
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
        </button>
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

// Note Item Component
interface NoteItemProps {
  note: Note;
  onClick?: (noteId: string) => void;
}

const NoteItem: React.FC<NoteItemProps> = ({ note, onClick }) => (
  <div
    className="p-3 hover:bg-blue-50 cursor-pointer transition-colors border-b border-gray-100 last:border-b-0 group"
    onClick={() => onClick?.(note.id)}
  >
    <div className="flex items-start space-x-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center space-x-2 mb-1">
          <p className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-900">
            {note.title || 'Untitled Note'}
          </p>
          <svg className="w-3 h-3 text-gray-400 group-hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </div>
        <div className="text-xs text-gray-600 mb-2">
          {note.created_at && new Date(note.created_at).toLocaleDateString()}
        </div>
        {note.body && (
          <div className="max-h-16 overflow-hidden">
            <RichTextNote
              content={note.body}
              className="text-xs text-gray-700"
              maxHeight="max-h-16"
            />
          </div>
        )}
      </div>
    </div>
  </div>
);

// Deal Item Component
interface DealItemProps {
  deal: Deal;
  onClick?: (dealId: string) => void;
}

const DealItem: React.FC<DealItemProps> = ({ deal, onClick }) => (
  <div
    className="p-2 hover:bg-purple-50 cursor-pointer transition-colors border-b border-gray-100 last:border-b-0 group"
    onClick={() => onClick?.(deal.id)}
  >
    <div className="flex items-center justify-between">
      <div className="flex-1 min-w-0">
        <div className="flex items-center space-x-2">
          <p className="text-sm font-medium text-gray-900 truncate group-hover:text-purple-900">
            {deal.deal_name || 'Unnamed Deal'}
          </p>
          <svg className="w-3 h-3 text-gray-400 group-hover:text-purple-600 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </div>
        <div className="flex items-center justify-between mt-1">
          <p className="text-xs text-purple-600 font-medium">
            {(deal as any).deal_stage?.label || 'No stage'}
          </p>
          <p className="text-xs text-gray-500 truncate ml-2">
            {(deal as any).property?.property_name || (deal as any).property?.address || 'No property'}
          </p>
        </div>
      </div>
    </div>
  </div>
);

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
          {(siteSubmit as any).property_unit?.property_unit_name && (
            <p className="text-xs text-gray-600 font-medium">
              {(siteSubmit as any).property_unit.property_unit_name}
            </p>
          )}
          <p className="text-xs text-gray-500 truncate ml-2">
            {(siteSubmit as any).property?.property_name || (siteSubmit as any).property?.address || 'No property'}
          </p>
        </div>
      </div>
    </div>
  </div>
);

const ClientSidebar: React.FC<ClientSidebarProps> = ({
  clientId,
  isMinimized = false,
  onMinimize,
  onContactClick,
  onDealClick,
  onContactModalChange,
  onSiteSubmitModalChange
}) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [siteSubmits, setSiteSubmits] = useState<SiteSubmit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showContactModal, setShowContactModal] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [showSiteSubmitModal, setShowSiteSubmitModal] = useState(false);
  const [editingSiteSubmitId, setEditingSiteSubmitId] = useState<string | null>(null);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  // Expansion states
  const getSmartDefaults = () => ({
    contacts: contacts.length > 0,
    notes: notes.length > 0,
    deals: deals.length > 0,
    siteSubmits: siteSubmits.length > 0
  });

  const [expandedSidebarModules, setExpandedSidebarModules] = useState(() => {
    const saved = localStorage.getItem(`expandedClientSidebarModules_${clientId}`);
    return saved ? JSON.parse(saved) : getSmartDefaults();
  });

  const [expandedContacts, setExpandedContacts] = useState<Record<string, boolean>>({});

  // Load real data
  useEffect(() => {
    if (!clientId) return;

    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Load contacts associated with this client
        const { data: contactsData, error: contactsError } = await supabase
          .from('contact')
          .select('*')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false });

        if (contactsError) throw contactsError;
        setContacts(contactsData || []);

        // Load notes associated with this client
        const { data: noteAssociations, error: notesError } = await supabase
          .from('note_object_link')
          .select(`
            note_id,
            note!note_object_link_note_id_fkey (*)
          `)
          .eq('object_type', 'client')
          .eq('object_id', clientId);

        if (notesError) throw notesError;

        const notesData: Note[] = [];
        if (noteAssociations) {
          noteAssociations.forEach((na: any) => {
            if (na.note) {
              notesData.push(na.note);
            }
          });
        }

        setNotes(notesData);

        // Load deals associated with this client
        const { data: dealsData, error: dealsError } = await supabase
          .from('deal')
          .select(`
            *,
            deal_stage (
              label,
              sort_order
            ),
            property!property_id (
              property_name,
              address
            )
          `)
          .eq('client_id', clientId)
          .order('created_at', { ascending: false });

        if (dealsError) throw dealsError;
        setDeals(dealsData || []);

        // Load site submits associated with this client
        const { data: siteSubmitsData, error: siteSubmitsError } = await supabase
          .from('site_submit')
          .select(`
            *,
            property!property_id (
              property_name,
              address
            ),
            property_unit (
              property_unit_name
            )
          `)
          .eq('client_id', clientId)
          .order('created_at', { ascending: false });

        if (siteSubmitsError) throw siteSubmitsError;
        setSiteSubmits(siteSubmitsData || []);

      } catch (err) {
        console.error('Error loading client sidebar data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [clientId]);

  // Update smart defaults when data changes
  useEffect(() => {
    if (!loading) {
      setExpandedSidebarModules(prev => {
        const defaults = getSmartDefaults();
        const saved = localStorage.getItem(`expandedClientSidebarModules_${clientId}`);
        return saved ? JSON.parse(saved) : defaults;
      });
    }
  }, [contacts.length, notes.length, deals.length, siteSubmits.length, loading, clientId]);

  const toggleSidebarModule = (module: keyof typeof expandedSidebarModules) => {
    const newState = {
      ...expandedSidebarModules,
      [module]: !expandedSidebarModules[module]
    };
    setExpandedSidebarModules(newState);
    localStorage.setItem(`expandedClientSidebarModules_${clientId}`, JSON.stringify(newState));
  };

  const toggleContact = (contactId: string) => {
    const newState = {
      ...expandedContacts,
      [contactId]: !expandedContacts[contactId]
    };
    setExpandedContacts(newState);
    localStorage.setItem(`expandedClientContacts_${clientId}`, JSON.stringify(newState));
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
            <h3 className="text-sm font-medium text-gray-700">Client Info</h3>
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
                {[...Array(4)].map((_, i) => (
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
                      onClick={onContactClick}
                    />
                  ))}
                </SidebarModule>

                {/* Notes */}
                <SidebarModule
                  title="Notes"
                  count={notes.length}
                  onAddNew={() => {
                    setEditingNoteId(null);
                    setShowNoteModal(true);
                  }}
                  isExpanded={expandedSidebarModules.notes}
                  onToggle={() => toggleSidebarModule('notes')}
                  icon="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  isEmpty={notes.length === 0}
                  showAddButton={true}
                >
                  {notes.map(note => (
                    <NoteItem
                      key={note.id}
                      note={note}
                      onClick={(noteId) => {
                        setEditingNoteId(noteId);
                        setShowNoteModal(true);
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
                  showAddButton={false}
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
              </>
            )}
          </div>
        )}
      </div>

      {/* Contact Form Modal */}
      <ContactFormModal
        isOpen={showContactModal}
        onClose={() => {
          setShowContactModal(false);
          setEditingContactId(null);
          onContactModalChange?.(false);
        }}
        contactId={editingContactId}
        clientId={clientId}
        onSave={(newContact) => {
          setContacts(prev => [newContact, ...prev]);
          setShowContactModal(false);
          onContactModalChange?.(false);
        }}
        onUpdate={(updatedContact) => {
          setContacts(prev =>
            prev.map(contact => contact.id === updatedContact.id ? updatedContact : contact)
          );
          setShowContactModal(false);
          onContactModalChange?.(false);
        }}
      />

      {/* Site Submit Form Modal */}
      <SiteSubmitFormModal
        isOpen={showSiteSubmitModal}
        onClose={() => {
          setShowSiteSubmitModal(false);
          setEditingSiteSubmitId(null);
          onSiteSubmitModalChange?.(false);
        }}
        siteSubmitId={editingSiteSubmitId}
        clientId={clientId}
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

      {/* Note Form Modal */}
      <NoteFormModal
        isOpen={showNoteModal}
        onClose={() => {
          setShowNoteModal(false);
          setEditingNoteId(null);
        }}
        noteId={editingNoteId}
        clientId={clientId}
        onSave={(newNote) => {
          setNotes(prev => [newNote, ...prev]);
          setShowNoteModal(false);
        }}
        onUpdate={(updatedNote) => {
          setNotes(prev =>
            prev.map(note => note.id === updatedNote.id ? updatedNote : note)
          );
          setShowNoteModal(false);
        }}
      />
    </>
  );
};

export default ClientSidebar;