/**
 * SiteSubmitCallList - Groups site submits by broker contact(s) for efficient calling
 *
 * Allows users to see all properties for the same broker(s) together so they can
 * discuss multiple properties in one phone call. Properties with the same set of
 * brokers are grouped together.
 */

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Phone, Mail, ChevronDown, ChevronRight, Building2, MapPin, RefreshCw } from 'lucide-react';
import BrokerEmailModal from './BrokerEmailModal';

interface BrokerContact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  mobile_phone: string | null;
  company: string | null;
  title: string | null;
}

interface SiteSubmitWithProperty {
  id: string;
  site_submit_name: string | null;
  submit_stage_name: string | null;
  date_submitted: string | null;
  notes: string | null;
  client_name: string | null;
  property_id: string;
  property_name: string | null;
  property_address: string | null;
  property_city: string | null;
  property_state: string | null;
}

// Changed to support multiple brokers per group
interface BrokerGroup {
  brokers: BrokerContact[];  // Array of brokers (can be 1 or more)
  groupKey: string;          // Composite key for identification
  siteSubmits: SiteSubmitWithProperty[];
}

interface SiteSubmitCallListProps {
  selectedClientId?: string;
  selectedStageIds?: string[];
  onPropertyClick?: (propertyId: string) => void;
  onSiteSubmitClick?: (siteSubmitId: string) => void;
}

