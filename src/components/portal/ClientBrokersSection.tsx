import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

interface BrokerRow {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  is_active: boolean;
  created_at: string | null;
}

interface AvailableBroker {
  id: string;
  name: string;
  email: string;
}

interface ClientBrokersSectionProps {
  clientId: string | null;
  isNewClient: boolean;
}

const BROKER_ROLES = ['admin', 'broker_full', 'va', 'testing'];

export default function ClientBrokersSection({ clientId, isNewClient }: ClientBrokersSectionProps) {
  const { user: authUser } = useAuth();
  const [brokers, setBrokers] = useState<BrokerRow[]>([]);
  const [availableBrokers, setAvailableBrokers] = useState<AvailableBroker[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId || isNewClient) {
      setBrokers([]);
      return;
    }
    loadBrokers();
  }, [clientId, isNewClient]);

  async function loadBrokers() {
    if (!clientId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: loadError } = await supabase
        .from('client_broker')
        .select(`
          id,
          user_id,
          is_active,
          created_at,
          user:user_id (id, first_name, last_name, name, email)
        `)
        .eq('client_id', clientId)
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      if (loadError) throw loadError;

      const rows: BrokerRow[] = (data || [])
        .filter((row: any) => row.user)
        .map((row: any) => {
          const u = row.user;
          const fullName = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.name || u.email || 'Unknown';
          return {
            id: row.id,
            user_id: row.user_id,
            user_name: fullName,
            user_email: u.email || '',
            is_active: row.is_active,
            created_at: row.created_at,
          };
        });

      setBrokers(rows);
    } catch (err) {
      console.error('[ClientBrokersSection] Load error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load brokers');
    } finally {
      setLoading(false);
    }
  }

  async function loadAvailableBrokers() {
    try {
      const { data, error: loadError } = await supabase
        .from('user')
        .select('id, first_name, last_name, name, email, active, ovis_role')
        .or('active.eq.true,active.is.null')
        .in('ovis_role', BROKER_ROLES)
        .order('first_name')
        .order('last_name');

      if (loadError) throw loadError;

      const existingUserIds = new Set(brokers.map((b) => b.user_id));
      const available: AvailableBroker[] = (data || [])
        .filter((u: any) => !existingUserIds.has(u.id))
        .map((u: any) => ({
          id: u.id,
          name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.name || u.email || 'Unknown',
          email: u.email || '',
        }));

      setAvailableBrokers(available);
    } catch (err) {
      console.error('[ClientBrokersSection] Load available error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load available brokers');
    }
  }

  async function handleOpenAdd() {
    setShowAdd(true);
    setSearchTerm('');
    await loadAvailableBrokers();
  }

  async function handleAddBroker(userId: string) {
    if (!clientId) return;
    setAdding(userId);
    setError(null);
    try {
      const { error: insertError } = await supabase.from('client_broker').insert({
        client_id: clientId,
        user_id: userId,
        is_active: true,
        added_by_id: authUser?.id || null,
      });

      if (insertError) throw insertError;

      await loadBrokers();
      setShowAdd(false);
    } catch (err) {
      console.error('[ClientBrokersSection] Add error:', err);
      setError(err instanceof Error ? err.message : 'Failed to add broker');
    } finally {
      setAdding(null);
    }
  }

  async function handleRemove(rowId: string) {
    if (!confirm('Remove this broker from the account? They will stop receiving portal alerts for this client.')) return;
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from('client_broker')
        .update({ is_active: false })
        .eq('id', rowId);

      if (updateError) throw updateError;
      await loadBrokers();
    } catch (err) {
      console.error('[ClientBrokersSection] Remove error:', err);
      setError(err instanceof Error ? err.message : 'Failed to remove broker');
    }
  }

  if (isNewClient) {
    return (
      <div className="border-t border-gray-200 pt-6 mt-6">
        <h3 className="text-base font-semibold mb-2" style={{ color: '#002147' }}>Brokers on this Account</h3>
        <p className="text-sm" style={{ color: '#8FA9C8' }}>
          Save the client first, then add brokers who should receive portal alerts.
        </p>
      </div>
    );
  }

  const filteredAvailable = availableBrokers.filter((b) => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return true;
    return b.name.toLowerCase().includes(term) || b.email.toLowerCase().includes(term);
  });

  return (
    <div className="border-t border-gray-200 pt-6 mt-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-base font-semibold" style={{ color: '#002147' }}>Brokers on this Account</h3>
          <p className="text-xs mt-0.5" style={{ color: '#4A6B94' }}>
            These brokers receive an email when a portal user comments on a site submit for this client.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenAdd}
          className="px-3 py-1.5 rounded text-sm font-medium text-white"
          style={{ backgroundColor: '#002147' }}
        >
          + Add Broker
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-2 mb-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm" style={{ color: '#8FA9C8' }}>Loading…</p>
      ) : brokers.length === 0 ? (
        <p className="text-sm" style={{ color: '#8FA9C8' }}>
          No brokers assigned yet. Portal comment alerts won't be delivered until at least one broker is added.
        </p>
      ) : (
        <ul className="divide-y" style={{ borderColor: '#8FA9C8' }}>
          {brokers.map((b) => (
            <li key={b.id} className="flex items-center justify-between py-2">
              <div>
                <div className="text-sm font-medium" style={{ color: '#002147' }}>{b.user_name}</div>
                <div className="text-xs" style={{ color: '#4A6B94' }}>{b.user_email}</div>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(b.id)}
                className="text-sm px-2 py-1 rounded border"
                style={{ color: '#A27B5C', borderColor: '#A27B5C' }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-base font-semibold" style={{ color: '#002147' }}>Add Broker</h4>
              <button type="button" onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600">
                ✕
              </button>
            </div>
            <input
              type="text"
              autoFocus
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search brokers by name or email…"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm mb-3 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <div className="max-h-80 overflow-y-auto divide-y" style={{ borderColor: '#8FA9C8' }}>
              {filteredAvailable.length === 0 ? (
                <p className="text-sm py-3" style={{ color: '#8FA9C8' }}>No matching brokers found.</p>
              ) : (
                filteredAvailable.map((b) => (
                  <div key={b.id} className="flex items-center justify-between py-2">
                    <div>
                      <div className="text-sm font-medium" style={{ color: '#002147' }}>{b.name}</div>
                      <div className="text-xs" style={{ color: '#4A6B94' }}>{b.email}</div>
                    </div>
                    <button
                      type="button"
                      disabled={adding === b.id}
                      onClick={() => handleAddBroker(b.id)}
                      className="text-sm px-3 py-1 rounded text-white disabled:opacity-50"
                      style={{ backgroundColor: '#4A6B94' }}
                    >
                      {adding === b.id ? 'Adding…' : 'Add'}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
