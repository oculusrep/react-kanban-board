import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import AddTargetModal from './AddTargetModal';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  CheckIcon,
  XMarkIcon,
  PencilIcon,
  TrashIcon,
  GlobeAltIcon
} from '@heroicons/react/24/outline';
import {
  ProspectingTargetView,
  ProspectingTargetStatus,
  PROSPECTING_STATUS_CONFIG,
  PRIORITY_CONFIG
} from '../../types/prospecting';

export default function TargetList() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [targets, setTargets] = useState<ProspectingTargetView[]>([]);
  const [statusFilter, setStatusFilter] = useState<ProspectingTargetStatus | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddTargetModalOpen, setIsAddTargetModalOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState<ProspectingTargetView | null>(null);
  const [researchNotes, setResearchNotes] = useState('');
  const [contactsFound, setContactsFound] = useState(0);

  useEffect(() => {
    fetchTargets();
  }, [statusFilter]);

  const fetchTargets = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('v_prospecting_target')
        .select('*')
        .order('priority', { ascending: true })
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching targets:', error);
        return;
      }

      setTargets(data || []);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredTargets = targets.filter(target => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      target.company_name.toLowerCase().includes(search) ||
      target.source?.toLowerCase().includes(search) ||
      target.notes?.toLowerCase().includes(search)
    );
  });

  const updateTargetStatus = async (targetId: string, newStatus: ProspectingTargetStatus) => {
    // Get current user ID for audit
    let userId = null;
    if (user?.email) {
      const { data: userData } = await supabase
        .from('user')
        .select('id')
        .eq('email', user.email)
        .single();
      userId = userData?.id;
    }

    const updateData: any = {
      status: newStatus,
      updated_by_id: userId
    };

    // If marking as ready, set researched fields
    if (newStatus === 'ready') {
      updateData.researched_at = new Date().toISOString();
      updateData.researched_by = userId;
    }

    await supabase
      .from('prospecting_target')
      .update(updateData)
      .eq('id', targetId);

    fetchTargets();
  };

  const saveResearch = async (targetId: string) => {
    // Get current user ID
    let userId = null;
    if (user?.email) {
      const { data: userData } = await supabase
        .from('user')
        .select('id')
        .eq('email', user.email)
        .single();
      userId = userData?.id;
    }

    await supabase
      .from('prospecting_target')
      .update({
        research_notes: researchNotes,
        contacts_found: contactsFound,
        researched_at: new Date().toISOString(),
        researched_by: userId,
        status: 'ready',
        updated_by_id: userId
      })
      .eq('id', targetId);

    setEditingTarget(null);
    setResearchNotes('');
    setContactsFound(0);
    fetchTargets();
  };

  const deleteTarget = async (targetId: string) => {
    if (!confirm('Are you sure you want to delete this target?')) return;

    await supabase
      .from('prospecting_target')
      .delete()
      .eq('id', targetId);

    fetchTargets();
  };

  const startResearching = async (target: ProspectingTargetView) => {
    await updateTargetStatus(target.id, 'researching');
    setEditingTarget(target);
    setResearchNotes(target.research_notes || '');
    setContactsFound(target.contacts_found || 0);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const statusCounts = targets.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-16 bg-gray-200 rounded-lg"></div>
        <div className="h-64 bg-gray-200 rounded-lg"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900">Target Companies</h2>
            <span className="text-sm text-gray-500">({filteredTargets.length})</span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative">
              <MagnifyingGlassIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search targets..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm w-56 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status ({targets.length})</option>
              <option value="needs_research">Needs Research ({statusCounts['needs_research'] || 0})</option>
              <option value="researching">Researching ({statusCounts['researching'] || 0})</option>
              <option value="ready">Ready ({statusCounts['ready'] || 0})</option>
              <option value="calling">Calling ({statusCounts['calling'] || 0})</option>
              <option value="converted">Converted ({statusCounts['converted'] || 0})</option>
              <option value="disqualified">Disqualified ({statusCounts['disqualified'] || 0})</option>
            </select>

            {/* Add Target Button */}
            <button
              onClick={() => setIsAddTargetModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              <PlusIcon className="w-4 h-4" />
              Add Target
            </button>

            {/* Refresh */}
            <button
              onClick={fetchTargets}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              title="Refresh"
            >
              <ArrowPathIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Research Modal */}
      {editingTarget && (
        <>
          <div className="fixed inset-0 bg-black bg-opacity-50 z-[70]" onClick={() => setEditingTarget(null)} />
          <div className="fixed inset-0 flex items-center justify-center z-[70] p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Research: {editingTarget.company_name}
              </h3>

              {editingTarget.website && (
                <a
                  href={editingTarget.website.startsWith('http') ? editingTarget.website : `https://${editingTarget.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-blue-600 hover:text-blue-800 mb-4"
                >
                  <GlobeAltIcon className="w-4 h-4" />
                  {editingTarget.website}
                </a>
              )}

              {editingTarget.notes && (
                <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">{editingTarget.notes}</p>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Contacts Found
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={contactsFound}
                    onChange={(e) => setContactsFound(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Create contacts in the Contacts section, then update this count
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Research Notes
                  </label>
                  <textarea
                    value={researchNotes}
                    onChange={(e) => setResearchNotes(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    placeholder="Key findings, contact names found, talking points..."
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t">
                  <button
                    onClick={() => setEditingTarget(null)}
                    className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => saveResearch(editingTarget.id)}
                    className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700"
                  >
                    Mark Ready to Call
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Target Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Company
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Priority
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Source
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Contacts
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Added
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredTargets.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                  {searchTerm ? `No targets matching "${searchTerm}"` : 'No targets found'}
                </td>
              </tr>
            ) : (
              filteredTargets.map((target) => (
                <tr key={target.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div>
                      <div className="font-medium text-gray-900">{target.company_name}</div>
                      {target.website && (
                        <a
                          href={target.website.startsWith('http') ? target.website : `https://${target.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:text-blue-800"
                        >
                          {target.website}
                        </a>
                      )}
                      {target.notes && (
                        <p className="text-xs text-gray-500 truncate max-w-xs" title={target.notes}>
                          {target.notes}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                      PROSPECTING_STATUS_CONFIG[target.status]?.bgColor || 'bg-gray-100'
                    } ${PROSPECTING_STATUS_CONFIG[target.status]?.color || 'text-gray-700'}`}>
                      {PROSPECTING_STATUS_CONFIG[target.status]?.label || target.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`text-sm font-medium ${PRIORITY_CONFIG[target.priority]?.color || 'text-gray-500'}`}>
                      {PRIORITY_CONFIG[target.priority]?.label || 'Medium'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {target.source || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {target.contacts_found || 0}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(target.created_at)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-2">
                      {target.status === 'needs_research' && (
                        <button
                          onClick={() => startResearching(target)}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
                        >
                          Research
                        </button>
                      )}
                      {target.status === 'researching' && (
                        <button
                          onClick={() => {
                            setEditingTarget(target);
                            setResearchNotes(target.research_notes || '');
                            setContactsFound(target.contacts_found || 0);
                          }}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded hover:bg-green-700"
                        >
                          Complete
                        </button>
                      )}
                      {target.status === 'ready' && (
                        <button
                          onClick={() => updateTargetStatus(target.id, 'calling')}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-purple-600 rounded hover:bg-purple-700"
                        >
                          Start Calling
                        </button>
                      )}
                      {(target.status === 'calling' || target.status === 'ready') && (
                        <>
                          <button
                            onClick={() => updateTargetStatus(target.id, 'converted')}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                            title="Mark Converted"
                          >
                            <CheckIcon className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => updateTargetStatus(target.id, 'disqualified')}
                            className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"
                            title="Disqualify"
                          >
                            <XMarkIcon className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => deleteTarget(target.id)}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                        title="Delete"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Target Modal */}
      <AddTargetModal
        isOpen={isAddTargetModalOpen}
        onClose={() => setIsAddTargetModalOpen(false)}
        onTargetAdded={() => {
          setIsAddTargetModalOpen(false);
          fetchTargets();
        }}
      />
    </div>
  );
}
