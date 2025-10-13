import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Database } from '../../database-schema';
import RichTextNote from './RichTextNote';
import ContactFormModal from './ContactFormModal';
import SiteSubmitFormModal from './SiteSubmitFormModal';
import NoteFormModal from './NoteFormModal';
import SidebarModule from './sidebar/SidebarModule';
import FileManagerModule from './sidebar/FileManagerModule';
import { useClientContacts } from '../hooks/useClientContacts';
import AddContactRelationModal from './AddContactRelationModal';
import RoleSelector from './RoleSelector';
import ContactRolesManager from './ContactRolesManager';

type Contact = Database['public']['Tables']['contact']['Row'];
type Note = Database['public']['Tables']['note']['Row'];
type Deal = Database['public']['Tables']['deal']['Row'];
type SiteSubmit = Database['public']['Tables']['site_submit']['Row'];
type Client = Database['public']['Tables']['client']['Row'];

interface ClientSidebarProps {
  clientId: string;
  isMinimized?: boolean;
  onMinimize?: () => void;
  onContactClick?: (contactId: string) => void;
  onDealClick?: (dealId: string) => void;
  onContactModalChange?: (isOpen: boolean) => void;
  onSiteSubmitModalChange?: (isOpen: boolean) => void;
}

// Contact Item Component
interface ContactItemProps {
  contact: Contact;
  isExpanded?: boolean;
  onToggle?: () => void;
  onEdit?: (contactId: string) => void;
  onClick?: (contactId: string) => void;
  onRemove?: (contactId: string) => void;
}

