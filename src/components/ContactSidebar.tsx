import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Database } from '../../database-schema';
import RichTextNote from './RichTextNote';
import FileManagerModule from './sidebar/FileManagerModule';
import { useContactClients } from '../hooks/useContactClients';
import AddClientRelationModal from './AddClientRelationModal';
import RoleSelector from './RoleSelector';
import Toast from './Toast';
import { useToast } from '../hooks/useToast';
import NoteFormModal from './NoteFormModal';
import ContactRolesManager from './ContactRolesManager';

type Note = Database['public']['Tables']['note']['Row'];
type Property = Database['public']['Tables']['property']['Row'];
type Deal = Database['public']['Tables']['deal']['Row'];
type Client = Database['public']['Tables']['client']['Row'];

interface ContactSidebarProps {
  contactId: string;
  isMinimized?: boolean;
  onMinimize?: () => void;
  onPropertyClick?: (propertyId: string) => void;
  onDealClick?: (dealId: string) => void;
  onClientClick?: (clientId: string) => void;
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

// Note Item Component
interface NoteItemProps {
  note: Note;
  onClick?: (noteId: string) => void;
  onDelete?: (noteId: string) => void;
}

const NoteItem: React.FC<NoteItemProps> = ({ note, onClick, onDelete }) => (
  <div className="p-3 hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-b-0 group">
    <div className="flex items-start justify-between">
      <div
        className="flex-1 min-w-0 cursor-pointer"
        onClick={() => onClick?.(note.id)}
      >
        <div className="flex items-center space-x-2 mb-1">
          <p className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-900">
            {note.title || 'Untitled Note'}
          </p>
          <svg className="w-3 h-3 text-gray-400 group-hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </div>
        <div className="text-xs text-gray-500">
          {note.created_at && new Date(note.created_at).toLocaleDateString()}
        </div>
      </div>
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(note.id);
          }}
          className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors opacity-0 group-hover:opacity-100"
          title="Delete note"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      )}
    </div>
  </div>
);

// Property Item Component
interface PropertyItemProps {
  property: Property;
  onClick?: (propertyId: string) => void;
}

const PropertyItem: React.FC<PropertyItemProps> = ({ property, onClick }) => (
  <div
    className="p-2 hover:bg-green-50 cursor-pointer transition-colors border-b border-gray-100 last:border-b-0 group"
    onClick={() => onClick?.(property.id)}
  >
    <div className="flex items-center justify-between">
      <div className="flex-1 min-w-0">
        <div className="flex items-center space-x-2">
          <p className="text-sm font-medium text-gray-900 truncate group-hover:text-green-900">
            {property.property_name || property.address || 'Unnamed Property'}
          </p>
          <svg className="w-3 h-3 text-gray-400 group-hover:text-green-600 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </div>
        <div className="flex items-center justify-between mt-1">
          <p className="text-xs text-green-600 font-medium">
            {property.city}, {property.state}
          </p>
          {property.zip_code && (
            <p className="text-xs text-gray-500 font-medium">
              {property.zip_code}
            </p>
          )}
        </div>
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
            {(deal as any).client?.client_name || 'No client'}
          </p>
        </div>
      </div>
    </div>
  </div>
);

// Client Item Component
interface ClientItemProps {
  client: Client;
  role?: string | null;
  isPrimary: boolean;
  onClick?: (clientId: string) => void;
  onRemove?: () => void;
  onTogglePrimary?: () => void;
  onRoleChange?: (role: string | null) => Promise<void>;
}

