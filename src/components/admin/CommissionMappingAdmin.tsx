import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Plus, Edit2, Trash2, Save, X, RefreshCw, AlertCircle } from 'lucide-react';

interface QBAccount {
  id: string;
  name: string;
  fullName: string;
  type: string;
  subType?: string;
}

interface QBVendor {
  id: string;
  displayName: string;
  companyName?: string;
}

interface Broker {
  id: string;
  name: string;
}

interface Client {
  id: string;
  client_name: string;
}

interface CommissionMapping {
  id: string;
  entity_type: 'broker' | 'referral_partner';
  broker_id: string | null;
  client_id: string | null;
  broker?: Broker;
  client?: Client;
  qb_vendor_id: string | null;
  qb_vendor_name: string | null;
  payment_method: 'bill' | 'journal_entry';
  qb_debit_account_id: string;
  qb_debit_account_name: string;
  qb_credit_account_id: string | null;
  qb_credit_account_name: string | null;
  description_template: string | null;
  is_active: boolean;
}

interface CommissionMappingAdminProps {
  isConnected: boolean;
}

export default function CommissionMappingAdmin({ isConnected }: CommissionMappingAdminProps) {
  const [mappings, setMappings] = useState<CommissionMapping[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [referralPartners, setReferralPartners] = useState<Client[]>([]);
  const [qbAccounts, setQbAccounts] = useState<QBAccount[]>([]);
  const [qbExpenseAccounts, setQbExpenseAccounts] = useState<QBAccount[]>([]);
  const [qbAssetAccounts, setQbAssetAccounts] = useState<QBAccount[]>([]);
  const [qbVendors, setQbVendors] = useState<QBVendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingQb, setLoadingQb] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Form state for add/edit
  const [formData, setFormData] = useState<Partial<CommissionMapping>>({
    entity_type: 'broker',
    payment_method: 'bill',
    is_active: true
  });

  useEffect(() => {
    fetchMappings();
    fetchBrokers();
    fetchReferralPartners();
  }, []);

  const fetchMappings = async () => {
    try {
      const { data, error } = await supabase
        .from('qb_commission_mapping')
        .select(`
          *,
          broker:broker_id (id, name),
          client:client_id (id, client_name)
        `)
        .order('entity_type', { ascending: true });

      if (error) throw error;
      setMappings(data || []);
    } catch (err: any) {
      console.error('Error fetching mappings:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchBrokers = async () => {
    const { data } = await supabase
      .from('broker')
      .select('id, name')
      .order('name');
    setBrokers(data || []);
  };

  const fetchReferralPartners = async () => {
    const { data } = await supabase
      .from('client')
      .select('id, client_name')
      .eq('sf_client_type', 'Referral Partner')
      .order('client_name');
    setReferralPartners(data || []);
  };

  const fetchQbData = async () => {
    if (!isConnected) return;

    setLoadingQb(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quickbooks-list-accounts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          }
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      setQbAccounts(result.accounts || []);
      setQbExpenseAccounts(result.expenseAccounts || []);
      setQbAssetAccounts(result.assetAccounts || []);
      setQbVendors(result.vendors || []);
    } catch (err: any) {
      console.error('Error fetching QBO data:', err);
      setError(err.message);
    } finally {
      setLoadingQb(false);
    }
  };

  const handleEdit = (mapping: CommissionMapping) => {
    setFormData({
      ...mapping,
      broker_id: mapping.broker_id,
      client_id: mapping.client_id
    });
    setEditingId(mapping.id);
    setShowAddForm(false);
  };

  const handleAdd = () => {
    setFormData({
      entity_type: 'broker',
      payment_method: 'bill',
      is_active: true,
      description_template: 'Commission Payment for {payment_name} - {deal_name}'
    });
    setEditingId(null);
    setShowAddForm(true);
  };

  const handleCancel = () => {
    setFormData({});
    setEditingId(null);
    setShowAddForm(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      // Validate required fields
      if (formData.entity_type === 'broker' && !formData.broker_id) {
        throw new Error('Please select a broker');
      }
      if (formData.entity_type === 'referral_partner' && !formData.client_id) {
        throw new Error('Please select a referral partner');
      }
      if (!formData.qb_debit_account_id) {
        throw new Error('Please select a debit account');
      }
      if (formData.payment_method === 'journal_entry' && !formData.qb_credit_account_id) {
        throw new Error('Journal entries require a credit account');
      }
      if (formData.payment_method === 'bill' && !formData.qb_vendor_id) {
        throw new Error('Bills require a vendor');
      }

      const saveData = {
        entity_type: formData.entity_type,
        broker_id: formData.entity_type === 'broker' ? formData.broker_id : null,
        client_id: formData.entity_type === 'referral_partner' ? formData.client_id : null,
        payment_method: formData.payment_method,
        qb_vendor_id: formData.payment_method === 'bill' ? formData.qb_vendor_id : null,
        qb_vendor_name: formData.payment_method === 'bill' ? formData.qb_vendor_name : null,
        qb_debit_account_id: formData.qb_debit_account_id,
        qb_debit_account_name: formData.qb_debit_account_name,
        qb_credit_account_id: formData.payment_method === 'journal_entry' ? formData.qb_credit_account_id : null,
        qb_credit_account_name: formData.payment_method === 'journal_entry' ? formData.qb_credit_account_name : null,
        description_template: formData.description_template,
        is_active: formData.is_active ?? true
      };

      if (editingId) {
        const { error } = await supabase
          .from('qb_commission_mapping')
          .update(saveData)
          .eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('qb_commission_mapping')
          .insert(saveData);
        if (error) throw error;
      }

      await fetchMappings();
      handleCancel();
    } catch (err: any) {
      console.error('Error saving mapping:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this mapping?')) return;

    try {
      const { error } = await supabase
        .from('qb_commission_mapping')
        .delete()
        .eq('id', id);
      if (error) throw error;
      await fetchMappings();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDebitAccountChange = (accountId: string) => {
    const account = qbAccounts.find(a => a.id === accountId);
    setFormData({
      ...formData,
      qb_debit_account_id: accountId,
      qb_debit_account_name: account?.fullName || account?.name || ''
    });
  };

  const handleCreditAccountChange = (accountId: string) => {
    const account = qbAccounts.find(a => a.id === accountId);
    setFormData({
      ...formData,
      qb_credit_account_id: accountId,
      qb_credit_account_name: account?.fullName || account?.name || ''
    });
  };

  const handleVendorChange = (vendorId: string) => {
    const vendor = qbVendors.find(v => v.id === vendorId);
    setFormData({
      ...formData,
      qb_vendor_id: vendorId,
      qb_vendor_name: vendor?.displayName || ''
    });
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading commission mappings...</div>;
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200 flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Commission Payment Mappings</h2>
          <p className="text-sm text-gray-500 mt-1">
            Configure how broker and referral commissions are recorded in QuickBooks
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchQbData}
            disabled={loadingQb || !isConnected}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loadingQb ? 'animate-spin' : ''}`} />
            {loadingQb ? 'Loading...' : 'Refresh QBO Data'}
          </button>
          <button
            onClick={handleAdd}
            disabled={!isConnected}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add Mapping
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle className="h-4 w-4" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto">&times;</button>
        </div>
      )}

      {!isConnected && (
        <div className="mx-6 mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700">
          Connect to QuickBooks above to configure commission mappings.
        </div>
      )}

      {/* Add/Edit Form */}
      {(showAddForm || editingId) && (
        <div className="p-6 border-b border-gray-200 bg-gray-50">
          <h3 className="font-medium text-gray-900 mb-4">
            {editingId ? 'Edit Mapping' : 'Add New Mapping'}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Entity Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Entity Type</label>
              <select
                value={formData.entity_type || 'broker'}
                onChange={(e) => setFormData({ ...formData, entity_type: e.target.value as 'broker' | 'referral_partner', broker_id: null, client_id: null })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="broker">Broker</option>
                <option value="referral_partner">Referral Partner</option>
              </select>
            </div>

            {/* Broker/Client Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {formData.entity_type === 'broker' ? 'Broker' : 'Referral Partner'}
              </label>
              {formData.entity_type === 'broker' ? (
                <select
                  value={formData.broker_id || ''}
                  onChange={(e) => setFormData({ ...formData, broker_id: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Select a broker...</option>
                  {brokers.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              ) : (
                <select
                  value={formData.client_id || ''}
                  onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Select a referral partner...</option>
                  {referralPartners.map(c => (
                    <option key={c.id} value={c.id}>{c.client_name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Payment Method */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
              <select
                value={formData.payment_method || 'bill'}
                onChange={(e) => setFormData({ ...formData, payment_method: e.target.value as 'bill' | 'journal_entry' })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="bill">Bill (Accounts Payable)</option>
                <option value="journal_entry">Journal Entry (Commission Draw)</option>
              </select>
            </div>

            {/* Vendor (for Bills) */}
            {formData.payment_method === 'bill' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">QBO Vendor</label>
                <select
                  value={formData.qb_vendor_id || ''}
                  onChange={(e) => handleVendorChange(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Select a vendor...</option>
                  {qbVendors.map(v => (
                    <option key={v.id} value={v.id}>{v.displayName}</option>
                  ))}
                </select>
                {qbVendors.length === 0 && (
                  <p className="text-xs text-gray-500 mt-1">Click "Refresh QBO Data" to load vendors</p>
                )}
              </div>
            )}

            {/* Debit Account (Expense) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Debit Account (Expense)</label>
              <select
                value={formData.qb_debit_account_id || ''}
                onChange={(e) => handleDebitAccountChange(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Select an account...</option>
                {qbExpenseAccounts.map(a => (
                  <option key={a.id} value={a.id}>{a.fullName}</option>
                ))}
              </select>
              {qbExpenseAccounts.length === 0 && (
                <p className="text-xs text-gray-500 mt-1">Click "Refresh QBO Data" to load accounts</p>
              )}
            </div>

            {/* Credit Account (for Journal Entries) */}
            {formData.payment_method === 'journal_entry' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Credit Account (Draw/Asset)</label>
                <select
                  value={formData.qb_credit_account_id || ''}
                  onChange={(e) => handleCreditAccountChange(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Select an account...</option>
                  {/* Filter to Balance Sheet accounts only (exclude P&L: Income, Expense, COGS) */}
                  {qbAccounts
                    .filter(a => !['Income', 'Other Income', 'Expense', 'Other Expense', 'Cost of Goods Sold'].includes(a.type))
                    .map(a => (
                      <option key={a.id} value={a.id}>{a.fullName} ({a.type})</option>
                    ))}
                </select>
                {qbAccounts.length === 0 && (
                  <p className="text-xs text-gray-500 mt-1">Click "Refresh QBO Data" to load accounts</p>
                )}
              </div>
            )}

            {/* Description Template */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description Template</label>
              <input
                type="text"
                value={formData.description_template || ''}
                onChange={(e) => setFormData({ ...formData, description_template: e.target.value })}
                placeholder="Commission payment for {deal_name}"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                Available placeholders: {'{deal_name}'}, {'{payment_name}'}, {'{broker_name}'}, {'{payment_date}'}
              </p>
            </div>

            {/* Active Toggle */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                checked={formData.is_active ?? true}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="h-4 w-4 text-blue-600 rounded"
              />
              <label htmlFor="is_active" className="text-sm text-gray-700">Active</label>
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={handleCancel}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <X className="h-4 w-4" />
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Mappings Table */}
      <div className="p-6">
        {mappings.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entity</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Debit Account</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Credit Account</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {mappings.map((mapping) => (
                  <tr key={mapping.id}>
                    <td className="px-4 py-3 text-sm">
                      <div className="font-medium text-gray-900">
                        {mapping.entity_type === 'broker'
                          ? mapping.broker?.name
                          : mapping.client?.client_name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {mapping.entity_type === 'broker' ? 'Broker' : 'Referral Partner'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        mapping.payment_method === 'bill'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-purple-100 text-purple-800'
                      }`}>
                        {mapping.payment_method === 'bill' ? 'Bill' : 'Journal Entry'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {mapping.qb_vendor_name || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {mapping.qb_debit_account_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {mapping.qb_credit_account_name || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        mapping.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {mapping.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      <button
                        onClick={() => handleEdit(mapping)}
                        className="text-blue-600 hover:text-blue-800 mr-2"
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(mapping.id)}
                        className="text-red-600 hover:text-red-800"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <p>No commission mappings configured yet.</p>
            {isConnected && (
              <p className="text-sm mt-2">Click "Add Mapping" to configure how broker commissions are recorded in QuickBooks.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
