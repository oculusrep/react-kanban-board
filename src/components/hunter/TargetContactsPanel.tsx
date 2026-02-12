// Panel to display and manage contacts linked to a target (company)
// src/components/hunter/TargetContactsPanel.tsx

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import {
  UserGroupIcon,
  PlusIcon,
  StarIcon,
  EnvelopeIcon,
  PhoneIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid';

interface TargetContact {
  id: string;
  first_name: string;
  last_name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  mobile_phone: string | null;
  is_primary_contact: boolean;
  created_at: string;
}

interface PrefillContact {
  firstName?: string;
  lastName?: string;
  title?: string;
}

interface TargetContactsPanelProps {
  targetId: string;
  companyName: string;
  onContactAdded?: () => void;
  // Optional: pre-fill the add contact form with key person info
  prefillContact?: PrefillContact;
  // Optional: auto-show the add form when prefillContact is provided
  autoShowAddForm?: boolean;
}

export default function TargetContactsPanel({ targetId, companyName, onContactAdded, prefillContact, autoShowAddForm }: TargetContactsPanelProps) {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<TargetContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state for new contact
  const [newContact, setNewContact] = useState({
    first_name: '',
    last_name: '',
    title: '',
    email: '',
    phone: ''
  });

  useEffect(() => {
    loadContacts();
  }, [targetId]);

  // Handle pre-fill and auto-show
  useEffect(() => {
    if (prefillContact && autoShowAddForm) {
      setNewContact({
        first_name: prefillContact.firstName || '',
        last_name: prefillContact.lastName || '',
        title: prefillContact.title || '',
        email: '',
        phone: ''
      });
      setShowAddForm(true);
    }
  }, [prefillContact, autoShowAddForm]);

  // Method to programmatically open the add form with pre-filled data
  const openAddFormWithData = (data: PrefillContact) => {
    setNewContact({
      first_name: data.firstName || '',
      last_name: data.lastName || '',
      title: data.title || '',
      email: '',
      phone: ''
    });
    setShowAddForm(true);
  };

  async function loadContacts() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('contact')
        .select('id, first_name, last_name, title, email, phone, mobile_phone, is_primary_contact, created_at')
        .eq('target_id', targetId)
        .order('is_primary_contact', { ascending: false })
        .order('created_at', { ascending: true });

      if (error) throw error;
      setContacts(data || []);
    } catch (err) {
      console.error('Error loading contacts:', err);
    } finally {
      setLoading(false);
    }
  }

  async function addContact() {
    if (!newContact.first_name.trim() || !newContact.last_name.trim()) {
      alert('First and last name are required');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('contact')
        .insert({
          first_name: newContact.first_name.trim(),
          last_name: newContact.last_name.trim(),
          title: newContact.title.trim() || null,
          email: newContact.email.trim() || null,
          phone: newContact.phone.trim() || null,
          company: companyName,
          target_id: targetId,
          source_type: 'Hunter',
          is_primary_contact: contacts.length === 0, // First contact is primary
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      // Reset form and reload
      setNewContact({ first_name: '', last_name: '', title: '', email: '', phone: '' });
      setShowAddForm(false);
      loadContacts();
      onContactAdded?.();
    } catch (err) {
      console.error('Error adding contact:', err);
      alert('Failed to add contact');
    } finally {
      setSaving(false);
    }
  }

  async function togglePrimaryContact(contactId: string, currentlyPrimary: boolean) {
    try {
      if (!currentlyPrimary) {
        // First, unset any existing primary
        await supabase
          .from('contact')
          .update({ is_primary_contact: false })
          .eq('target_id', targetId);
      }

      // Toggle this contact
      const { error } = await supabase
        .from('contact')
        .update({ is_primary_contact: !currentlyPrimary })
        .eq('id', contactId);

      if (error) throw error;
      loadContacts();
    } catch (err) {
      console.error('Error updating primary contact:', err);
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <UserGroupIcon className="w-5 h-5 text-gray-500" />
          Contacts ({contacts.length})
        </h3>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="text-sm text-orange-600 hover:text-orange-700 font-medium flex items-center gap-1"
        >
          <PlusIcon className="w-4 h-4" />
          Add
        </button>
      </div>

      {/* Add Contact Form */}
      {showAddForm && (
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="First name *"
              value={newContact.first_name}
              onChange={(e) => setNewContact({ ...newContact, first_name: e.target.value })}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            />
            <input
              type="text"
              placeholder="Last name *"
              value={newContact.last_name}
              onChange={(e) => setNewContact({ ...newContact, last_name: e.target.value })}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            />
            <input
              type="text"
              placeholder="Title"
              value={newContact.title}
              onChange={(e) => setNewContact({ ...newContact, title: e.target.value })}
              className="col-span-2 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            />
            <input
              type="email"
              placeholder="Email"
              value={newContact.email}
              onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            />
            <input
              type="tel"
              placeholder="Phone"
              value={newContact.phone}
              onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            />
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setShowAddForm(false)}
              className="flex-1 px-3 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={addContact}
              disabled={saving}
              className="flex-1 px-3 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
            >
              {saving ? 'Adding...' : 'Add Contact'}
            </button>
          </div>
        </div>
      )}

      {/* Contacts List */}
      <div className="divide-y divide-gray-100">
        {loading ? (
          <div className="p-4 text-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mx-auto"></div>
          </div>
        ) : contacts.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">
            <UserGroupIcon className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p>No contacts yet</p>
            <button
              onClick={() => setShowAddForm(true)}
              className="mt-2 text-orange-600 hover:text-orange-700 text-sm font-medium"
            >
              Add the first contact
            </button>
          </div>
        ) : (
          contacts.map((contact) => (
            <div
              key={contact.id}
              className="p-3 hover:bg-gray-50 flex items-center gap-3"
            >
              {/* Primary Star */}
              <button
                onClick={() => togglePrimaryContact(contact.id, contact.is_primary_contact)}
                className="flex-shrink-0"
                title={contact.is_primary_contact ? 'Primary contact' : 'Set as primary'}
              >
                {contact.is_primary_contact ? (
                  <StarIconSolid className="w-5 h-5 text-yellow-500" />
                ) : (
                  <StarIcon className="w-5 h-5 text-gray-300 hover:text-yellow-400" />
                )}
              </button>

              {/* Contact Info */}
              <div
                className="flex-1 min-w-0 cursor-pointer"
                onClick={() => navigate(`/contact/${contact.id}`)}
              >
                <p className="font-medium text-gray-900 truncate">
                  {contact.first_name} {contact.last_name}
                </p>
                {contact.title && (
                  <p className="text-xs text-gray-500 truncate">{contact.title}</p>
                )}
              </div>

              {/* Quick Actions */}
              <div className="flex items-center gap-2">
                {contact.email && (
                  <a
                    href={`mailto:${contact.email}`}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                    title={contact.email}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <EnvelopeIcon className="w-4 h-4" />
                  </a>
                )}
                {(contact.phone || contact.mobile_phone) && (
                  <a
                    href={`tel:${contact.mobile_phone || contact.phone}`}
                    className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded"
                    title={contact.mobile_phone || contact.phone || ''}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <PhoneIcon className="w-4 h-4" />
                  </a>
                )}
                <button
                  onClick={() => navigate(`/contact/${contact.id}`)}
                  className="p-1.5 text-gray-400 hover:text-gray-600"
                >
                  <ChevronRightIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
