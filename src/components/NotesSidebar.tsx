import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { prepareInsert, prepareUpdate } from '../lib/supabaseHelpers';
import { Database } from '../../database-schema';

type Note = Database['public']['Tables']['note']['Row'];
type NoteObjectLink = Database['public']['Tables']['note_object_link']['Row'];

interface NotesSidebarProps {
  selectedNoteId?: string;
  isMinimized?: boolean;
  onMinimize?: () => void;
  onNoteSelect?: (noteId: string) => void;
  onAssociationChange?: () => void;
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
        {icon && <span className="text-lg">{icon}</span>}
        <span className="font-medium text-gray-700">{title}</span>
        <span className="ml-auto bg-blue-100 text-blue-800 text-xs font-medium px-2 py-1 rounded-full">
          {count}
        </span>
      </button>
      <button
        onClick={onAddNew}
        className="ml-2 text-blue-600 hover:text-blue-800 text-sm font-medium hover:bg-blue-50 px-2 py-1 rounded transition-colors"
        title={`Add new ${title.toLowerCase()}`}
      >
        + Add
      </button>
    </div>
    {isExpanded && (
      <div className="p-3">
        {children}
      </div>
    )}
  </div>
);

const NotesSidebar: React.FC<NotesSidebarProps> = ({
  selectedNoteId,
  isMinimized = false,
  onMinimize,
  onNoteSelect,
  onAssociationChange
}) => {
  const [note, setNote] = useState<Note | null>(null);
  const [associations, setAssociations] = useState<NoteObjectLink[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddAssociation, setShowAddAssociation] = useState(false);
  const [newAssociationType, setNewAssociationType] = useState<string>('');
  const [expandedSidebarModules, setExpandedSidebarModules] = useState({
    associations: true,
    addNew: false
  });

  const toggleSidebarModule = (module: keyof typeof expandedSidebarModules) => {
    setExpandedSidebarModules({
      ...expandedSidebarModules,
      [module]: !expandedSidebarModules[module]
    });
  };

  useEffect(() => {
    if (selectedNoteId) {
      loadNoteData();
    } else {
      setNote(null);
      setAssociations([]);
    }
  }, [selectedNoteId]);

  useEffect(() => {
    loadReferenceData();
  }, []);

  const loadNoteData = async () => {
    if (!selectedNoteId) return;

    setLoading(true);
    setError(null);

    try {
      // Load note details
      const { data: noteData, error: noteError } = await supabase
        .from('note')
        .select('*')
        .eq('id', selectedNoteId)
        .single();

      if (noteError) throw noteError;

      // Load associations
      const { data: associationsData, error: associationsError } = await supabase
        .from('note_object_link')
        .select('*')
        .eq('note_id', selectedNoteId);

      if (associationsError) throw associationsError;

      setNote(noteData);
      setAssociations(associationsData || []);
    } catch (err) {
      console.error('Error loading note data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load note data');
    } finally {
      setLoading(false);
    }
  };

  const loadReferenceData = async () => {
    try {
      // Load all reference data in parallel
      const [clientsRes, dealsRes, contactsRes, propertiesRes] = await Promise.all([
        supabase.from('client').select('id, client_name').limit(100),
        supabase.from('deal').select('id, deal_name').limit(100),
        supabase.from('contact').select('id, first_name, last_name').limit(100),
        supabase.from('property').select('id, property_name, address').limit(100)
      ]);

      setClients(clientsRes.data || []);
      setDeals(dealsRes.data || []);
      setContacts(contactsRes.data || []);
      setProperties(propertiesRes.data || []);
    } catch (err) {
      console.error('Error loading reference data:', err);
    }
  };

  const addAssociation = async (objectType: string, objectId: string) => {
    if (!selectedNoteId) return;

    try {
      const associationData = {
        note_id: selectedNoteId,
        sf_content_document_link_id: `manual_${Date.now()}`, // Manual association
        object_type: objectType,
        object_id: objectId,
        [`${objectType}_id`]: objectId
      };

      const { data, error } = await supabase
        .from('note_object_link')
        .insert(prepareInsert([associationData]))
        .select()
        .single();

      if (error) throw error;

      setAssociations([...associations, data]);
      setShowAddAssociation(false);
      setNewAssociationType('');

      if (onAssociationChange) {
        onAssociationChange();
      }
    } catch (err) {
      console.error('Error adding association:', err);
      setError(err instanceof Error ? err.message : 'Failed to add association');
    }
  };

  const removeAssociation = async (associationId: string) => {
    try {
      const { error } = await supabase
        .from('note_object_link')
        .delete()
        .eq('id', associationId);

      if (error) throw error;

      setAssociations(associations.filter(a => a.id !== associationId));

      if (onAssociationChange) {
        onAssociationChange();
      }
    } catch (err) {
      console.error('Error removing association:', err);
      setError(err instanceof Error ? err.message : 'Failed to remove association');
    }
  };

  const getObjectName = (association: NoteObjectLink) => {
    switch (association.object_type) {
      case 'client':
        const client = clients.find(c => c.id === association.client_id);
        return client?.client_name || 'Unknown Client';
      case 'deal':
        const deal = deals.find(d => d.id === association.deal_id);
        return deal?.deal_name || 'Unknown Deal';
      case 'contact':
        const contact = contacts.find(c => c.id === association.contact_id);
        return contact ? `${contact.first_name} ${contact.last_name}` : 'Unknown Contact';
      case 'property':
        const property = properties.find(p => p.id === association.property_id);
        return property?.property_name || property?.address || 'Unknown Property';
      default:
        return `${association.object_type} (${association.object_id})`;
    }
  };

  const getObjectIcon = (objectType: string) => {
    switch (objectType) {
      case 'client': return '🏢';
      case 'deal': return '🤝';
      case 'contact': return '👤';
      case 'property': return '🏠';
      case 'assignment': return '📋';
      case 'site_submit': return '📝';
      case 'user': return '👨‍💼';
      default: return '📎';
    }
  };

  if (!selectedNoteId) {
    return (
      <div className={`fixed right-0 top-0 h-full bg-gray-50 border-l border-gray-200 transition-all duration-300 z-40 ${
        isMinimized ? 'w-12' : 'w-96'
      }`}>
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
            <h2 className={`font-semibold text-gray-900 ${isMinimized ? 'hidden' : ''}`}>
              Note Details
            </h2>
            <button
              onClick={onMinimize}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d={isMinimized ? "M15 19l-7-7 7-7" : "M9 5l7 7-7 7"} />
              </svg>
            </button>
          </div>

          {!isMinimized && (
            <div className="flex-1 p-4">
              <div className="text-center text-gray-500 mt-8">
                <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-sm">Select a note to view its associations</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`fixed right-0 top-0 h-full bg-gray-50 border-l border-gray-200 transition-all duration-300 z-40 ${
      isMinimized ? 'w-12' : 'w-96'
    }`}>
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
          <h2 className={`font-semibold text-gray-900 ${isMinimized ? 'hidden' : ''}`}>
            Note Details
          </h2>
          <button
            onClick={onMinimize}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d={isMinimized ? "M15 19l-7-7 7-7" : "M9 5l7 7-7 7"} />
            </svg>
          </button>
        </div>

        {!isMinimized && (
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="space-y-3">
                <div className="animate-pulse bg-white border border-gray-200 rounded-lg p-4">
                  <div className="h-4 bg-gray-200 rounded mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded"></div>
                </div>
              </div>
            ) : error ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            ) : note ? (
              <>
                {/* Note Info */}
                <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
                  <h3 className="font-medium text-gray-900 mb-2">
                    {note.title || 'Untitled Note'}
                  </h3>
                  <p className="text-sm text-gray-600 line-clamp-3">
                    {note.body || 'No content'}
                  </p>
                </div>

                {/* Current Associations */}
                <SidebarModule
                  title="Associated Objects"
                  count={associations.length}
                  onAddNew={() => {
                    setShowAddAssociation(true);
                    setExpandedSidebarModules(prev => ({ ...prev, addNew: true }));
                  }}
                  isExpanded={expandedSidebarModules.associations}
                  onToggle={() => toggleSidebarModule('associations')}
                  icon="🔗"
                  isEmpty={associations.length === 0}
                >
                  {associations.length === 0 ? (
                    <p className="text-sm text-gray-500">No associations found</p>
                  ) : (
                    <div className="space-y-2">
                      {associations.map((association) => (
                        <div key={association.id} className="flex items-center justify-between p-2 bg-gray-50 rounded border">
                          <div className="flex items-center space-x-2">
                            <span>{getObjectIcon(association.object_type)}</span>
                            <div>
                              <p className="text-sm font-medium text-gray-900">
                                {getObjectName(association)}
                              </p>
                              <p className="text-xs text-gray-500 capitalize">
                                {association.object_type}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => removeAssociation(association.id)}
                            className="text-red-500 hover:text-red-700 text-sm"
                            title="Remove association"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </SidebarModule>

                {/* Add New Association */}
                {showAddAssociation && (
                  <SidebarModule
                    title="Add Association"
                    count={0}
                    onAddNew={() => setShowAddAssociation(false)}
                    isExpanded={expandedSidebarModules.addNew}
                    onToggle={() => toggleSidebarModule('addNew')}
                    icon="➕"
                  >
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Object Type
                        </label>
                        <select
                          value={newAssociationType}
                          onChange={(e) => setNewAssociationType(e.target.value)}
                          className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                        >
                          <option value="">Select type...</option>
                          <option value="client">Client</option>
                          <option value="deal">Deal</option>
                          <option value="contact">Contact</option>
                          <option value="property">Property</option>
                        </select>
                      </div>

                      {newAssociationType && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Select {newAssociationType}
                          </label>
                          <select
                            onChange={(e) => {
                              if (e.target.value) {
                                addAssociation(newAssociationType, e.target.value);
                              }
                            }}
                            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                          >
                            <option value="">Choose {newAssociationType}...</option>
                            {newAssociationType === 'client' && clients.map(client => (
                              <option key={client.id} value={client.id}>
                                {client.client_name}
                              </option>
                            ))}
                            {newAssociationType === 'deal' && deals.map(deal => (
                              <option key={deal.id} value={deal.id}>
                                {deal.deal_name}
                              </option>
                            ))}
                            {newAssociationType === 'contact' && contacts.map(contact => (
                              <option key={contact.id} value={contact.id}>
                                {contact.first_name} {contact.last_name}
                              </option>
                            ))}
                            {newAssociationType === 'property' && properties.map(property => (
                              <option key={property.id} value={property.id}>
                                {property.property_name || property.address}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <button
                        onClick={() => setShowAddAssociation(false)}
                        className="w-full bg-gray-100 text-gray-600 px-3 py-2 rounded text-sm hover:bg-gray-200 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </SidebarModule>
                )}
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};

export default NotesSidebar;
