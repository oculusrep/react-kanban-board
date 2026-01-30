import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';

interface PortalUser {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  company: string | null;
  portal_access_enabled: boolean | null;
  portal_invite_status: string | null;
  portal_invite_sent_at: string | null;
  portal_last_login_at: string | null;
  portal_invite_expires_at: string | null;
  client_count: number;
}

/**
 * PortalUserManagementPage - Admin page to manage portal users
 *
 * Features:
 * - View all contacts with portal access enabled or invites sent
 * - Enable/disable portal access
 * - View and manage invite status
 * - Resend invites
 */
export default function PortalUserManagementPage() {
  const { user } = useAuth();
  const [portalUsers, setPortalUsers] = useState<PortalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'pending' | 'disabled'>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Fetch portal users
  useEffect(() => {
    async function fetchPortalUsers() {
      setLoading(true);
      setError(null);

      try {
        // Get all contacts that have portal access enabled or have been invited
        const { data: contacts, error: contactError } = await supabase
          .from('contact')
          .select(`
            id,
            first_name,
            last_name,
            email,
            company,
            portal_access_enabled,
            portal_invite_status,
            portal_invite_sent_at,
            portal_last_login_at,
            portal_invite_expires_at
          `)
          .or('portal_access_enabled.eq.true,portal_invite_status.neq.null')
          .order('last_name, first_name');

        if (contactError) throw contactError;

        // Get client access counts for each contact
        const contactIds = (contacts || []).map(c => c.id);

        let clientCounts: Record<string, number> = {};
        if (contactIds.length > 0) {
          const { data: accessData, error: accessError } = await supabase
            .from('portal_user_client_access')
            .select('contact_id')
            .in('contact_id', contactIds)
            .eq('is_active', true);

          if (!accessError && accessData) {
            accessData.forEach(a => {
              clientCounts[a.contact_id] = (clientCounts[a.contact_id] || 0) + 1;
            });
          }
        }

        const users: PortalUser[] = (contacts || []).map(c => ({
          ...c,
          client_count: clientCounts[c.id] || 0,
        }));

        setPortalUsers(users);
      } catch (err) {
        console.error('Error fetching portal users:', err);
        setError('Failed to load portal users');
      } finally {
        setLoading(false);
      }
    }

    fetchPortalUsers();
  }, []);

  // Handle enabling/disabling portal access
  const handleToggleAccess = async (contactId: string, enable: boolean) => {
    setActionLoading(contactId);
    try {
      const { error } = await supabase
        .from('contact')
        .update({
          portal_access_enabled: enable,
          updated_at: new Date().toISOString(),
        })
        .eq('id', contactId);

      if (error) throw error;

      // Update local state
      setPortalUsers(prev =>
        prev.map(u =>
          u.id === contactId ? { ...u, portal_access_enabled: enable } : u
        )
      );
    } catch (err) {
      console.error('Error toggling portal access:', err);
    } finally {
      setActionLoading(null);
    }
  };

  // Handle resending invite
  const handleResendInvite = async (contactId: string, email: string) => {
    setActionLoading(contactId);
    try {
      // Generate new invite token
      const token = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const { error } = await supabase
        .from('contact')
        .update({
          portal_invite_token: token,
          portal_invite_status: 'pending',
          portal_invite_sent_at: new Date().toISOString(),
          portal_invite_expires_at: expiresAt.toISOString(),
        })
        .eq('id', contactId);

      if (error) throw error;

      // Log the invite
      await supabase.from('portal_invite_log').insert({
        contact_id: contactId,
        invited_by_id: user?.id,
        invite_email: email,
        invite_token: token,
        status: 'sent',
        expires_at: expiresAt.toISOString(),
      });

      // Update local state
      setPortalUsers(prev =>
        prev.map(u =>
          u.id === contactId
            ? {
                ...u,
                portal_invite_status: 'pending',
                portal_invite_sent_at: new Date().toISOString(),
                portal_invite_expires_at: expiresAt.toISOString(),
              }
            : u
        )
      );

      // Show invite link (for now - later can send via email)
      const inviteLink = `${window.location.origin}/portal/invite?token=${token}`;
      alert(`Invite link created:\n\n${inviteLink}\n\nCopy this link and send it to the user.`);
    } catch (err) {
      console.error('Error resending invite:', err);
    } finally {
      setActionLoading(null);
    }
  };

  // Filter users
  const filteredUsers = portalUsers.filter(u => {
    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchesSearch =
        u.first_name?.toLowerCase().includes(term) ||
        u.last_name?.toLowerCase().includes(term) ||
        u.email?.toLowerCase().includes(term) ||
        u.company?.toLowerCase().includes(term);
      if (!matchesSearch) return false;
    }

    // Status filter
    switch (statusFilter) {
      case 'active':
        return u.portal_access_enabled && u.portal_invite_status === 'accepted';
      case 'pending':
        return u.portal_invite_status === 'pending';
      case 'disabled':
        return !u.portal_access_enabled;
      default:
        return true;
    }
  });

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (u: PortalUser) => {
    if (!u.portal_access_enabled) {
      return (
        <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
          Disabled
        </span>
      );
    }

    switch (u.portal_invite_status) {
      case 'accepted':
        return (
          <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-800">
            Active
          </span>
        );
      case 'pending':
        // Check if expired
        if (u.portal_invite_expires_at && new Date(u.portal_invite_expires_at) < new Date()) {
          return (
            <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-800">
              Expired
            </span>
          );
        }
        return (
          <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
            Pending
          </span>
        );
      default:
        return (
          <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
            Not Invited
          </span>
        );
    }
  };

  const statusCounts = {
    all: portalUsers.length,
    active: portalUsers.filter(u => u.portal_access_enabled && u.portal_invite_status === 'accepted').length,
    pending: portalUsers.filter(u => u.portal_invite_status === 'pending').length,
    disabled: portalUsers.filter(u => !u.portal_access_enabled).length,
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Portal User Management</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage client portal access for contacts
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          {/* Status Tabs */}
          <div className="flex items-center space-x-2">
            {(['all', 'active', 'pending', 'disabled'] as const).map(status => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
                  statusFilter === status
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)} ({statusCounts[status]})
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="flex-1 max-w-xs">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search users..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <p className="text-red-600">{error}</p>
            </div>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center text-gray-500">
              <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <p>No portal users found</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Clients
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Invite Sent
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Login
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredUsers.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center">
                          <span className="text-blue-600 font-medium text-sm">
                            {(u.first_name?.[0] || '')}{(u.last_name?.[0] || '')}
                          </span>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {u.first_name} {u.last_name}
                          </div>
                          <div className="text-sm text-gray-500">{u.email}</div>
                          {u.company && (
                            <div className="text-xs text-gray-400">{u.company}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {getStatusBadge(u)}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900">{u.client_count}</span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-500">
                        {formatDate(u.portal_invite_sent_at)}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-500">
                        {formatDateTime(u.portal_last_login_at)}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        {/* Enable/Disable Toggle */}
                        <button
                          onClick={() => handleToggleAccess(u.id, !u.portal_access_enabled)}
                          disabled={actionLoading === u.id}
                          className={`px-3 py-1 text-xs font-medium rounded transition-colors disabled:opacity-50 ${
                            u.portal_access_enabled
                              ? 'bg-red-100 text-red-700 hover:bg-red-200'
                              : 'bg-green-100 text-green-700 hover:bg-green-200'
                          }`}
                        >
                          {u.portal_access_enabled ? 'Disable' : 'Enable'}
                        </button>

                        {/* Resend Invite */}
                        {u.portal_access_enabled && u.email && (
                          <button
                            onClick={() => handleResendInvite(u.id, u.email!)}
                            disabled={actionLoading === u.id}
                            className="px-3 py-1 text-xs font-medium rounded bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors disabled:opacity-50"
                          >
                            {u.portal_invite_status === 'accepted' ? 'Reset Password' : 'Send Invite'}
                          </button>
                        )}

                        {/* View Contact */}
                        <a
                          href={`/contact/${u.id}`}
                          className="px-3 py-1 text-xs font-medium rounded bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                        >
                          View
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
