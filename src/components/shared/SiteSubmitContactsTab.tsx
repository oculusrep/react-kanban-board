/**
 * SiteSubmitContactsTab - Contacts panel for the shared slideout.
 *
 * Two modes:
 * - Property-only (default, when no dealId): editable property_contact list.
 *   Used on the map for pre-LOI site submits.
 * - Deal context (when dealId is passed): Deal Contacts on top (full add/remove
 *   + role management via contact_deal_role), then Property Contacts below as
 *   read-only context. Contacts on both lists get an "(also property)" tag in
 *   the deal section. Property contacts are owned by the property page in this
 *   mode — edits happen there.
 */

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { prepareInsert } from '../../lib/supabaseHelpers';
import AddContactsModal from '../property/AddContactsModal';
import ContactFormModal from '../ContactFormModal';
import { ContactDealRolesManager } from '../ContactDealRolesManager';

interface Contact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  mobile_phone: string | null;
  title: string | null;
  company: string | null;
}

interface SiteSubmitContactsTabProps {
  propertyId: string | null;
  dealId?: string | null;
  isEditable: boolean;
  onEditContact?: (contactId: string | null, propertyId: string) => void;
}

interface ContactCardProps {
  contact: Contact;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onRemove?: () => void;
  onEdit?: () => void;
  extraHeader?: React.ReactNode;
  extraBody?: React.ReactNode;
  accentColor?: 'blue' | 'green';
  showEditInExpanded?: boolean;
}