const ClientItem: React.FC<ClientItemProps> = ({ client, role, isPrimary, onClick, onRemove, onTogglePrimary, onRoleChange }) => (
  <div className="p-3 hover:bg-orange-50 cursor-pointer transition-colors group">
    <div className="flex items-start justify-between">
      <div
        className="flex-1 min-w-0"
        onClick={() => onClick?.(client.id)}
      >
        <div className="flex items-center space-x-2 mb-1">
          <p className="text-sm font-medium text-gray-900 truncate group-hover:text-orange-900">
            {client.client_name || 'Unnamed Client'}
          </p>
          <svg className="w-3 h-3 text-gray-400 group-hover:text-orange-600 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </div>
        <div className="flex items-center space-x-2 text-xs text-gray-500">
          {client.sf_client_type && (
            <span>{client.sf_client_type}</span>
          )}
          {client.industry && (
            <span>• {client.industry}</span>
          )}
        </div>
      </div>
      <div className="flex items-center space-x-1 ml-2">
        {onTogglePrimary && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTogglePrimary();
            }}
            className={`p-1 rounded transition-colors ${
              isPrimary
                ? 'text-orange-500 hover:text-orange-600 hover:bg-orange-50'
                : 'text-gray-400 hover:text-orange-500 hover:bg-orange-50'
            }`}
            title={isPrimary ? "Remove as primary client" : "Set as primary client"}
          >
            <svg className="w-4 h-4" fill={isPrimary ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </button>
        )}
        {onRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
            title="Remove association"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>
    </div>
  </div>
);