const ContactItem: React.FC<ContactItemProps> = ({
  contact,
  isExpanded = false,
  onToggle,
  onEdit,
  onClick,
  onRemove
}) => {
  const displayPhone = contact.mobile_phone || contact.phone;
  const phoneLabel = contact.mobile_phone ? 'Mobile' : 'Phone';
  const isLead = contact.source_type === 'Lead';

  return (
    <div className="group">
      <div
        className="p-2 hover:bg-gray-50 cursor-pointer transition-colors flex items-center justify-between"
      >
        <div className="flex items-center space-x-3 flex-1 min-w-0" onClick={() => onClick?.(contact.id)}>
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
        <div className="flex items-center space-x-2">
          {/* Trash icon - visible on hover */}
          {onRemove && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm('Remove this contact from the client? The contact will not be deleted, only the association.')) {
                  onRemove(contact.id);
                }
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-50 rounded"
              title="Remove contact from client"
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
          )}
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
  // Use the client contacts hook for many-to-many relationships
  const {
    relations: contactRelations,
    loading: contactsLoading,
    error: contactsError,
    addContactRelation,
    removeContactRelation,
    setPrimaryContact,
    updateRelationRole
  } = useClientContacts(clientId);

  const [client, setClient] = useState<Client | null>(null);
  const [childAccounts, setChildAccounts] = useState<Client[]>([]);
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
  const [showAddContactModal, setShowAddContactModal] = useState(false);

  // Expansion states - all collapsed by default
  const [expandedSidebarModules, setExpandedSidebarModules] = useState({
    contacts: false,
    childAccounts: false,
    notes: false,
    deals: false,
    siteSubmits: false,
    files: false
  });

  const [expandedContacts, setExpandedContacts] = useState<Record<string, boolean>>({});

  // Reset expansion states when clientId changes
  useEffect(() => {
    setExpandedSidebarModules({
      contacts: false,
      childAccounts: false,
      notes: false,
      deals: false,
      siteSubmits: false,
      files: false
    });
    setExpandedContacts({});
  }, [clientId]);

  // Load real data
  useEffect(() => {
    if (!clientId) return;

    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Load client data
        const { data: clientData, error: clientError } = await supabase
          .from('client')
          .select('*')
          .eq('id', clientId)
          .single();

        if (clientError) throw clientError;
        setClient(clientData);

        // Load child accounts (accounts where parent_id = this client)
        const { data: childrenData, error: childrenError } = await supabase
          .from('client')
          .select('*')
          .eq('parent_id', clientId)
          .order('client_name');

        if (childrenError) throw childrenError;
        setChildAccounts(childrenData || []);

        // Contacts are now loaded via useClientContacts hook

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

  const handleRemoveContact = async (contactId: string) => {
    try {
      await removeContactRelation(contactId);
      // The hook will automatically refresh the relations list
    } catch (err) {
      console.error('Error removing contact from client:', err);
      alert('Failed to remove contact from client. Please try again.');
    }
  };


  const toggleSidebarModule = (module: keyof typeof expandedSidebarModules) => {
    setExpandedSidebarModules({
      ...expandedSidebarModules,
      [module]: !expandedSidebarModules[module]
    });
  };

  const toggleContact = (contactId: string) => {
    setExpandedContacts({
      ...expandedContacts,
      [contactId]: !expandedContacts[contactId]
    });
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
                  count={contactRelations.length}
                  onAddNew={() => setShowAddContactModal(true)}
                  isExpanded={expandedSidebarModules.contacts}
                  onToggle={() => toggleSidebarModule('contacts')}
                  icon="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
                  isEmpty={contactRelations.length === 0}
                >
                  {contactRelations.map(relation => {
                    const contact = relation.contact;
                    if (!contact) return null;

                    return (
                      <div key={relation.id} className="border-b border-gray-100 last:border-b-0">
                        <ContactItem
                          contact={contact}
                          isExpanded={expandedContacts[contact.id]}
                          onToggle={() => toggleContact(contact.id)}
                          onEdit={(contactId) => {
                            setEditingContactId(contactId);
                            setShowContactModal(true);
                            onContactModalChange?.(true);
                          }}
                          onClick={onContactClick}
                          onRemove={handleRemoveContact}
                        />
                        <div className="px-2 pb-2 space-y-2">
                          {relation.is_primary && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                              Primary
                            </span>
                          )}
                          {/* Contact Roles Manager */}
                          <ContactRolesManager
                            contactId={contact.id}
                            clientId={clientId}
                            contactName={`${contact.first_name} ${contact.last_name}`}
                            clientName={client?.client_name}
                            compact={true}
                          />
                        </div>
                      </div>
                    );
                  })}
                </SidebarModule>

                {/* Child Accounts */}
                <SidebarModule
                  title="Child Accounts"
                  count={childAccounts.length}
                  isExpanded={expandedSidebarModules.childAccounts}
                  onToggle={() => toggleSidebarModule('childAccounts')}
                  icon="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  isEmpty={childAccounts.length === 0}
                  showAddButton={false}
                >
                  {childAccounts.map(childAccount => (
                    <div
                      key={childAccount.id}
                      className="p-3 hover:bg-orange-50 cursor-pointer transition-colors border-b border-gray-100 last:border-b-0 group"
                      onClick={() => {
                        // Navigate to child account
                        window.location.href = `/client/${childAccount.id}`;
                      }}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 mb-1">
                            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                            <p className="text-sm font-medium text-gray-900 truncate group-hover:text-orange-900">
                              {childAccount.client_name || 'Unnamed Client'}
                            </p>
                            <svg className="w-3 h-3 text-gray-400 group-hover:text-orange-600 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </div>
                          <div className="flex items-center space-x-2 text-xs text-gray-500">
                            {childAccount.sf_client_type && (
                              <span>{childAccount.sf_client_type}</span>
                            )}
                            {childAccount.billing_city && childAccount.billing_state && (
                              <span>• {childAccount.billing_city}, {childAccount.billing_state}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
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

                {/* Files */}
                <FileManagerModule
                  entityType="client"
                  entityId={clientId}
                  isExpanded={expandedSidebarModules.files}
                  onToggle={() => toggleSidebarModule('files')}
                />
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
          // Refresh contact relations after adding new contact
          window.location.reload(); // Temporary - you can improve this with better state management
        }}
        onUpdate={(updatedContact) => {
          // Contact updated, sidebar will refresh automatically via useClientContacts
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

      {/* Add Contact Relation Modal */}
      <AddContactRelationModal
        isOpen={showAddContactModal}
        onClose={() => setShowAddContactModal(false)}
        onAdd={addContactRelation}
        existingContactIds={contactRelations.map(r => r.contact_id)}
        clientId={clientId}
      />
    </>
  );
};

export default ClientSidebar;