import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

interface PortalUser {
  contact_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  portal_access_enabled: boolean;
  portal_invite_status: string | null;
  portal_invite_sent_at: string | null;
  portal_invite_expires_at: string | null;
  portal_last_login_at: string | null;
  portal_auth_user_id: string | null;
  clients: { id: string; name: string }[] | null;
  total_logins: number;
  total_page_views: number;
  last_activity_at: string | null;
  portal_status: string;
}

interface ActivityLogEntry {
  id: string;
  event_type: string;
  event_data: Record<string, unknown>;
  page_path: string | null;
  created_at: string;
}

interface SummaryStats {
  totalUsers: number;
  activeUsers: number;
  pendingInvites: number;
  neverLoggedIn: number;
}

/**
 * PortalAnalyticsPage - Admin dashboard for portal user activity
 */
export default function PortalAnalyticsPage() {
  const navigate = useNavigate();
  const { userRole } = useAuth();

  const [users, setUsers] = useState<PortalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<SummaryStats>({
    totalUsers: 0,
    activeUsers: 0,
    pendingInvites: 0,
    neverLoggedIn: 0,
  });

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // User detail modal
  const [selectedUser, setSelectedUser] = useState<PortalUser | null>(null);
  const [userActivity, setUserActivity] = useState<ActivityLogEntry[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);

  // Check admin access
  useEffect(() => {
    if (userRole && !['admin', 'broker_full', 'broker_limited'].includes(userRole)) {
      navigate('/');
    }
  }, [userRole, navigate]);

  // Load portal users
  useEffect(() => {
    async function loadUsers() {
      setLoading(true);
      setError(null);

      try {
        // Try to use the view first
        const { data: viewData, error: viewError } = await supabase
          .from('portal_user_analytics')
          .select('*');

        if (viewError) {
          // Fallback to direct query if view doesn't exist yet
          console.warn('portal_user_analytics view not found, using fallback query');

          const { data: contacts, error: contactError } = await supabase
            .from('contact')
            .select(`
              id,
              first_name,
              last_name,
              email,
              portal_access_enabled,
              portal_invite_status,
              portal_invite_sent_at,
              portal_invite_expires_at,
              portal_last_login_at,
              portal_auth_user_id
            `)
            .or('portal_access_enabled.eq.true,portal_invite_status.not.is.null,portal_auth_user_id.not.is.null');

          if (contactError) throw contactError;

          const usersData: PortalUser[] = (contacts || []).map(c => ({
            contact_id: c.id,
            first_name: c.first_name,
            last_name: c.last_name,
            email: c.email || '',
            portal_access_enabled: c.portal_access_enabled || false,
            portal_invite_status: c.portal_invite_status,
            portal_invite_sent_at: c.portal_invite_sent_at,
            portal_invite_expires_at: c.portal_invite_expires_at,
            portal_last_login_at: c.portal_last_login_at,
            portal_auth_user_id: c.portal_auth_user_id,
            clients: null,
            total_logins: 0,
            total_page_views: 0,
            last_activity_at: c.portal_last_login_at,
            portal_status: c.portal_auth_user_id && c.portal_last_login_at ? 'active' :
                          c.portal_auth_user_id ? 'account_created' :
                          c.portal_invite_status === 'pending' ? 'invite_pending' :
                          c.portal_invite_status === 'expired' ? 'invite_expired' :
                          'not_invited',
          }));

          setUsers(usersData);
          calculateStats(usersData);
        } else {
          const usersData: PortalUser[] = (viewData || []).map(v => ({
            contact_id: v.contact_id,
            first_name: v.first_name,
            last_name: v.last_name,
            email: v.email || '',
            portal_access_enabled: v.portal_access_enabled || false,
            portal_invite_status: v.portal_invite_status,
            portal_invite_sent_at: v.portal_invite_sent_at,
            portal_invite_expires_at: v.portal_invite_expires_at,
            portal_last_login_at: v.portal_last_login_at,
            portal_auth_user_id: v.portal_auth_user_id,
            clients: v.clients,
            total_logins: v.total_logins || 0,
            total_page_views: v.total_page_views || 0,
            last_activity_at: v.last_activity_at,
            portal_status: v.portal_status,
          }));

          setUsers(usersData);
          calculateStats(usersData);
        }
      } catch (err) {
        console.error('Error loading portal users:', err);
        setError('Failed to load portal analytics data');
      } finally {
        setLoading(false);
      }
    }

    loadUsers();
  }, []);

  const calculateStats = (usersData: PortalUser[]) => {
    const stats: SummaryStats = {
      totalUsers: usersData.length,
      activeUsers: usersData.filter(u => u.portal_status === 'active').length,
      pendingInvites: usersData.filter(u => u.portal_status === 'invite_pending').length,
      neverLoggedIn: usersData.filter(u =>
        u.portal_auth_user_id && !u.portal_last_login_at
      ).length,
    };
    setStats(stats);
  };

  // Load user activity when selected
  const loadUserActivity = async (user: PortalUser) => {
    setSelectedUser(user);
    setLoadingActivity(true);

    try {
      const { data, error } = await supabase
        .from('portal_activity_log')
        .select('id, event_type, event_data, page_path, created_at')
        .eq('contact_id', user.contact_id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setUserActivity(data || []);
    } catch (err) {
      console.error('Error loading user activity:', err);
      setUserActivity([]);
    } finally {
      setLoadingActivity(false);
    }
  };

  // Filter users
  const filteredUsers = users.filter(user => {
    // Status filter
    if (statusFilter !== 'all' && user.portal_status !== statusFilter) {
      return false;
    }

    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      const name = `${user.first_name || ''} ${user.last_name || ''}`.toLowerCase();
      const email = (user.email || '').toLowerCase();
      if (!name.includes(search) && !email.includes(search)) {
        return false;
      }
    }

    return true;
  });

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { bg: string; text: string; label: string }> = {
      active: { bg: 'bg-green-100', text: 'text-green-800', label: 'Active' },
      account_created: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Account Created' },
      invite_pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Invite Pending' },
      invite_expired: { bg: 'bg-red-100', text: 'text-red-800', label: 'Invite Expired' },
      not_invited: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Not Invited' },
      no_access: { bg: 'bg-gray-100', text: 'text-gray-500', label: 'No Access' },
    };
    const badge = badges[status] || badges.no_access;
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const formatRelativeTime = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(dateStr);
  };

  const getEventTypeLabel = (eventType: string) => {
    const labels: Record<string, string> = {
      login: 'Logged in',
      logout: 'Logged out',
      page_view: 'Viewed page',
      view_property: 'Viewed property',
      view_site_submit: 'Viewed site submit',
      download_document: 'Downloaded document',
      search: 'Searched',
    };
    return labels[eventType] || eventType;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate(-1)}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Portal Analytics</h1>
                <p className="text-sm text-gray-500">Monitor portal user activity and engagement</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Portal Users</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalUsers}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-full">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Active Users</p>
                <p className="text-2xl font-bold text-green-600">{stats.activeUsers}</p>
              </div>
              <div className="p-3 bg-green-100 rounded-full">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Pending Invites</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.pendingInvites}</p>
              </div>
              <div className="p-3 bg-yellow-100 rounded-full">
                <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Never Logged In</p>
                <p className="text-2xl font-bold text-red-600">{stats.neverLoggedIn}</p>
              </div>
              <div className="p-3 bg-red-100 rounded-full">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full sm:w-48 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="account_created">Account Created</option>
                <option value="invite_pending">Invite Pending</option>
                <option value="invite_expired">Invite Expired</option>
                <option value="not_invited">Not Invited</option>
              </select>
            </div>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Login
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Logins
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Page Views
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Activity
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                      {searchTerm || statusFilter !== 'all'
                        ? 'No users match your filters'
                        : 'No portal users found'}
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user.contact_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10">
                            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                              <span className="text-sm font-medium text-blue-700">
                                {(user.first_name?.[0] || user.email?.[0] || '?').toUpperCase()}
                              </span>
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {user.first_name} {user.last_name}
                            </div>
                            <div className="text-sm text-gray-500">{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(user.portal_status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatRelativeTime(user.portal_last_login_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {user.total_logins}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {user.total_page_views}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatRelativeTime(user.last_activity_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => loadUserActivity(user)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          View Activity
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Activity Detail Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-10 mx-auto p-5 border w-full max-w-3xl shadow-lg rounded-lg bg-white mb-10">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-medium text-gray-900">
                  {selectedUser.first_name} {selectedUser.last_name}
                </h3>
                <p className="text-sm text-gray-500">{selectedUser.email}</p>
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* User Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Total Logins</p>
                <p className="text-xl font-bold text-gray-900">{selectedUser.total_logins}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Page Views</p>
                <p className="text-xl font-bold text-gray-900">{selectedUser.total_page_views}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Last Login</p>
                <p className="text-sm font-medium text-gray-900">
                  {formatRelativeTime(selectedUser.portal_last_login_at)}
                </p>
              </div>
            </div>

            {/* Activity Log */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-3">Activity History</h4>
              {loadingActivity ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : userActivity.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No activity recorded yet</p>
              ) : (
                <div className="max-h-96 overflow-y-auto">
                  <div className="space-y-2">
                    {userActivity.map((activity) => (
                      <div
                        key={activity.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center space-x-3">
                          <div className={`w-2 h-2 rounded-full ${
                            activity.event_type === 'login' ? 'bg-green-500' :
                            activity.event_type === 'logout' ? 'bg-red-500' :
                            'bg-blue-500'
                          }`}></div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {getEventTypeLabel(activity.event_type)}
                            </p>
                            {activity.page_path && (
                              <p className="text-xs text-gray-500">{activity.page_path}</p>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-gray-500">
                          {formatDate(activity.created_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
