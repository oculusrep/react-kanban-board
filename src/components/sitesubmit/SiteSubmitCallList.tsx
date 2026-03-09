/**
 * SiteSubmitCallList - Groups site submits by broker contact for efficient calling
 *
 * Allows users to see all properties for the same broker together so they can
 * discuss multiple properties in one phone call.
 */

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Phone, Mail, ChevronDown, ChevronRight, Building2, MapPin, RefreshCw, ExternalLink } from 'lucide-react';

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

interface BrokerGroup {
  broker: BrokerContact;
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
  onSiteSubmitClick,
}: SiteSubmitCallListProps) {
  const [brokerGroups, setBrokerGroups] = useState<BrokerGroup[]>([]);
  const [unassignedSubmits, setUnassignedSubmits] = useState<SiteSubmitWithProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedBrokers, setExpandedBrokers] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);

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
            contact:contact_id!property_contact_contact_id_fkey (
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

      // Group site submits by broker
      const brokerMap = new Map<string, BrokerGroup>();
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
          // Add to each broker's group (property might have multiple brokers)
          contacts.forEach(contact => {
            const existing = brokerMap.get(contact.id);
            if (existing) {
              // Check if this site submit is already in the group
              if (!existing.siteSubmits.find(s => s.id === submit.id)) {
                existing.siteSubmits.push(siteSubmitWithProp);
              }
            } else {
              brokerMap.set(contact.id, {
                broker: contact,
                siteSubmits: [siteSubmitWithProp],
              });
            }
          });
        }
      });

      // Convert to array and sort by number of properties (most first)
      const groups = Array.from(brokerMap.values()).sort(
        (a, b) => b.siteSubmits.length - a.siteSubmits.length
      );

      setBrokerGroups(groups);
      setUnassignedSubmits(unassigned);

      // Auto-expand brokers with multiple properties
      const toExpand = new Set<string>();
      groups.forEach(g => {
        if (g.siteSubmits.length >= 2) {
          toExpand.add(g.broker.id);
        }
      });
      setExpandedBrokers(toExpand);

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

  const toggleBrokerExpanded = (brokerId: string) => {
    setExpandedBrokers(prev => {
      const next = new Set(prev);
      if (next.has(brokerId)) {
        next.delete(brokerId);
      } else {
        next.add(brokerId);
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

  const totalBrokers = brokerGroups.length;
  const totalProperties = brokerGroups.reduce((sum, g) => sum + g.siteSubmits.length, 0);

  return (
    <div className="space-y-4">
      {/* Summary Header */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Call List by Broker</h2>
            <p className="text-sm text-gray-500 mt-1">
              {totalBrokers} broker{totalBrokers !== 1 ? 's' : ''} with {totalProperties} site submit{totalProperties !== 1 ? 's' : ''}
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
            const isExpanded = expandedBrokers.has(group.broker.id);
            const brokerPhone = getBrokerPhone(group.broker);

            return (
              <div key={group.broker.id} className="bg-white rounded-lg shadow overflow-hidden">
                {/* Broker Header */}
                <div
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                  onClick={() => toggleBrokerExpanded(group.broker.id)}
                >
                  <div className="flex items-center gap-3">
                    <button className="text-gray-400 hover:text-gray-600">
                      {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                    </button>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">
                          {getBrokerDisplayName(group.broker)}
                        </span>
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full">
                          {group.siteSubmits.length} propert{group.siteSubmits.length !== 1 ? 'ies' : 'y'}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500 flex items-center gap-3 mt-0.5">
                        {group.broker.company && <span>{group.broker.company}</span>}
                        {group.broker.title && <span className="text-gray-400">• {group.broker.title}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Contact Actions */}
                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    {brokerPhone && (
                      <a
                        href={`tel:${brokerPhone}`}
                        className="flex items-center gap-1 px-3 py-1.5 bg-green-100 text-green-700 rounded-md hover:bg-green-200 text-sm"
                      >
                        <Phone size={14} />
                        {formatPhone(brokerPhone)}
                      </a>
                    )}
                    {group.broker.email && (
                      <a
                        href={`mailto:${group.broker.email}`}
                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 text-sm"
                      >
                        <Mail size={14} />
                        Email
                      </a>
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
                                ? new Date(submit.date_submitted).toLocaleDateString()
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
                          ? new Date(submit.date_submitted).toLocaleDateString()
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
    </div>
  );
}