export default function SiteSubmitCallList({
  selectedClientId,
  selectedStageIds,
  onPropertyClick,
}: SiteSubmitCallListProps) {
  const [brokerGroups, setBrokerGroups] = useState<BrokerGroup[]>([]);
  const [unassignedSubmits, setUnassignedSubmits] = useState<SiteSubmitWithProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  // Email modal state
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailBrokers, setEmailBrokers] = useState<BrokerContact[]>([]);
  const [emailProperties, setEmailProperties] = useState<{ name: string; address?: string; city?: string; state?: string }[]>([]);

  useEffect(() => {
    fetchCallList();
  }, [selectedClientId, selectedStageIds]);

  const fetchCallList = async () => {
    setLoading(true);
    setError(null);

    try {
      // First, fetch all site submits with their properties
      let query = supabase
        .from('site_submit')
        .select(`
          id,
          site_submit_name,
          date_submitted,
          notes,
          property_id,
          client_id,
          submit_stage_id,
          property!site_submit_property_id_fkey (
            id,
            property_name,
            address,
            city,
            state
          ),
          submit_stage!site_submit_submit_stage_id_fkey (
            id,
            name
          ),
          client!site_submit_client_id_fkey (
            id,
            client_name
          )
        `)
        .order('created_at', { ascending: false });

      // Apply filters
      if (selectedClientId) {
        query = query.eq('client_id', selectedClientId);
      }

      if (selectedStageIds && selectedStageIds.length > 0) {
        query = query.in('submit_stage_id', selectedStageIds);
      }

      const { data: siteSubmitData, error: submitError } = await query;

      if (submitError) throw submitError;

      if (!siteSubmitData || siteSubmitData.length === 0) {
        setBrokerGroups([]);
        setUnassignedSubmits([]);
        setLoading(false);
        return;
      }

      // Get unique property IDs
      const propertyIds = [...new Set(siteSubmitData.map(s => s.property_id).filter(Boolean))];

      // Fetch property contacts for all these properties in batches to avoid URL length limits
      const propertyContactsMap = new Map<string, BrokerContact[]>();
      const BATCH_SIZE = 50; // Keep batches small to avoid URL length issues

      for (let i = 0; i < propertyIds.length; i += BATCH_SIZE) {
        const batch = propertyIds.slice(i, i + BATCH_SIZE);

        const { data: propertyContactsData, error: contactsError } = await supabase
          .from('property_contact')
          .select(`
            property_id,
            contact!property_contact_contact_id_fkey (
              id,
              first_name,
              last_name,
              email,
              phone,
              mobile_phone,
              company,
              title
            )
          `)
          .in('property_id', batch);

        if (contactsError) throw contactsError;

        // Build a map of property_id -> contacts
        propertyContactsData?.forEach(pc => {
          const contact = pc.contact as unknown as BrokerContact;
          if (!contact) return;

          const existing = propertyContactsMap.get(pc.property_id) || [];
          existing.push(contact);
          propertyContactsMap.set(pc.property_id, existing);
        });
      }

      // Group site submits by broker SET (composite key of all broker IDs)
      const groupMap = new Map<string, BrokerGroup>();
      const unassigned: SiteSubmitWithProperty[] = [];

      siteSubmitData.forEach(submit => {
        const property = submit.property as any;
        const stage = submit.submit_stage as any;
        const client = submit.client as any;

        const siteSubmitWithProp: SiteSubmitWithProperty = {
          id: submit.id,
          site_submit_name: submit.site_submit_name,
          submit_stage_name: stage?.name || null,
          date_submitted: submit.date_submitted,
          notes: submit.notes,
          client_name: client?.client_name || null,
          property_id: submit.property_id,
          property_name: property?.property_name || null,
          property_address: property?.address || null,
          property_city: property?.city || null,
          property_state: property?.state || null,
        };

        const contacts = propertyContactsMap.get(submit.property_id);

        if (!contacts || contacts.length === 0) {
          unassigned.push(siteSubmitWithProp);
        } else {
          // Create composite key from sorted broker IDs
          const sortedBrokerIds = contacts.map(c => c.id).sort().join('|');

          const existingGroup = groupMap.get(sortedBrokerIds);
          if (existingGroup) {
            // Check if this site submit is already in the group
            if (!existingGroup.siteSubmits.find(s => s.id === submit.id)) {
              existingGroup.siteSubmits.push(siteSubmitWithProp);
            }
          } else {
            groupMap.set(sortedBrokerIds, {
              brokers: contacts,
              groupKey: sortedBrokerIds,
              siteSubmits: [siteSubmitWithProp],
            });
          }
        }
      });

      // Convert to array and sort by number of properties (most first)
      const groups = Array.from(groupMap.values()).sort(
        (a, b) => b.siteSubmits.length - a.siteSubmits.length
      );

      setBrokerGroups(groups);
      setUnassignedSubmits(unassigned);

      // Auto-expand groups with multiple properties
      const toExpand = new Set<string>();
      groups.forEach(g => {
        if (g.siteSubmits.length >= 2) {
          toExpand.add(g.groupKey);
        }
      });
      setExpandedGroups(toExpand);

    } catch (err) {
      console.error('Error fetching call list:', err);
      setError('Failed to load call list. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchCallList();
    setRefreshing(false);
  };

  const toggleGroupExpanded = (groupKey: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  const getBrokerDisplayName = (broker: BrokerContact): string => {
    const parts = [broker.first_name, broker.last_name].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : 'Unknown Contact';
  };

  const getBrokerPhone = (broker: BrokerContact): string | null => {
    return broker.mobile_phone || broker.phone || null;
  };

  const formatPhone = (phone: string): string => {
    // Remove non-digits
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    if (digits.length === 11 && digits[0] === '1') {
      return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    return phone;
  };

  // Open email modal for a broker group
  const handleEmailBrokers = (brokers: BrokerContact[], siteSubmits: SiteSubmitWithProperty[]) => {
    setEmailBrokers(brokers);
    setEmailProperties(siteSubmits.map(s => ({
      name: s.property_name || 'Unknown',
      address: s.property_address || undefined,
      city: s.property_city || undefined,
      state: s.property_state || undefined,
    })));
    setShowEmailModal(true);
  };

  // Get group display name (combines broker names)
  const getGroupDisplayName = (brokers: BrokerContact[]): string => {
    if (brokers.length === 1) {
      return getBrokerDisplayName(brokers[0]);
    }
    return brokers.map(b => getBrokerDisplayName(b)).join(' & ');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Loading call list...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        {error}
        <button
          onClick={handleRefresh}
          className="ml-4 text-red-600 underline hover:text-red-800"
        >
          Try again
        </button>
      </div>
    );
  }

  const totalGroups = brokerGroups.length;
  const totalProperties = brokerGroups.reduce((sum, g) => sum + g.siteSubmits.length, 0);

  return (
    <div className="space-y-4">
      {/* Summary Header */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Call List by Broker</h2>
            <p className="text-sm text-gray-500 mt-1">
              {totalGroups} broker group{totalGroups !== 1 ? 's' : ''} with {totalProperties} site submit{totalProperties !== 1 ? 's' : ''}
              {unassignedSubmits.length > 0 && (
                <span className="text-amber-600 ml-2">
                  ({unassignedSubmits.length} without broker contact)
                </span>
              )}
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Broker Groups */}
      {brokerGroups.length === 0 && unassignedSubmits.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          No site submits found matching your filters.
        </div>
      ) : (
        <div className="space-y-3">
          {brokerGroups.map(group => {
            const isExpanded = expandedGroups.has(group.groupKey);

            return (
              <div key={group.groupKey} className="bg-white rounded-lg shadow overflow-hidden">
                {/* Group Header */}
                <div
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                  onClick={() => toggleGroupExpanded(group.groupKey)}
                >
                  <div className="flex items-center gap-3">
                    <button className="text-gray-400 hover:text-gray-600">
                      {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                    </button>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">
                          {getGroupDisplayName(group.brokers)}
                        </span>
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full">
                          {group.siteSubmits.length} propert{group.siteSubmits.length !== 1 ? 'ies' : 'y'}
                        </span>
                        {group.brokers.length > 1 && (
                          <span className="px-2 py-0.5 bg-purple-100 text-purple-800 text-xs rounded-full">
                            {group.brokers.length} brokers
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500 flex items-center gap-3 mt-0.5">
                        {group.brokers[0].company && <span>{group.brokers[0].company}</span>}
                        {group.brokers.length > 1 && group.brokers[1].company && group.brokers[1].company !== group.brokers[0].company && (
                          <span className="text-gray-400">& {group.brokers[1].company}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Contact Actions */}
                  <div className="flex items-center gap-2 flex-wrap justify-end" onClick={e => e.stopPropagation()}>
                    {/* Phone numbers for each broker */}
                    {group.brokers.map(broker => {
                      const brokerPhone = getBrokerPhone(broker);
                      const brokerName = getBrokerDisplayName(broker);
                      const isMultipleBrokers = group.brokers.length > 1;

                      return brokerPhone ? (
                        <div key={broker.id} className="flex items-center gap-1">
                          {isMultipleBrokers && (
                            <span className="text-xs text-gray-400 mr-1">{broker.first_name}:</span>
                          )}
                          <a
                            href={`tel:${brokerPhone}`}
                            className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-md hover:bg-green-200 text-xs"
                            title={`Call ${brokerName}`}
                          >
                            <Phone size={12} />
                            {formatPhone(brokerPhone)}
                          </a>
                        </div>
                      ) : null;
                    })}
                    {/* Single email button for all brokers in the group */}
                    {group.brokers.some(b => b.email) && (
                      <button
                        onClick={() => handleEmailBrokers(group.brokers, group.siteSubmits)}
                        className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 text-xs"
                        title={`Email ${group.brokers.length > 1 ? 'brokers' : 'broker'} via Gmail`}
                      >
                        <Mail size={12} />
                        Email
                      </button>
                    )}
                  </div>
                </div>

                {/* Property List */}
                {isExpanded && (
                  <div className="border-t border-gray-200 bg-gray-50">
                    <table className="min-w-full">
                      <thead>
                        <tr className="text-xs text-gray-500 uppercase">
                          <th className="px-4 py-2 text-left font-medium">Property</th>
                          <th className="px-4 py-2 text-left font-medium">Location</th>
                          <th className="px-4 py-2 text-left font-medium">Client</th>
                          <th className="px-4 py-2 text-left font-medium">Stage</th>
                          <th className="px-4 py-2 text-left font-medium">Submitted</th>
                          <th className="px-4 py-2 text-left font-medium">Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {group.siteSubmits.map(submit => (
                          <tr key={submit.id} className="hover:bg-gray-100">
                            <td className="px-4 py-3">
                              <button
                                onClick={() => onPropertyClick?.(submit.property_id)}
                                className="flex items-center gap-2 text-blue-600 hover:text-blue-800 hover:underline text-left"
                              >
                                <Building2 size={14} className="text-gray-400 flex-shrink-0" />
                                <span className="font-medium">{submit.property_name || 'Unknown'}</span>
                              </button>
                              {submit.property_address && (
                                <div className="text-xs text-gray-500 ml-6 mt-0.5">
                                  {submit.property_address}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {[submit.property_city, submit.property_state].filter(Boolean).join(', ')}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {submit.client_name || '-'}
                            </td>
                            <td className="px-4 py-3">
                              {submit.submit_stage_name && (
                                <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
                                  {submit.submit_stage_name}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {submit.date_submitted
                                ? (() => {
                                const [y, m, d] = submit.date_submitted.split('-').map(Number);
                                return new Date(y, m - 1, d).toLocaleDateString();
                              })()
                                : '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">
                              {submit.notes || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}

          {/* Unassigned Properties */}
          {unassignedSubmits.length > 0 && (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="p-4 bg-amber-50 border-b border-amber-200">
                <div className="flex items-center gap-2">
                  <MapPin size={18} className="text-amber-600" />
                  <span className="font-medium text-amber-800">
                    Properties Without Broker Contact
                  </span>
                  <span className="px-2 py-0.5 bg-amber-200 text-amber-800 text-xs rounded-full">
                    {unassignedSubmits.length}
                  </span>
                </div>
              </div>
              <table className="min-w-full">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase bg-gray-50">
                    <th className="px-4 py-2 text-left font-medium">Property</th>
                    <th className="px-4 py-2 text-left font-medium">Location</th>
                    <th className="px-4 py-2 text-left font-medium">Client</th>
                    <th className="px-4 py-2 text-left font-medium">Stage</th>
                    <th className="px-4 py-2 text-left font-medium">Submitted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {unassignedSubmits.map(submit => (
                    <tr key={submit.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => onPropertyClick?.(submit.property_id)}
                          className="flex items-center gap-2 text-blue-600 hover:text-blue-800 hover:underline text-left"
                        >
                          <Building2 size={14} className="text-gray-400 flex-shrink-0" />
                          <span className="font-medium">{submit.property_name || 'Unknown'}</span>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {[submit.property_city, submit.property_state].filter(Boolean).join(', ')}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {submit.client_name || '-'}
                      </td>
                      <td className="px-4 py-3">
                        {submit.submit_stage_name && (
                          <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
                            {submit.submit_stage_name}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {submit.date_submitted
                          ? (() => {
                                const [y, m, d] = submit.date_submitted.split('-').map(Number);
                                return new Date(y, m - 1, d).toLocaleDateString();
                              })()
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Email Modal */}
      <BrokerEmailModal
        isOpen={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        brokers={emailBrokers}
        properties={emailProperties}
        onSuccess={() => {
          // Optionally refresh or show success message
        }}
      />
    </div>
  );
}
