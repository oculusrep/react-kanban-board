import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Database } from '../../database-schema';
import RichTextNote from './RichTextNote';
import FileManagerModule from './sidebar/FileManagerModule';

type Note = Database['public']['Tables']['note']['Row'];
type Property = Database['public']['Tables']['property']['Row'];
type Deal = Database['public']['Tables']['deal']['Row'];

interface ContactSidebarProps {
  contactId: string;
  isMinimized?: boolean;
  onMinimize?: () => void;
  onPropertyClick?: (propertyId: string) => void;
  onDealClick?: (dealId: string) => void;
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

const ContactSidebar: React.FC<ContactSidebarProps> = ({
  contactId,
  isMinimized = false,
  onMinimize,
  onPropertyClick,
  onDealClick
}) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Expansion states
  const getSmartDefaults = () => ({
    notes: notes.length > 0,
    properties: properties.length > 0,
    deals: deals.length > 0,
    files: true  // Files expanded by default
  });

  const [expandedSidebarModules, setExpandedSidebarModules] = useState(() => {
    const saved = localStorage.getItem(`expandedContactSidebarModules_${contactId}`);
    return saved ? JSON.parse(saved) : getSmartDefaults();
  });

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

  // Update smart defaults when data changes
  useEffect(() => {
    if (!loading) {
      setExpandedSidebarModules(prev => {
        const defaults = getSmartDefaults();
        const saved = localStorage.getItem(`expandedContactSidebarModules_${contactId}`);
        return saved ? JSON.parse(saved) : defaults;
      });
    }
  }, [notes.length, properties.length, deals.length, loading, contactId]);

  const toggleSidebarModule = (module: keyof typeof expandedSidebarModules) => {
    const newState = {
      ...expandedSidebarModules,
      [module]: !expandedSidebarModules[module]
    };
    setExpandedSidebarModules(newState);
    localStorage.setItem(`expandedContactSidebarModules_${contactId}`, JSON.stringify(newState));
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
              {/* Associated Notes */}
              <SidebarModule
                title="Associated Notes"
                count={notes.length}
                onAddNew={() => console.log('Add new note')}
                isExpanded={expandedSidebarModules.notes}
                onToggle={() => toggleSidebarModule('notes')}
                icon="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                isEmpty={notes.length === 0}
                showAddButton={false}
              >
                {notes.map(note => (
                  <NoteItem
                    key={note.id}
                    note={note}
                    onClick={() => console.log('Navigate to note', note.id)}
                  />
                ))}
              </SidebarModule>

              {/* Associated Properties */}
              <SidebarModule
                title="Associated Properties"
                count={properties.length}
                onAddNew={() => console.log('Add new property association')}
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

              {/* Associated Deals */}
              <SidebarModule
                title="Associated Deals"
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

              {/* Files */}
              <FileManagerModule
                entityType="contact"
                entityId={contactId}
                isExpanded={expandedSidebarModules.files}
                onToggle={() => toggleSidebarModule('files')}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ContactSidebar;