const ContactSidebar: React.FC<ContactSidebarProps> = ({
  contactId,
  isMinimized = false,
  onMinimize,
  onPropertyClick,
  onDealClick,
  onClientClick
}) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use the contact clients hook
  const {
    relations: clientRelations,
    loading: clientsLoading,
    error: clientsError,
    addClientRelation,
    removeClientRelation,
    setPrimaryClient,
    unsetPrimaryClient,
    updateRelationRole
  } = useContactClients(contactId);

  // State for add client modal
  const [showAddClientModal, setShowAddClientModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  // Toast notifications
  const { toast, showToast, hideToast } = useToast();

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // Expansion states - all collapsed by default
  const [expandedSidebarModules, setExpandedSidebarModules] = useState({
    notes: false,
    deals: false,
    properties: false,
    clients: false,
    files: false
  });

  // Reset expansion states when contactId changes
  useEffect(() => {
    setExpandedSidebarModules({
      notes: false,
      deals: false,
      properties: false,
      clients: false,
      files: false
    });
  }, [contactId]);

  // Load real data
  useEffect(() => {
    if (!contactId) return;

    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Load notes associated with this contact
        const { data: noteAssociations, error: notesError } = await supabase
          .from('note_object_link')
          .select(`
            note_id,
            note!note_object_link_note_id_fkey (*)
          `)
          .eq('object_type', 'contact')
          .eq('object_id', contactId);

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

        // Load properties associated with this contact
        const { data: propertyContacts, error: propertiesError } = await supabase
          .from('property_contact')
          .select(`
            property_id,
            property!property_contact_property_id_fkey (*)
          `)
          .eq('contact_id', contactId);

        if (propertiesError) throw propertiesError;

        const propertiesData: Property[] = [];
        if (propertyContacts) {
          propertyContacts.forEach((pc: any) => {
            if (pc.property) {
              propertiesData.push(pc.property);
            }
          });
        }

        setProperties(propertiesData);

        // Load deals associated with this contact
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
          .eq('contact_id', contactId)
          .order('created_at', { ascending: false });

        if (dealsError) throw dealsError;
        setDeals(dealsData || []);

      } catch (err) {
        console.error('Error loading contact sidebar data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [contactId]);


  const toggleSidebarModule = (module: keyof typeof expandedSidebarModules) => {
    setExpandedSidebarModules({
      ...expandedSidebarModules,
      [module]: !expandedSidebarModules[module]
    });
  };

  const handleDeleteNote = async (noteId: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Note',
      message: 'Are you sure you want to delete this note? This action cannot be undone.',
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('note')
            .delete()
            .eq('id', noteId);

          if (error) throw error;

          setNotes(prev => prev.filter(note => note.id !== noteId));
          showToast('Note deleted successfully', { type: 'success' });
        } catch (err) {
          console.error('Error deleting note:', err);
          showToast('Failed to delete note', { type: 'error' });
        } finally {
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  return (
    <div
      className={`fixed right-0 top-0 h-full bg-white border-l border-gray-200 shadow-xl transition-all duration-300 ${
        isMinimized ? 'w-12' : 'w-[500px]'
      } z-40 ${isMinimized ? 'overflow-hidden' : 'overflow-y-auto'}`}
      style={{ top: '180px', height: 'calc(100vh - 180px)' }}
    >
      {/* Header with minimize/expand controls */}
      <div className={`flex items-center ${isMinimized ? 'justify-center' : 'justify-between'} p-2 border-b border-gray-200 bg-gray-50`}>
        {!isMinimized && (
          <h3 className="text-sm font-medium text-gray-700">Contact Info</h3>
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
              {/* Associated Clients */}
              <SidebarModule
                title="Associated Clients"
                count={clientRelations.length}
                onAddNew={() => setShowAddClientModal(true)}
                isExpanded={expandedSidebarModules.clients}
                onToggle={() => toggleSidebarModule('clients')}
                icon="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                isEmpty={clientRelations.length === 0}
                showAddButton={true}
              >
                {clientRelations.map(relation => (
                  <div key={relation.id} className="border-b border-gray-100 last:border-b-0">
                    <ClientItem
                      client={relation.client!}
                      role={relation.role}
                      isPrimary={relation.is_primary}
                      onClick={onClientClick}
                      onRemove={async () => {
                        try {
                          await removeClientRelation(relation.id);
                        } catch (err) {
                          console.error('Error removing client association:', err);
                        }
                      }}
                      onTogglePrimary={async () => {
                        try {
                          if (relation.is_primary) {
                            await unsetPrimaryClient(relation.id);
                            showToast('Primary client removed', { type: 'success' });
                          } else {
                            await setPrimaryClient(relation.id);
                            showToast('Primary client set', { type: 'success' });
                          }
                        } catch (err) {
                          showToast('Failed to update primary client', { type: 'error' });
                        }
                      }}
                    />
                    {/* New Contact Roles Manager */}
                    <div className="px-3 pb-2">
                      <ContactRolesManager
                        contactId={contactId}
                        clientId={relation.client!.id}
                        contactName="" // Contact name not needed since we're in contact sidebar
                        clientName={relation.client!.client_name || ''}
                        compact={true}
                      />
                    </div>
                  </div>
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

              {/* Properties */}
              <SidebarModule
                title="Properties"
                count={properties.length}
                isExpanded={expandedSidebarModules.properties}
                onToggle={() => toggleSidebarModule('properties')}
                icon="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                isEmpty={properties.length === 0}
                showAddButton={false}
              >
                {properties.map(property => (
                  <PropertyItem
                    key={property.id}
                    property={property}
                    onClick={onPropertyClick}
                  />
                ))}
              </SidebarModule>

              {/* Files */}
              <FileManagerModule
                entityType="contact"
                entityId={contactId}
                isExpanded={expandedSidebarModules.files}
                onToggle={() => toggleSidebarModule('files')}
              />

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
                    onDelete={handleDeleteNote}
                  />
                ))}
              </SidebarModule>
            </>
          )}
        </div>
      )}

      {/* Add Client Relation Modal */}
      <AddClientRelationModal
        isOpen={showAddClientModal}
        onClose={() => setShowAddClientModal(false)}
        onAdd={addClientRelation}
        existingClientIds={clientRelations.map(r => r.client_id)}
        contactId={contactId}
      />

      {/* Note Form Modal */}
      <NoteFormModal
        isOpen={showNoteModal}
        onClose={() => {
          setShowNoteModal(false);
          setEditingNoteId(null);
        }}
        noteId={editingNoteId}
        contactId={contactId}
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

      {/* Confirmation Dialog */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {confirmDialog.title}
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              {confirmDialog.message}
            </p>
            <div className="flex items-center justify-end space-x-3">
              <button
                onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Cancel
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onClose={hideToast}
      />
    </div>
  );
};

export default ContactSidebar;