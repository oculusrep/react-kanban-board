import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Database } from '../../database-schema';
import EntityAutocomplete from './EntityAutocomplete';

type NoteObjectLink = Database['public']['Tables']['note_object_link']['Row'];

interface NoteAssociationsProps {
  noteId: string;
  currentAssociations?: {
    client_id?: string;
    deal_id?: string;
    contact_id?: string;
    property_id?: string;
    assignment_id?: string;
    site_submit_id?: string;
    user_id?: string;
  };
  onAssociationChange?: (updatedAssociations: {
    client_id?: string | null;
    deal_id?: string | null;
    contact_id?: string | null;
    property_id?: string | null;
    assignment_id?: string | null;
    site_submit_id?: string | null;
    user_id?: string | null;
  }) => void;
}

const NoteAssociations: React.FC<NoteAssociationsProps> = ({
  noteId,
  currentAssociations = {},
  onAssociationChange
}) => {
  const [associations, setAssociations] = useState<NoteObjectLink[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newAssociationType, setNewAssociationType] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // If we have current associations passed in, use those first
    if (currentAssociations) {
      const quickAssociations: any[] = [];

      // Convert current associations to association objects
      Object.entries(currentAssociations).forEach(([key, value]) => {
        if (value) {
          const objectType = key.replace('_id', '');
          quickAssociations.push({
            id: `temp_${objectType}_${value}`,
            note_id: noteId,
            object_type: objectType,
            object_id: value,
            [`${objectType}_id`]: value
          });
        }
      });

      setAssociations(quickAssociations);
    }

    // Also load from database for complete data
    loadAssociations();
  }, [noteId, currentAssociations]);

  const loadAssociations = async () => {
    try {
      const { data, error } = await supabase
        .from('note_object_link')
        .select('*')
        .eq('note_id', noteId);

      if (error) throw error;
      setAssociations(data || []);
    } catch (err) {
      console.error('Error loading associations:', err);
    }
  };


  const addAssociation = async (objectType: string, objectId: string) => {
    setLoading(true);
    try {
      const associationData = {
        note_id: noteId,
        sf_content_document_link_id: `manual_${Date.now()}_${objectType}_${objectId}`,
        object_type: objectType,
        object_id: objectId,
        [`${objectType}_id`]: objectId
      };

      const { data, error } = await supabase
        .from('note_object_link')
        .insert([associationData])
        .select()
        .single();

      if (error) throw error;

      const newAssociations = [...associations, data];
      setAssociations(newAssociations);
      setShowAddForm(false);
      setNewAssociationType('');

      if (onAssociationChange) {
        // Convert associations to the format expected by the parent
        const updatedAssociations = {
          client_id: newAssociations.find(a => a.object_type === 'client')?.client_id || null,
          deal_id: newAssociations.find(a => a.object_type === 'deal')?.deal_id || null,
          contact_id: newAssociations.find(a => a.object_type === 'contact')?.contact_id || null,
          property_id: newAssociations.find(a => a.object_type === 'property')?.property_id || null,
          assignment_id: newAssociations.find(a => a.object_type === 'assignment')?.assignment_id || null,
          site_submit_id: newAssociations.find(a => a.object_type === 'site_submit')?.site_submit_id || null,
          user_id: newAssociations.find(a => a.object_type === 'user')?.user_id || null,
        };
        onAssociationChange(updatedAssociations);
      }
    } catch (err) {
      console.error('Error adding association:', err);
    } finally {
      setLoading(false);
    }
  };

  const removeAssociation = async (associationId: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('note_object_link')
        .delete()
        .eq('id', associationId);

      if (error) throw error;

      const newAssociations = associations.filter(a => a.id !== associationId);
      setAssociations(newAssociations);

      if (onAssociationChange) {
        // Convert associations to the format expected by the parent
        const updatedAssociations = {
          client_id: newAssociations.find(a => a.object_type === 'client')?.client_id || null,
          deal_id: newAssociations.find(a => a.object_type === 'deal')?.deal_id || null,
          contact_id: newAssociations.find(a => a.object_type === 'contact')?.contact_id || null,
          property_id: newAssociations.find(a => a.object_type === 'property')?.property_id || null,
          assignment_id: newAssociations.find(a => a.object_type === 'assignment')?.assignment_id || null,
          site_submit_id: newAssociations.find(a => a.object_type === 'site_submit')?.site_submit_id || null,
          user_id: newAssociations.find(a => a.object_type === 'user')?.user_id || null,
        };
        onAssociationChange(updatedAssociations);
      }
    } catch (err) {
      console.error('Error removing association:', err);
    } finally {
      setLoading(false);
    }
  };

  // We'll load the object names on demand for display
  const [objectNames, setObjectNames] = useState<Record<string, string>>({});

  // Load object names for display
  useEffect(() => {
    const loadObjectNames = async () => {
      const namesToLoad: Record<string, string> = {};

      for (const association of associations) {
        const key = `${association.object_type}_${association.object_id}`;
        if (!objectNames[key]) {
          try {
            // Skip invalid or unsupported object types
            if (!association.object_type ||
                !['client', 'deal', 'contact', 'property', 'assignment', 'user'].includes(association.object_type)) {
              namesToLoad[key] = `${association.object_type || 'Unknown'} (${association.object_id})`;
              continue;
            }

            let nameField = '';
            switch (association.object_type) {
              case 'client':
                nameField = 'client_name';
                break;
              case 'deal':
                nameField = 'deal_name';
                break;
              case 'contact':
                nameField = 'first_name, last_name, source_type';
                break;
              case 'property':
                nameField = 'property_name, address';
                break;
              case 'assignment':
                nameField = 'assignment_name';
                break;
              case 'user':
                nameField = 'first_name, last_name, email';
                break;
            }

            const { data } = await supabase
              .from(association.object_type)
              .select(`id, ${nameField}`)
              .eq('id', association.object_id)
              .single();

            if (data) {
              let displayName = '';
              switch (association.object_type) {
                case 'client':
                  displayName = data.client_name || 'Unknown Client';
                  break;
                case 'deal':
                  displayName = data.deal_name || 'Unknown Deal';
                  break;
                case 'contact':
                  const contactName = `${data.first_name || ''} ${data.last_name || ''}`.trim() || 'Unknown Contact';
                  const leadLabel = data.source_type === 'Lead' ? ' (Lead)' : '';
                  displayName = contactName + leadLabel;
                  break;
                case 'property':
                  displayName = data.property_name || data.address || 'Unknown Property';
                  break;
                case 'assignment':
                  displayName = data.assignment_name || 'Unknown Assignment';
                  break;
                case 'user':
                  const userName = `${data.first_name || ''} ${data.last_name || ''}`.trim();
                  displayName = userName || data.email || 'Unknown User';
                  break;
              }
              namesToLoad[key] = displayName;
            } else {
              namesToLoad[key] = `Unknown ${association.object_type}`;
            }
          } catch (err) {
            console.error(`Error loading ${association.object_type} name:`, err);
            namesToLoad[key] = `Unknown ${association.object_type}`;
          }
        }
      }

      if (Object.keys(namesToLoad).length > 0) {
        setObjectNames(prev => ({ ...prev, ...namesToLoad }));
      }
    };

    if (associations.length > 0) {
      loadObjectNames();
    }
  }, [associations]);

  const getObjectName = (association: NoteObjectLink) => {
    const key = `${association.object_type}_${association.object_id}`;
    return objectNames[key] || `Loading ${association.object_type}...`;
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

  const getTagColor = (objectType: string) => {
    switch (objectType) {
      case 'client': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'deal': return 'bg-green-100 text-green-800 border-green-200';
      case 'contact': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'property': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'assignment': return 'bg-pink-100 text-pink-800 border-pink-200';
      case 'site_submit': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'user': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="space-y-3">
      {/* Current Associations */}
      {associations.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {associations.map((association) => (
            <div
              key={association.id}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getTagColor(association.object_type)}`}
            >
              <span>{getObjectIcon(association.object_type)}</span>
              <span className="max-w-24 truncate">{getObjectName(association)}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeAssociation(association.id);
                }}
                className="ml-1 hover:bg-black/10 rounded-full w-4 h-4 flex items-center justify-center"
                disabled={loading}
                title="Remove association"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add Association Form */}
      {showAddForm ? (
        <div className="bg-gray-50 rounded-lg p-3 space-y-2 border">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-gray-700">Add Association</h4>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowAddForm(false);
                setNewAssociationType('');
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </div>

          <div className="space-y-2">
            <select
              value={newAssociationType}
              onChange={(e) => setNewAssociationType(e.target.value)}
              className="w-full text-xs border border-gray-300 rounded px-2 py-1"
              onClick={(e) => e.stopPropagation()}
            >
              <option value="">Select type...</option>
              <option value="client">Client</option>
              <option value="deal">Deal</option>
              <option value="contact">Contact</option>
              <option value="property">Property</option>
              <option value="assignment">Assignment</option>
              <option value="user">User</option>
            </select>

            {newAssociationType && (
              <EntityAutocomplete
                entityType={newAssociationType as 'client' | 'deal' | 'contact' | 'property' | 'assignment' | 'user'}
                value={null}
                onChange={(id, name) => {
                  if (id) {
                    addAssociation(newAssociationType, id);
                  }
                }}
                placeholder={`Search ${newAssociationType}...`}
                className="w-full text-xs border border-gray-300 rounded px-2 py-1"
              />
            )}
          </div>
        </div>
      ) : (
        /* Add Association Button */
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowAddForm(true);
          }}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded border border-dashed border-blue-300 transition-colors"
          disabled={loading}
        >
          <span>+</span>
          <span>Add Association</span>
        </button>
      )}
    </div>
  );
};

export default NoteAssociations;