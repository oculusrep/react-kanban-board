import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { ArrowLeft, Search, Link2, Unlink, RefreshCw, CheckCircle, XCircle, ChevronRight, Plus } from "lucide-react";

interface OvisClient {
  id: string;
  client_name: string;
  parent_id: string | null;
  parent_name?: string;
  qb_customer_id: string | null;
  phone: string | null;
  is_active_client: boolean;
}

interface QBCustomer {
  id: string;
  displayName: string;
  companyName?: string;
  email?: string;
  isSubCustomer: boolean;
  parentId?: string;
  parentName?: string;
  fullyQualifiedName?: string;
  active: boolean;
}

export default function QuickBooksCustomerMappingPage() {
  const navigate = useNavigate();
  const { userRole } = useAuth();

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [ovisClients, setOvisClients] = useState<OvisClient[]>([]);
  const [qbCustomers, setQbCustomers] = useState<QBCustomer[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [qbSearchTerm, setQbSearchTerm] = useState("");
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedClient, setSelectedClient] = useState<OvisClient | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [filterUnlinked, setFilterUnlinked] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [updatingActive, setUpdatingActive] = useState<string | null>(null);
  const [editingParent, setEditingParent] = useState<string | null>(null);
  const [updatingParent, setUpdatingParent] = useState<string | null>(null);
  const [showCreateParentModal, setShowCreateParentModal] = useState(false);
  const [newParentName, setNewParentName] = useState("");
  const [creatingParent, setCreatingParent] = useState(false);
  const [createParentForClientId, setCreateParentForClientId] = useState<string | null>(null); // If set, link the new parent to this client

  useEffect(() => {
    document.title = "Customer Mapping | QuickBooks | OVIS Admin";
    fetchOvisClients();
    fetchQBCustomers();
  }, []);

  const fetchOvisClients = async () => {
    try {
      // Get clients with parent name (fetch all, filter in UI based on showInactive)
      const { data, error } = await supabase
        .from('client')
        .select(`
          id,
          client_name,
          parent_id,
          qb_customer_id,
          phone,
          is_active_client,
          parent:parent_id (
            client_name
          )
        `)
        .order('client_name');

      if (error) throw error;

      const clients = (data || []).map(c => ({
        id: c.id,
        client_name: c.client_name,
        parent_id: c.parent_id,
        parent_name: (c.parent as any)?.client_name || null,
        qb_customer_id: c.qb_customer_id,
        phone: c.phone,
        is_active_client: c.is_active_client ?? true
      }));

      setOvisClients(clients);
    } catch (error) {
      console.error('Error fetching OVIS clients:', error);
      setMessage({ type: 'error', text: 'Failed to load OVIS clients' });
    } finally {
      setLoading(false);
    }
  };

  const fetchQBCustomers = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quickbooks-list-customers`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
          },
          body: JSON.stringify({ maxResults: 1000 })
        }
      );

      const result = await response.json();

      if (result.success) {
        setQbCustomers(result.customers);
      } else if (result.error?.includes('not connected')) {
        // QB not connected - that's okay for viewing
        console.log('QuickBooks not connected');
      } else {
        console.error('Error fetching QB customers:', result.error);
      }
    } catch (error) {
      console.error('Error fetching QB customers:', error);
    }
  };

  const handleSyncClient = async (client: OvisClient) => {
    setSyncing(client.id);
    setMessage(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage({ type: 'error', text: 'You must be logged in' });
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quickbooks-sync-customer`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
          },
          body: JSON.stringify({ clientId: client.id })
        }
      );

      const result = await response.json();

      if (result.success) {
        setMessage({ type: 'success', text: result.message });
        // Refresh data
        await Promise.all([fetchOvisClients(), fetchQBCustomers()]);
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to sync customer' });
      }
    } catch (error: any) {
      console.error('Error syncing customer:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to sync customer' });
    } finally {
      setSyncing(null);
    }
  };

  const handleLinkCustomer = async (qbCustomer: QBCustomer) => {
    if (!selectedClient) return;

    setSyncing(selectedClient.id);
    setMessage(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage({ type: 'error', text: 'You must be logged in' });
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quickbooks-link-customer`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
          },
          body: JSON.stringify({
            clientId: selectedClient.id,
            qbCustomerId: qbCustomer.id,
            qbDisplayName: qbCustomer.displayName
          })
        }
      );

      const result = await response.json();

      if (result.success) {
        setMessage({ type: 'success', text: result.message });
        setShowLinkModal(false);
        setSelectedClient(null);
        await fetchOvisClients();
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to link customer' });
      }
    } catch (error: any) {
      console.error('Error linking customer:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to link customer' });
    } finally {
      setSyncing(null);
    }
  };

  const handleUnlinkCustomer = async (client: OvisClient) => {
    if (!confirm(`Unlink "${client.client_name}" from QuickBooks?`)) return;

    try {
      const { error } = await supabase
        .from('client')
        .update({ qb_customer_id: null })
        .eq('id', client.id);

      if (error) throw error;

      setMessage({ type: 'success', text: `Unlinked "${client.client_name}" from QuickBooks` });
      await fetchOvisClients();
    } catch (error: any) {
      console.error('Error unlinking customer:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to unlink customer' });
    }
  };

  const handleToggleActive = async (client: OvisClient) => {
    setUpdatingActive(client.id);
    try {
      const newValue = !client.is_active_client;
      const { error } = await supabase
        .from('client')
        .update({ is_active_client: newValue })
        .eq('id', client.id);

      if (error) throw error;

      // Update local state
      setOvisClients(prev => prev.map(c =>
        c.id === client.id ? { ...c, is_active_client: newValue } : c
      ));
    } catch (error: any) {
      console.error('Error updating client active status:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to update client' });
    } finally {
      setUpdatingActive(null);
    }
  };

  const handleUpdateParent = async (clientId: string, newParentId: string | null) => {
    setUpdatingParent(clientId);
    const client = ovisClients.find(c => c.id === clientId);
    let parentClient = newParentId ? ovisClients.find(c => c.id === newParentId) : null;

    try {
      // Update parent_id in OVIS
      const { error } = await supabase
        .from('client')
        .update({ parent_id: newParentId })
        .eq('id', clientId);

      if (error) throw error;

      // Update local state for the child
      setOvisClients(prev => prev.map(c =>
        c.id === clientId
          ? { ...c, parent_id: newParentId, parent_name: parentClient?.client_name || undefined }
          : c
      ));

      // Get session for QB API calls
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage({
          type: 'success',
          text: newParentId
            ? `Set parent to "${parentClient?.client_name}" (not logged in for QB sync)`
            : 'Removed parent relationship'
        });
        return;
      }

      // If setting a new parent and parent is NOT linked to QB, create it first
      if (newParentId && parentClient && !parentClient.qb_customer_id) {
        setMessage({ type: 'success', text: `Creating "${parentClient.client_name}" in QuickBooks...` });

        const parentResponse = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quickbooks-sync-customer`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
              'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
            },
            body: JSON.stringify({ clientId: newParentId })
          }
        );

        const parentResult = await parentResponse.json();

        if (parentResult.success) {
          // Update local state with the new QB customer ID for parent
          setOvisClients(prev => prev.map(c =>
            c.id === newParentId
              ? { ...c, qb_customer_id: parentResult.qbCustomerId }
              : c
          ));
          parentClient = { ...parentClient, qb_customer_id: parentResult.qbCustomerId };
        } else {
          setMessage({
            type: 'error',
            text: `Parent set in OVIS but failed to create in QB: ${parentResult.error}`
          });
          return;
        }
      }

      // Now sync the child if it's linked to QB (or create it if not)
      if (client?.qb_customer_id || newParentId) {
        const childResponse = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quickbooks-sync-customer`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
              'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
            },
            body: JSON.stringify({ clientId })
          }
        );

        const childResult = await childResponse.json();

        if (childResult.success) {
          // Update local state with QB customer ID if newly created
          if (!client?.qb_customer_id && childResult.qbCustomerId) {
            setOvisClients(prev => prev.map(c =>
              c.id === clientId
                ? { ...c, qb_customer_id: childResult.qbCustomerId }
                : c
            ));
          }

          const parentCreatedMsg = parentClient && !ovisClients.find(c => c.id === newParentId)?.qb_customer_id
            ? ` (also created "${parentClient.client_name}" in QB)`
            : '';

          setMessage({
            type: 'success',
            text: newParentId
              ? `Set parent to "${parentClient?.client_name}" and synced to QuickBooks${parentCreatedMsg}`
              : 'Removed parent and synced to QuickBooks'
          });
        } else {
          setMessage({
            type: 'error',
            text: `Parent updated in OVIS but child QB sync failed: ${childResult.error}`
          });
        }
      } else {
        setMessage({
          type: 'success',
          text: newParentId
            ? `Set parent to "${parentClient?.client_name}"`
            : 'Removed parent relationship'
        });
      }
    } catch (error: any) {
      console.error('Error updating parent:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to update parent' });
    } finally {
      setUpdatingParent(null);
      setEditingParent(null);
    }
  };

  const handleCreateParentAccount = async () => {
    if (!newParentName.trim()) {
      setMessage({ type: 'error', text: 'Please enter an account name' });
      return;
    }

    // Check if name already exists
    const existingClient = ovisClients.find(
      c => c.client_name.toLowerCase().trim() === newParentName.toLowerCase().trim()
    );
    if (existingClient) {
      setMessage({ type: 'error', text: `A client named "${existingClient.client_name}" already exists` });
      return;
    }

    setCreatingParent(true);
    setMessage(null);

    const childClientId = createParentForClientId;
    const childClient = childClientId ? ovisClients.find(c => c.id === childClientId) : null;

    try {
      // Create the client in OVIS (no parent_id = top-level parent)
      const { data, error } = await supabase
        .from('client')
        .insert({
          client_name: newParentName.trim(),
          is_active_client: true,
          parent_id: null
        })
        .select('id, client_name, parent_id, qb_customer_id, phone, is_active_client')
        .single();

      if (error) throw error;

      // Add to local state
      const newClient: OvisClient = {
        id: data.id,
        client_name: data.client_name,
        parent_id: null,
        parent_name: undefined,
        qb_customer_id: null,
        phone: null,
        is_active_client: true
      };

      setOvisClients(prev => [...prev, newClient].sort((a, b) =>
        a.client_name.localeCompare(b.client_name)
      ));

      // Now sync to QuickBooks
      const { data: { session } } = await supabase.auth.getSession();
      let parentQbCustomerId: string | null = null;

      if (session?.access_token) {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quickbooks-sync-customer`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
              'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
            },
            body: JSON.stringify({ clientId: data.id })
          }
        );

        const result = await response.json();

        if (result.success) {
          parentQbCustomerId = result.qbCustomerId;
          // Update local state with QB customer ID
          setOvisClients(prev => prev.map(c =>
            c.id === data.id ? { ...c, qb_customer_id: result.qbCustomerId } : c
          ));
        }
      }

      // If we're creating for a specific child, link them now
      if (childClientId && childClient) {
        // Update the child's parent_id in OVIS
        const { error: updateError } = await supabase
          .from('client')
          .update({ parent_id: data.id })
          .eq('id', childClientId);

        if (updateError) throw updateError;

        // Update local state for the child
        setOvisClients(prev => prev.map(c =>
          c.id === childClientId
            ? { ...c, parent_id: data.id, parent_name: data.client_name }
            : c
        ));

        // Sync the child to QB with the new parent relationship
        if (session?.access_token) {
          const childResponse = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quickbooks-sync-customer`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
                'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
              },
              body: JSON.stringify({ clientId: childClientId })
            }
          );

          const childResult = await childResponse.json();

          if (childResult.success && childResult.qbCustomerId) {
            // Update child's QB customer ID if it was just created
            setOvisClients(prev => prev.map(c =>
              c.id === childClientId ? { ...c, qb_customer_id: childResult.qbCustomerId } : c
            ));
          }

          setMessage({
            type: 'success',
            text: `Created "${newParentName.trim()}" and linked "${childClient.client_name}" as sub-account`
          });
        } else {
          setMessage({
            type: 'success',
            text: `Created "${newParentName.trim()}" and set as parent for "${childClient.client_name}"`
          });
        }
      } else {
        // No child to link - just report parent creation
        if (parentQbCustomerId) {
          setMessage({
            type: 'success',
            text: `Created "${newParentName.trim()}" in OVIS and QuickBooks`
          });
        } else if (session?.access_token) {
          setMessage({
            type: 'success',
            text: `Created "${newParentName.trim()}" in OVIS (QB sync may have failed)`
          });
        } else {
          setMessage({
            type: 'success',
            text: `Created "${newParentName.trim()}" in OVIS (not logged in for QB sync)`
          });
        }
      }

      // Close modal and reset
      setShowCreateParentModal(false);
      setNewParentName("");
      setCreateParentForClientId(null);
      setEditingParent(null);
    } catch (error: any) {
      console.error('Error creating parent account:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to create parent account' });
    } finally {
      setCreatingParent(false);
    }
  };

  // Get potential parents (clients that are not sub-clients themselves, excluding the current client)
  const getPotentialParents = (clientId: string) => {
    return ovisClients.filter(c =>
      c.id !== clientId && // Not self
      !c.parent_id && // Not already a sub-client
      c.is_active_client // Only active clients as parents
    ).sort((a, b) => a.client_name.localeCompare(b.client_name));
  };

  // Check if there's a potential QB match for a client name
  // Returns { match, type } where type is 'exact', 'close', or 'partial'
  const findPotentialQBMatch = (clientName: string): { match: QBCustomer; type: 'exact' | 'close' | 'partial' } | null => {
    const normalizedName = clientName.toLowerCase().trim();

    // First, look for exact match
    const exactMatch = qbCustomers.find(qb =>
      qb.displayName.toLowerCase().trim() === normalizedName
    );
    if (exactMatch) {
      return { match: exactMatch, type: 'exact' };
    }

    // Next, look for close match (QB name contains full OVIS name)
    // e.g., OVIS: "Acme Corp" matches QB: "Acme Corp - Main Office"
    const closeMatch = qbCustomers.find(qb =>
      qb.displayName.toLowerCase().trim().includes(normalizedName)
    );
    if (closeMatch) {
      return { match: closeMatch, type: 'close' };
    }

    // Finally, look for partial match (OVIS name contains QB name)
    // e.g., OVIS: "Cheeky Monkeys - Nicki Patel" partially matches QB: "Cheeky Monkeys"
    // This is likely a parent/child relationship mismatch - show but mark as partial
    const partialMatch = qbCustomers.find(qb => {
      const qbName = qb.displayName.toLowerCase().trim();
      // Only match if QB name is at least 3 chars and starts with same word
      return qbName.length >= 3 && normalizedName.includes(qbName);
    });
    if (partialMatch) {
      return { match: partialMatch, type: 'partial' };
    }

    return null;
  };

  // Check if there's a discrepancy between OVIS client and linked QB customer
  const hasDiscrepancy = (client: OvisClient): boolean => {
    if (!client.qb_customer_id) return false;

    // Find the linked QB customer
    const qbCustomer = qbCustomers.find(qb => qb.id === client.qb_customer_id);
    if (!qbCustomer) {
      // QB customer not found in our list - might have been deleted, show sync button
      return true;
    }

    // Check name mismatch
    if (client.client_name.toLowerCase().trim() !== qbCustomer.displayName.toLowerCase().trim()) {
      return true;
    }

    // Check parent relationship mismatch
    if (client.parent_id) {
      // Client has a parent in OVIS
      const ovisParent = ovisClients.find(c => c.id === client.parent_id);
      if (ovisParent?.qb_customer_id) {
        // OVIS parent is linked to QB - check if QB customer has the same parent
        if (qbCustomer.parentId !== ovisParent.qb_customer_id) {
          return true;
        }
      } else {
        // OVIS parent is not linked to QB - if QB customer has any parent, that's a mismatch
        // Or if parent is not synced yet, we need to sync
        if (!ovisParent?.qb_customer_id) {
          return true; // Parent needs to be created/linked first
        }
      }
    } else {
      // Client has no parent in OVIS - QB customer should not be a sub-customer
      if (qbCustomer.isSubCustomer) {
        return true;
      }
    }

    return false;
  };

  // Filter clients
  const filteredClients = ovisClients.filter(client => {
    const matchesSearch = client.client_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = !filterUnlinked || !client.qb_customer_id;
    const matchesActive = showInactive || client.is_active_client;
    return matchesSearch && matchesFilter && matchesActive;
  });

  // Filter QB customers for modal
  const filteredQBCustomers = qbCustomers.filter(customer =>
    customer.displayName.toLowerCase().includes(qbSearchTerm.toLowerCase()) ||
    customer.fullyQualifiedName?.toLowerCase().includes(qbSearchTerm.toLowerCase())
  );

  // Stats (based on active clients only, unless showing inactive)
  const activeClients = ovisClients.filter(c => c.is_active_client);
  const displayedClients = showInactive ? ovisClients : activeClients;
  const totalClients = displayedClients.length;
  const linkedClients = displayedClients.filter(c => c.qb_customer_id).length;
  const unlinkedClients = totalClients - linkedClients;
  const inactiveCount = ovisClients.filter(c => !c.is_active_client).length;

  if (userRole !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900">Access Denied</h1>
          <p className="text-gray-600 mt-2">Only administrators can access this page.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading customer mapping...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/admin/quickbooks')}
            className="flex items-center text-blue-600 hover:text-blue-800 mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to QuickBooks Settings
          </button>

          <h1 className="text-3xl font-bold text-gray-900">Customer Mapping</h1>
          <p className="mt-2 text-gray-600">
            Link OVIS clients to QuickBooks customers for accurate invoice syncing.
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

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">Total Clients</p>
            <p className="text-2xl font-bold text-gray-900">{totalClients}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">Linked to QB</p>
            <p className="text-2xl font-bold text-green-600">{linkedClients}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">Not Linked</p>
            <p className="text-2xl font-bold text-orange-600">{unlinkedClients}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow mb-6 p-4">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex-1 min-w-64">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search clients..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filterUnlinked}
                onChange={(e) => setFilterUnlinked(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Show only unlinked</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
              />
              <span className="text-sm text-gray-700">
                Show inactive ({inactiveCount})
              </span>
            </label>
            <button
              onClick={() => {
                fetchOvisClients();
                fetchQBCustomers();
              }}
              className="flex items-center gap-2 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <button
              onClick={() => {
                setCreateParentForClientId(null);
                setShowCreateParentModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white hover:bg-green-700 rounded-lg"
            >
              <Plus className="h-4 w-4" />
              Create Parent Account
            </button>
          </div>
        </div>

        {/* Client List */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">OVIS Clients</h2>
            <span className="text-xs text-gray-500">Active checkbox toggles client status</span>
          </div>

          <div className="divide-y divide-gray-200">
            {filteredClients.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No clients found matching your criteria.
              </div>
            ) : (
              filteredClients.map((client) => (
                <div
                  key={client.id}
                  className={`p-4 hover:bg-gray-50 flex items-center justify-between ${!client.is_active_client ? 'bg-gray-50 opacity-75' : ''}`}
                >
                  {/* Active Checkbox */}
                  <div className="flex items-center mr-4">
                    <input
                      type="checkbox"
                      checked={client.is_active_client}
                      onChange={() => handleToggleActive(client)}
                      disabled={updatingActive === client.id}
                      className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 disabled:opacity-50"
                      title={client.is_active_client ? 'Active client' : 'Inactive client'}
                    />
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${client.is_active_client ? 'text-gray-900' : 'text-gray-500'}`}>
                        {client.client_name}
                      </span>
                      {!client.is_active_client && (
                        <span className="text-xs text-orange-600 bg-orange-100 px-2 py-0.5 rounded">
                          Inactive
                        </span>
                      )}
                    </div>

                    {/* Parent Client Row */}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-gray-500">Parent:</span>
                      {editingParent === client.id ? (
                        <div className="flex items-center gap-2">
                          <select
                            value={client.parent_id || ''}
                            onChange={(e) => {
                              if (e.target.value === '__CREATE_NEW__') {
                                // Open the create parent modal for this client
                                setCreateParentForClientId(client.id);
                                setShowCreateParentModal(true);
                              } else {
                                handleUpdateParent(client.id, e.target.value || null);
                              }
                            }}
                            disabled={updatingParent === client.id}
                            className="text-xs border border-gray-300 rounded px-2 py-1 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 max-w-xs"
                            autoFocus
                          >
                            <option value="">-- No Parent (Top-level) --</option>
                            <option value="__CREATE_NEW__" className="text-green-600 font-medium">+ Create New Parent...</option>
                            {getPotentialParents(client.id).map(parent => (
                              <option key={parent.id} value={parent.id}>
                                {parent.client_name}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => setEditingParent(null)}
                            className="text-xs text-gray-500 hover:text-gray-700"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setEditingParent(client.id)}
                          className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          {client.parent_name || '(none - click to set)'}
                        </button>
                      )}
                    </div>

                    {/* QB Link Status */}
                    {client.qb_customer_id ? (
                      <div className="flex items-center gap-2 mt-1">
                        {hasDiscrepancy(client) ? (
                          <>
                            <RefreshCw className="h-4 w-4 text-orange-500" />
                            <span className="text-sm text-orange-600">
                              Linked (needs sync) - QB ID: {client.qb_customer_id}
                            </span>
                          </>
                        ) : (
                          <>
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            <span className="text-sm text-green-600">
                              Synced - QB ID: {client.qb_customer_id}
                            </span>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mt-1">
                        <XCircle className="h-4 w-4 text-orange-500" />
                        <span className="text-sm text-orange-600">Not linked</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {client.qb_customer_id ? (
                      <>
                        {hasDiscrepancy(client) && (
                          <button
                            onClick={() => handleSyncClient(client)}
                            disabled={syncing === client.id}
                            className="flex items-center gap-1 px-3 py-1.5 text-sm text-orange-600 hover:bg-orange-50 rounded border border-orange-300"
                            title="OVIS data differs from QuickBooks - click to sync"
                          >
                            <RefreshCw className={`h-4 w-4 ${syncing === client.id ? 'animate-spin' : ''}`} />
                            Sync Changes
                          </button>
                        )}
                        <button
                          onClick={() => handleUnlinkCustomer(client)}
                          className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded"
                          title="Unlink from QuickBooks"
                        >
                          <Unlink className="h-4 w-4" />
                          Unlink
                        </button>
                      </>
                    ) : (
                      (() => {
                        const matchResult = findPotentialQBMatch(client.client_name);
                        const potentialMatch = matchResult?.match;
                        const matchType = matchResult?.type;

                        // Exact or close match - suggest linking to that specific customer
                        if (potentialMatch && (matchType === 'exact' || matchType === 'close')) {
                          return (
                            <div className="flex flex-col gap-1 items-end">
                              <div className="text-xs text-blue-600 mb-1">
                                {matchType === 'exact' ? 'Exact match' : 'Found in QB'}: "{potentialMatch.displayName}"
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => {
                                    setSelectedClient(client);
                                    setShowLinkModal(true);
                                    setQbSearchTerm(potentialMatch.displayName);
                                  }}
                                  className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded"
                                  title={`Link to "${potentialMatch.displayName}" or another QB customer`}
                                >
                                  <Link2 className="h-4 w-4" />
                                  Link to QB
                                </button>
                                <button
                                  onClick={() => handleSyncClient(client)}
                                  disabled={syncing === client.id}
                                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded border border-gray-300 disabled:opacity-50"
                                  title="Create a NEW customer in QuickBooks (ignore existing)"
                                >
                                  {syncing === client.id ? (
                                    <RefreshCw className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <CheckCircle className="h-4 w-4" />
                                  )}
                                  Create New
                                </button>
                              </div>
                            </div>
                          );
                        }

                        // Partial match - likely a parent name, show different messaging
                        if (potentialMatch && matchType === 'partial') {
                          return (
                            <div className="flex flex-col gap-1 items-end">
                              <div className="text-xs text-orange-600 mb-1">
                                Similar: "{potentialMatch.displayName}" (may be parent)
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleSyncClient(client)}
                                  disabled={syncing === client.id}
                                  className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 text-white hover:bg-green-700 rounded disabled:opacity-50"
                                  title="Create this customer in QuickBooks (as sub-customer if parent is set)"
                                >
                                  {syncing === client.id ? (
                                    <RefreshCw className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <CheckCircle className="h-4 w-4" />
                                  )}
                                  Create in QB
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedClient(client);
                                    setShowLinkModal(true);
                                    setQbSearchTerm('');
                                  }}
                                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded border border-gray-300"
                                  title="Search and link to an existing QB customer"
                                >
                                  <Link2 className="h-4 w-4" />
                                  Search QB
                                </button>
                              </div>
                            </div>
                          );
                        }

                        // No match found - suggest creating
                        return (
                          <div className="flex flex-col gap-1 items-end">
                            <div className="text-xs text-gray-500 mb-1">
                              No match in QB
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleSyncClient(client)}
                                disabled={syncing === client.id}
                                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 text-white hover:bg-green-700 rounded disabled:opacity-50"
                                title="Create this customer in QuickBooks"
                              >
                                {syncing === client.id ? (
                                  <RefreshCw className="h-4 w-4 animate-spin" />
                                ) : (
                                  <CheckCircle className="h-4 w-4" />
                                )}
                                Create in QB
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedClient(client);
                                  setShowLinkModal(true);
                                  setQbSearchTerm('');
                                }}
                                className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded border border-gray-300"
                                title="Search and link to a QB customer with a different name"
                              >
                                <Link2 className="h-4 w-4" />
                                Search QB
                              </button>
                            </div>
                          </div>
                        );
                      })()
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Link Modal */}
      {showLinkModal && selectedClient && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Link to QuickBooks Customer</h3>
                <p className="text-sm text-gray-600">
                  Linking: <strong>{selectedClient.client_name}</strong>
                </p>
              </div>
              <button
                onClick={() => {
                  setShowLinkModal(false);
                  setSelectedClient(null);
                }}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                &times;
              </button>
            </div>

            <div className="p-4 border-b border-gray-200">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search QuickBooks customers..."
                  value={qbSearchTerm}
                  onChange={(e) => setQbSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {filteredQBCustomers.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {qbCustomers.length === 0 ? (
                    <p>No QuickBooks customers loaded. Make sure QuickBooks is connected.</p>
                  ) : (
                    <p>No customers match your search.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredQBCustomers.map((qbCustomer) => (
                    <button
                      key={qbCustomer.id}
                      onClick={() => handleLinkCustomer(qbCustomer)}
                      disabled={syncing === selectedClient.id}
                      className="w-full p-3 border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 text-left flex items-center justify-between disabled:opacity-50"
                    >
                      <div>
                        <div className="font-medium text-gray-900">
                          {qbCustomer.fullyQualifiedName || qbCustomer.displayName}
                        </div>
                        <div className="text-sm text-gray-500 flex items-center gap-2">
                          <span>ID: {qbCustomer.id}</span>
                          {qbCustomer.isSubCustomer && (
                            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs">
                              Sub-customer
                            </span>
                          )}
                          {qbCustomer.email && <span>{qbCustomer.email}</span>}
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-gray-400" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Parent Account Modal */}
      {showCreateParentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900">Create Parent Account</h3>
              <button
                onClick={() => {
                  setShowCreateParentModal(false);
                  setNewParentName("");
                  setCreateParentForClientId(null);
                }}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                &times;
              </button>
            </div>

            <div className="p-4">
              {createParentForClientId ? (
                <p className="text-sm text-gray-600 mb-4">
                  Create a new parent account for <strong className="text-gray-900">{ovisClients.find(c => c.id === createParentForClientId)?.client_name}</strong>.
                  The new parent will be created in OVIS and QuickBooks, and the child account will be linked automatically.
                </p>
              ) : (
                <p className="text-sm text-gray-600 mb-4">
                  Create a new top-level parent account. This will be added to OVIS and automatically synced to QuickBooks.
                </p>
              )}

              <label className="block text-sm font-medium text-gray-700 mb-2">
                Parent Account Name
              </label>
              <input
                type="text"
                value={newParentName}
                onChange={(e) => setNewParentName(e.target.value)}
                placeholder="e.g., BWW GO"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !creatingParent) {
                    handleCreateParentAccount();
                  }
                }}
              />
            </div>

            <div className="p-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowCreateParentModal(false);
                  setNewParentName("");
                  setCreateParentForClientId(null);
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                disabled={creatingParent}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateParentAccount}
                disabled={creatingParent || !newParentName.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creatingParent ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    {createParentForClientId ? 'Create & Link' : 'Create Account'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