function ContactCard({
  contact,
  isExpanded,
  onToggleExpand,
  onRemove,
  onEdit,
  extraHeader,
  extraBody,
  accentColor = 'blue',
  showEditInExpanded = true,
}: ContactCardProps) {
  const displayPhone = contact.mobile_phone || contact.phone;
  const phoneLabel = contact.mobile_phone ? 'Mobile' : 'Phone';
  const accent = accentColor === 'green'
    ? { dot: 'bg-green-400', label: 'text-green-900', sub: 'text-green-800', val: 'text-green-700', edit: 'text-green-600 hover:text-green-800', body: 'bg-green-50 border-green-200', avatar: 'bg-green-500' }
    : { dot: 'bg-blue-400',  label: 'text-blue-900',  sub: 'text-blue-800',  val: 'text-blue-700',  edit: 'text-blue-600 hover:text-blue-800',   body: 'bg-blue-50 border-blue-200',   avatar: 'bg-blue-500'  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="group flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors">
        <div
          className="flex items-center space-x-3 flex-1 min-w-0 cursor-pointer"
          onClick={onToggleExpand}
        >
          <div className={`w-8 h-8 ${accent.avatar} rounded-full flex items-center justify-center flex-shrink-0`}>
            <span className="text-white font-medium text-xs">
              {(contact.first_name?.charAt(0) || '').toUpperCase()}
              {(contact.last_name?.charAt(0) || '').toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2 flex-wrap">
              <span className="text-sm font-medium text-gray-900 truncate">
                {contact.first_name} {contact.last_name}
              </span>
              {extraHeader}
              {displayPhone && (
                <span className="text-xs text-gray-500 truncate">{phoneLabel}: {displayPhone}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {onRemove && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 rounded transition-all"
              title="Remove"
            >
              <svg className="w-4 h-4 text-gray-400 hover:text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
          <div className="cursor-pointer" onClick={onToggleExpand}>
            <svg
              className={`w-3 h-3 text-gray-400 transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}
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
        <div className="px-3 pb-3">
          <div className={`${accent.body} border rounded p-3 text-xs space-y-2`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className={`w-2 h-2 ${accent.dot} rounded-full`}></span>
                <span className={`font-medium ${accent.label}`}>Contact Details</span>
              </div>
              {showEditInExpanded && onEdit && (
                <button
                  onClick={(e) => { e.stopPropagation(); onEdit(); }}
                  className={`${accent.edit} font-medium`}
                  title="Edit contact"
                >
                  Edit
                </button>
              )}
            </div>
            <div className="space-y-1 ml-4">
              {contact.title && (
                <div><span className={`font-medium ${accent.sub}`}>Title:</span> <span className={accent.val}>{contact.title}</span></div>
              )}
              {contact.company && (
                <div><span className={`font-medium ${accent.sub}`}>Company:</span> <span className={accent.val}>{contact.company}</span></div>
              )}
              {contact.email && (
                <div><span className={`font-medium ${accent.sub}`}>Email:</span> <span className={accent.val}>{contact.email}</span></div>
              )}
              {contact.phone && (
                <div><span className={`font-medium ${accent.sub}`}>Phone:</span> <span className={accent.val}>{contact.phone}</span></div>
              )}
              {contact.mobile_phone && (
                <div><span className={`font-medium ${accent.sub}`}>Mobile:</span> <span className={accent.val}>{contact.mobile_phone}</span></div>
              )}
            </div>
            {extraBody}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SiteSubmitContactsTab({
  propertyId,
  dealId,
  isEditable,
  onEditContact,
}: SiteSubmitContactsTabProps) {
  const [propertyContacts, setPropertyContacts] = useState<Contact[]>([]);
  const [dealContacts, setDealContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddDealModal, setShowAddDealModal] = useState(false);
  const [showAddPropertyModal, setShowAddPropertyModal] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const [expandedContactId, setExpandedContactId] = useState<string | null>(null);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  // When deal context is active, property contacts collapse by default into a secondary section
  const [propertySectionOpen, setPropertySectionOpen] = useState(!dealId);

  // Property contacts are read-only when the deal section owns the editing surface
  const dealContextActive = !!dealId;
  const propertyEditable = isEditable && !dealContextActive;

  const loadPropertyContacts = async () => {
    if (!propertyId) {
      setPropertyContacts([]);
      return;
    }
    const { data, error } = await supabase
      .from('property_contact')
      .select(`*, contact!fk_property_contact_contact_id (*)`)
      .eq('property_id', propertyId);

    if (error) {
      console.error('Error loading property contacts:', error);
      return;
    }
    const contacts = (data || []).map((pc: any) => pc.contact).filter(Boolean);
    setPropertyContacts(contacts);
  };

  const loadDealContacts = async () => {
    if (!dealId) {
      setDealContacts([]);
      return;
    }
    const { data, error } = await supabase
      .from('deal_contact')
      .select('contact:contact_id(*)')
      .eq('deal_id', dealId);

    if (error) {
      console.error('Error loading deal contacts:', error);
      return;
    }
    const contacts = (data || []).map((dc: any) => dc.contact).filter(Boolean);
    setDealContacts(contacts);
  };

  const reloadAll = async () => {
    setLoading(true);
    try {
      await Promise.all([loadPropertyContacts(), loadDealContacts()]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reloadAll();
    setPropertySectionOpen(!dealId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, dealId]);

  const propertyContactIds = new Set(propertyContacts.map(c => c.id));

  const handleRemovePropertyContact = async (contactId: string) => {
    if (!propertyId) return;
    if (!confirm('Remove this contact from the property?')) return;
    const { error } = await supabase
      .from('property_contact')
      .delete()
      .eq('property_id', propertyId)
      .eq('contact_id', contactId);
    if (error) {
      console.error('Error removing property contact:', error);
      alert('Failed to remove contact');
      return;
    }
    setPropertyContacts(prev => prev.filter(c => c.id !== contactId));
  };

  const handleRemoveDealContact = async (contactId: string) => {
    if (!dealId) return;
    if (!confirm('Remove this contact from the deal? (Property association is not affected.)')) return;
    const { error } = await supabase
      .from('deal_contact')
      .delete()
      .eq('deal_id', dealId)
      .eq('contact_id', contactId);
    if (error) {
      console.error('Error removing deal contact:', error);
      alert('Failed to remove contact');
      return;
    }
    setDealContacts(prev => prev.filter(c => c.id !== contactId));
  };

  const handleSyncFromProperty = async () => {
    if (!dealId || !propertyId) return;
    setSyncing(true);
    try {
      const existingDealContactIds = new Set(dealContacts.map(c => c.id));
      const newContactIds = propertyContacts
        .map(c => c.id)
        .filter(id => !existingDealContactIds.has(id));

      if (newContactIds.length === 0) {
        setSyncing(false);
        return;
      }

      const rows = newContactIds.map(contact_id => ({
        deal_id: dealId,
        contact_id,
        primary_contact: false,
        role_id: null,
      }));

      const { error } = await supabase
        .from('deal_contact')
        .insert(prepareInsert(rows));

      if (error) throw error;
      await loadDealContacts();
    } catch (err) {
      console.error('Error syncing contacts from property:', err);
      alert('Failed to sync contacts from property');
    } finally {
      setSyncing(false);
    }
  };

  const handleEditContact = (contactId: string) => {
    if (onEditContact && propertyId) {
      onEditContact(contactId, propertyId);
    } else {
      setEditingContactId(contactId);
      setShowContactForm(true);
    }
  };

  if (!propertyId && !dealId) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 p-4">
        <p>No property or deal associated</p>
      </div>
    );
  }

  return (
    <div className="p-4 flex-1 overflow-y-auto space-y-6">
      {/* DEAL CONTACTS — visible when a deal is linked */}
      {dealContextActive && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Deal Contacts</h3>
            {isEditable && (
              <div className="flex items-center gap-2">
                {propertyId && propertyContacts.length > 0 && (
                  <button
                    onClick={handleSyncFromProperty}
                    disabled={syncing}
                    className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    title="Copy all property contacts onto this deal"
                  >
                    {syncing ? 'Syncing…' : 'Sync from Property'}
                  </button>
                )}
                <button
                  onClick={() => setShowAddDealModal(true)}
                  className="text-xs px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 flex items-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add
                </button>
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-6">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-green-600"></div>
            </div>
          ) : dealContacts.length === 0 ? (
            <p className="text-xs text-gray-500 italic">No contacts on this deal yet.</p>
          ) : (
            <div className="space-y-2">
              {dealContacts.map(contact => {
                const isOnProperty = propertyContactIds.has(contact.id);
                return (
                  <ContactCard
                    key={`deal-${contact.id}`}
                    contact={contact}
                    isExpanded={expandedContactId === `deal-${contact.id}`}
                    onToggleExpand={() =>
                      setExpandedContactId(prev =>
                        prev === `deal-${contact.id}` ? null : `deal-${contact.id}`
                      )
                    }
                    onRemove={isEditable ? () => handleRemoveDealContact(contact.id) : undefined}
                    onEdit={isEditable ? () => handleEditContact(contact.id) : undefined}
                    accentColor="green"
                    extraHeader={
                      isOnProperty ? (
                        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200">
                          also property
                        </span>
                      ) : null
                    }
                    extraBody={
                      dealId ? (
                        <div className="pt-2 border-t border-green-200">
                          <ContactDealRolesManager
                            contactId={contact.id}
                            dealId={dealId}
                          />
                        </div>
                      ) : null
                    }
                  />
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* PROPERTY CONTACTS */}
      {propertyId && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => dealContextActive && setPropertySectionOpen(o => !o)}
              className={`flex items-center gap-2 text-sm font-semibold uppercase tracking-wide ${
                dealContextActive ? 'text-gray-600 hover:text-gray-800' : 'text-gray-800 cursor-default'
              }`}
              disabled={!dealContextActive}
            >
              {dealContextActive && (
                <svg
                  className={`w-3 h-3 transform transition-transform ${propertySectionOpen ? 'rotate-90' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              )}
              <span>Property Contacts</span>
              {dealContextActive && (
                <span className="text-[10px] text-gray-400 font-normal normal-case">(read-only — edit on property page)</span>
              )}
            </button>
            {propertyEditable && (
              <button
                onClick={() => setShowAddPropertyModal(true)}
                className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add
              </button>
            )}
          </div>

          {propertySectionOpen && (
            loading ? (
              <div className="flex items-center justify-center py-6">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
              </div>
            ) : propertyContacts.length === 0 ? (
              <p className="text-xs text-gray-500 italic">No contacts associated with this property.</p>
            ) : (
              <div className="space-y-2">
                {propertyContacts.map(contact => (
                  <ContactCard
                    key={`prop-${contact.id}`}
                    contact={contact}
                    isExpanded={expandedContactId === `prop-${contact.id}`}
                    onToggleExpand={() =>
                      setExpandedContactId(prev =>
                        prev === `prop-${contact.id}` ? null : `prop-${contact.id}`
                      )
                    }
                    onRemove={propertyEditable ? () => handleRemovePropertyContact(contact.id) : undefined}
                    onEdit={propertyEditable ? () => handleEditContact(contact.id) : undefined}
                    accentColor="blue"
                    showEditInExpanded={propertyEditable}
                  />
                ))}
              </div>
            )
          )}
        </section>
      )}

      {/* Add Property Contacts Modal */}
      {showAddPropertyModal && propertyId && (
        <AddContactsModal
          isOpen={showAddPropertyModal}
          onClose={() => setShowAddPropertyModal(false)}
          propertyId={propertyId}
          existingContactIds={propertyContacts.map(c => c.id)}
          onContactsAdded={() => {
            loadPropertyContacts();
            setShowAddPropertyModal(false);
          }}
          onCreateNew={() => {
            if (onEditContact) {
              setShowAddPropertyModal(false);
              onEditContact(null, propertyId);
            } else {
              setShowContactForm(true);
            }
          }}
        />
      )}

      {/* Add Deal Contacts Modal — reuses AddContactsModal but inserts into deal_contact */}
      {showAddDealModal && dealId && propertyId && (
        <AddDealContactsModal
          isOpen={showAddDealModal}
          onClose={() => setShowAddDealModal(false)}
          dealId={dealId}
          existingContactIds={dealContacts.map(c => c.id)}
          onContactsAdded={() => {
            loadDealContacts();
            setShowAddDealModal(false);
          }}
        />
      )}

      {/* Contact Form Modal */}
      {showContactForm && propertyId && (
        <ContactFormModal
          isOpen={showContactForm}
          onClose={() => {
            setShowContactForm(false);
            setEditingContactId(null);
          }}
          propertyId={propertyId}
          contactId={editingContactId || undefined}
          onSave={() => {
            reloadAll();
            setShowContactForm(false);
            setEditingContactId(null);
          }}
          onUpdate={() => {
            reloadAll();
            setShowContactForm(false);
            setEditingContactId(null);
          }}
        />
      )}
    </div>
  );
}

// Inline picker that lets the user attach existing contacts to a deal_contact row.
// AddContactsModal only knows about property_contact, so we have a small purpose-built
// modal here. Keeps the existing AddContactsModal untouched.
function AddDealContactsModal({
  isOpen,
  onClose,
  dealId,
  existingContactIds,
  onContactsAdded,
}: {
  isOpen: boolean;
  onClose: () => void;
  dealId: string;
  existingContactIds: string[];
  onContactsAdded: () => void;
}) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Contact[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      setResults([]);
      setSelectedIds(new Set());
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const term = search.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    (async () => {
      const { data, error } = await supabase
        .from('contact')
        .select('id, first_name, last_name, email, phone, mobile_phone, title, company')
        .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%,company.ilike.%${term}%`)
        .limit(20);
      if (cancelled) return;
      if (error) {
        console.error('Contact search failed:', error);
        setResults([]);
      } else {
        setResults((data || []) as Contact[]);
      }
      setSearching(false);
    })();
    return () => { cancelled = true; };
  }, [search, isOpen]);

  const toggle = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (selectedIds.size === 0) return;
    setSaving(true);
    try {
      const rows = Array.from(selectedIds).map(contact_id => ({
        deal_id: dealId,
        contact_id,
        primary_contact: false,
        role_id: null,
      }));
      const { error } = await supabase
        .from('deal_contact')
        .insert(prepareInsert(rows));
      if (error) throw error;
      onContactsAdded();
    } catch (err) {
      console.error('Error attaching contacts to deal:', err);
      alert('Failed to attach contacts to deal');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10010]">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Add Contacts to Deal</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4 space-y-3 flex-1 overflow-y-auto">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email, company…"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500"
            autoFocus
          />
          {searching && (
            <div className="text-xs text-gray-500">Searching…</div>
          )}
          {!searching && search.trim().length >= 2 && results.length === 0 && (
            <div className="text-xs text-gray-500">No matching contacts.</div>
          )}
          <div className="space-y-1">
            {results.map(c => {
              const alreadyOnDeal = existingContactIds.includes(c.id);
              const selected = selectedIds.has(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => !alreadyOnDeal && toggle(c.id)}
                  disabled={alreadyOnDeal}
                  className={`w-full text-left px-3 py-2 rounded text-sm flex items-center justify-between border transition-colors ${
                    alreadyOnDeal
                      ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'
                      : selected
                      ? 'bg-green-50 border-green-300 text-green-900'
                      : 'bg-white border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <span className="truncate">
                    {c.first_name} {c.last_name}
                    {c.company && <span className="text-xs text-gray-500 ml-2">— {c.company}</span>}
                  </span>
                  {alreadyOnDeal && <span className="text-[10px] uppercase">on deal</span>}
                  {!alreadyOnDeal && selected && (
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={selectedIds.size === 0 || saving}
            className="px-3 py-1.5 text-sm text-white bg-green-600 hover:bg-green-700 rounded disabled:opacity-50"
          >
            {saving ? 'Adding…' : `Add ${selectedIds.size || ''}`.trim()}
          </button>
        </div>
      </div>
    </div>
  );
}
