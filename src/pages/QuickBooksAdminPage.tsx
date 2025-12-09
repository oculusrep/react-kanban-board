import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { ArrowLeft, CheckCircle, XCircle, RefreshCw, Link2, Unlink } from "lucide-react";

interface QBConnection {
  id: string;
  realm_id: string;
  status: 'connected' | 'expired' | 'error';
  connected_at: string;
  last_sync_at: string | null;
  access_token_expires_at: string;
  refresh_token_expires_at: string;
  connected_by: {
    first_name: string;
    last_name: string;
  } | null;
}

interface SyncLogEntry {
  id: string;
  sync_type: string;
  direction: string;
  status: string;
  entity_type: string | null;
  error_message: string | null;
  created_at: string;
}

export default function QuickBooksAdminPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { userRole } = useAuth();

  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [connection, setConnection] = useState<QBConnection | null>(null);
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    document.title = "QuickBooks Integration | OVIS Admin";

    // Check for OAuth callback results
    const qbConnected = searchParams.get('qb_connected');
    const qbError = searchParams.get('qb_error');

    if (qbConnected === 'true') {
      setMessage({ type: 'success', text: 'Successfully connected to QuickBooks!' });
      // Clear the URL params
      window.history.replaceState({}, '', '/admin/quickbooks');
    } else if (qbError) {
      setMessage({ type: 'error', text: qbError });
      window.history.replaceState({}, '', '/admin/quickbooks');
    }

    fetchConnectionStatus();
    fetchSyncLogs();
  }, [searchParams]);

  const fetchConnectionStatus = async () => {
    try {
      const { data, error } = await supabase
        .from('qb_connection')
        .select(`
          id,
          realm_id,
          status,
          connected_at,
          last_sync_at,
          access_token_expires_at,
          refresh_token_expires_at,
          connected_by:connected_by (
            first_name,
            last_name
          )
        `)
        .eq('status', 'connected')
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error fetching QBO connection:', error);
      }

      setConnection(data);
    } catch (error) {
      console.error('Error fetching connection status:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSyncLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('qb_sync_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('Error fetching sync logs:', error);
        return;
      }

      setSyncLogs(data || []);
    } catch (error) {
      console.error('Error fetching sync logs:', error);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    setMessage(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setMessage({ type: 'error', text: 'You must be logged in to connect QuickBooks' });
        return;
      }

      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      console.log('QuickBooks connect - anonKey present:', !!anonKey, 'starts with eyJ:', anonKey?.startsWith('eyJ'));
      console.log('QuickBooks connect - session.access_token present:', !!session.access_token);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quickbooks-connect`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': anonKey
          }
        }
      );

      console.log('QuickBooks connect - response status:', response.status);

      const result = await response.json();
      console.log('QuickBooks connect - response body:', result);

      if (!response.ok) {
        setMessage({ type: 'error', text: result.error || 'Failed to initiate connection' });
        return;
      }

      if (result.authorizationUrl) {
        // Redirect to QuickBooks OAuth
        window.location.href = result.authorizationUrl;
      }
    } catch (error: any) {
      console.error('Error connecting to QuickBooks:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to connect' });
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!connection) return;

    if (!confirm('Are you sure you want to disconnect QuickBooks? This will stop all syncing.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('qb_connection')
        .update({ status: 'expired' })
        .eq('id', connection.id);

      if (error) throw error;

      setMessage({ type: 'success', text: 'QuickBooks disconnected successfully' });
      setConnection(null);
    } catch (error: any) {
      console.error('Error disconnecting:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to disconnect' });
    }
  };

  // Check if user is admin
  if (userRole !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900">Access Denied</h1>
          <p className="text-gray-600 mt-2">Only administrators can access QuickBooks settings.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading QuickBooks settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center text-blue-600 hover:text-blue-800 mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </button>

          <h1 className="text-3xl font-bold text-gray-900">QuickBooks Integration</h1>
          <p className="mt-2 text-gray-600">
            Connect OVIS to QuickBooks Online to sync invoices, payments, and expenses.
          </p>
        </div>

        {/* Message Banner */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
            message.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}>
            {message.type === 'success' ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <XCircle className="h-5 w-5 text-red-500" />
            )}
            <span>{message.text}</span>
            <button
              onClick={() => setMessage(null)}
              className="ml-auto text-gray-500 hover:text-gray-700"
            >
              &times;
            </button>
          </div>
        )}

        {/* Connection Status Card */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Connection Status</h2>
          </div>

          <div className="p-6">
            {connection ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-100">
                    <CheckCircle className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-green-700">Connected to QuickBooks</p>
                    <p className="text-sm text-gray-600">Company ID: {connection.realm_id}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
                  <div>
                    <p className="text-gray-500">Connected At</p>
                    <p className="font-medium">{new Date(connection.connected_at).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Connected By</p>
                    <p className="font-medium">
                      {connection.connected_by
                        ? `${connection.connected_by.first_name} ${connection.connected_by.last_name}`
                        : 'Unknown'}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500">Last Sync</p>
                    <p className="font-medium">
                      {connection.last_sync_at
                        ? new Date(connection.last_sync_at).toLocaleString()
                        : 'Never'}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500">Token Expires</p>
                    <p className="font-medium">
                      {new Date(connection.access_token_expires_at).toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={handleConnect}
                    disabled={connecting}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-4 w-4 ${connecting ? 'animate-spin' : ''}`} />
                    Reconnect
                  </button>
                  <button
                    onClick={handleDisconnect}
                    className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
                  >
                    <Unlink className="h-4 w-4" />
                    Disconnect
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mx-auto mb-4">
                  <Link2 className="h-8 w-8 text-gray-400" />
                </div>
                <p className="text-gray-600 mb-4">QuickBooks is not connected.</p>
                <button
                  onClick={handleConnect}
                  disabled={connecting}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
                >
                  {connecting ? (
                    <>
                      <RefreshCw className="h-5 w-5 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Link2 className="h-5 w-5" />
                      Connect to QuickBooks
                    </>
                  )}
                </button>
                <p className="text-sm text-gray-500 mt-3">
                  You'll be redirected to Intuit to authorize the connection.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Sync History */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-900">Recent Sync Activity</h2>
            <button
              onClick={fetchSyncLogs}
              className="text-blue-600 hover:text-blue-800 text-sm"
            >
              Refresh
            </button>
          </div>

          <div className="p-6">
            {syncLogs.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Direction</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {syncLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {log.entity_type || log.sync_type}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            log.direction === 'inbound'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-purple-100 text-purple-800'
                          }`}>
                            {log.direction}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            log.status === 'success'
                              ? 'bg-green-100 text-green-800'
                              : log.status === 'failed'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {log.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {log.error_message || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">No sync activity yet.</p>
            )}
          </div>
        </div>

        {/* Environment Info (for debugging during setup) */}
        <div className="mt-6 p-4 bg-gray-100 rounded-lg text-sm text-gray-600">
          <p><strong>Environment:</strong> {import.meta.env.VITE_SUPABASE_URL?.includes('sandbox') ? 'Sandbox' : 'Production'}</p>
          <p><strong>Callback URL:</strong> {import.meta.env.VITE_SUPABASE_URL}/functions/v1/quickbooks-callback</p>
        </div>
      </div>
    </div>
  );
}
