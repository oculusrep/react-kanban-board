import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

interface DigestComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  siteSubmitId: string;
  siteSubmitName: string | null;
  clientId: string;
  clientName: string | null;
}

interface ActivityRow {
  id: string;
  activity_type: 'comment' | 'file_shared' | 'status_change';
  created_at: string;
  payload: Record<string, any>;
  site_submit_id: string;
}

type Scope = 'site_submit' | 'client_all';
type TimeRange = 'today' | 'since_last_send';

export default function DigestComposeModal({
  isOpen,
  onClose,
  siteSubmitId,
  siteSubmitName,
  clientId,
  clientName,
}: DigestComposeModalProps) {
  const { userTableId } = useAuth();
  const [scope, setScope] = useState<Scope>('site_submit');
  const [timeRange, setTimeRange] = useState<TimeRange>('since_last_send');
  const [customNote, setCustomNote] = useState('');
  const [previewActivity, setPreviewActivity] = useState<ActivityRow[]>([]);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hasPriorSend, setHasPriorSend] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setSuccess(null);
    refreshPreview();
    refreshRecipients();
    checkPriorSend();
  }, [isOpen, scope, timeRange]);

  async function checkPriorSend() {
    let q = supabase
      .from('portal_email_send')
      .select('id')
      .eq('client_id', clientId)
      .eq('direction', 'broker_to_client')
      .eq('status', 'sent')
      .gte('sent_at', startOfTodayLocalIso())
      .limit(1);
    if (scope === 'site_submit') q = q.eq('site_submit_id', siteSubmitId);
    const { data } = await q;
    setHasPriorSend(!!(data && data.length > 0));
  }

  async function refreshPreview() {
    setLoadingPreview(true);
    try {
      let sinceIso: string;
      if (timeRange === 'today') {
        sinceIso = startOfTodayLocalIso();
      } else {
        let lastSendQ = supabase
          .from('portal_email_send')
          .select('sent_at')
          .eq('client_id', clientId)
          .eq('direction', 'broker_to_client')
          .eq('status', 'sent')
          .order('sent_at', { ascending: false })
          .limit(1);
        if (scope === 'site_submit') lastSendQ = lastSendQ.eq('site_submit_id', siteSubmitId);
        const { data: lastSend } = await lastSendQ;
        sinceIso = lastSend?.[0]?.sent_at || startOfTodayLocalIso();
      }

      let q = supabase
        .from('site_submit_activity')
        .select('id, activity_type, created_at, payload, site_submit_id')
        .eq('client_id', clientId)
        .eq('client_visible', true)
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: true });
      if (scope === 'site_submit') q = q.eq('site_submit_id', siteSubmitId);

      const { data, error: queryError } = await q;
      if (queryError) throw queryError;
      setPreviewActivity((data || []) as ActivityRow[]);
    } catch (err) {
      console.error('[DigestComposeModal] Preview error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load preview');
    } finally {
      setLoadingPreview(false);
    }
  }

  async function refreshRecipients() {
    try {
      const { data } = await supabase
        .from('portal_user_client_access')
        .select('contact:contact_id (email, first_name, last_name, email_alerts_opt_in, portal_access_enabled)')
        .eq('client_id', clientId)
        .eq('is_active', true);

      const emails = (data || [])
        .map((row: any) => row.contact)
        .filter((c: any) => c?.email && c?.portal_access_enabled !== false && c?.email_alerts_opt_in !== false)
        .map((c: any) => c.email);
      setRecipients(emails);
    } catch (err) {
      console.error('[DigestComposeModal] Recipients error:', err);
    }
  }

  async function handleSend() {
    if (!userTableId) {
      setError('No authenticated broker user found');
      return;
    }
    if (previewActivity.length === 0) {
      setError('No activity to send in this window');
      return;
    }
    setSending(true);
    setError(null);
    setSuccess(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('send-portal-digest', {
        body: {
          clientId,
          brokerUserId: userTableId,
          scope,
          siteSubmitId: scope === 'site_submit' ? siteSubmitId : undefined,
          timeRange,
          customNote: customNote.trim() || null,
        },
      });

      if (invokeError) throw invokeError;
      if (data && data.success === false) throw new Error(data.error || 'Send failed');

      setSuccess(`Sent to ${recipients.length} recipient${recipients.length === 1 ? '' : 's'}.`);
      setTimeout(onClose, 1500);
    } catch (err: any) {
      console.error('[DigestComposeModal] Send error:', err);
      setError(err?.message || 'Failed to send digest');
    } finally {
      setSending(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: '#8FA9C8' }}>
          <div className="flex items-center gap-2">
            <Bell size={18} style={{ color: '#002147' }} />
            <h3 className="text-base font-semibold" style={{ color: '#002147' }}>Send Update to Client</h3>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Scope */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#002147' }}>Scope</label>
            <div className="flex gap-2">
              <ToggleButton active={scope === 'site_submit'} onClick={() => setScope('site_submit')}>
                This site submit{siteSubmitName ? ` (${siteSubmitName})` : ''}
              </ToggleButton>
              <ToggleButton active={scope === 'client_all'} onClick={() => setScope('client_all')}>
                All today's changes for {clientName || 'client'}
              </ToggleButton>
            </div>
          </div>

          {/* Time range */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#002147' }}>Time range</label>
            <div className="flex gap-2">
              {hasPriorSend && (
                <ToggleButton active={timeRange === 'since_last_send'} onClick={() => setTimeRange('since_last_send')}>
                  Only since last send
                </ToggleButton>
              )}
              <ToggleButton active={timeRange === 'today'} onClick={() => setTimeRange('today')}>
                Everything today
              </ToggleButton>
            </div>
          </div>

          {/* Custom note */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#002147' }}>Custom note (optional)</label>
            <textarea
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              placeholder="Add a personal note that will appear at the top of the email…"
              rows={3}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Preview */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#002147' }}>What will be included</label>
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3 max-h-56 overflow-y-auto">
              {loadingPreview ? (
                <p className="text-sm" style={{ color: '#8FA9C8' }}>Loading…</p>
              ) : previewActivity.length === 0 ? (
                <p className="text-sm" style={{ color: '#8FA9C8' }}>Nothing new in this window. Nothing will be sent.</p>
              ) : (
                <ul className="text-sm space-y-1.5" style={{ color: '#002147' }}>
                  {previewActivity.map((a) => (
                    <li key={a.id}>{describeActivity(a)}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Recipients */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#002147' }}>Sending to</label>
            {recipients.length === 0 ? (
              <p className="text-sm" style={{ color: '#A27B5C' }}>
                No opted-in portal users on this client. Nothing to send.
              </p>
            ) : (
              <p className="text-sm" style={{ color: '#4A6B94' }}>{recipients.join(', ')}</p>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded p-2 text-sm text-red-700">{error}</div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded p-2 text-sm text-green-700">{success}</div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t" style={{ borderColor: '#8FA9C8' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="px-3 py-1.5 text-sm rounded border"
            style={{ borderColor: '#8FA9C8', color: '#4A6B94' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || previewActivity.length === 0 || recipients.length === 0}
            className="px-4 py-1.5 text-sm rounded text-white disabled:opacity-50"
            style={{ backgroundColor: '#002147' }}
          >
            {sending ? 'Sending…' : 'Send via Gmail'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToggleButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1.5 text-sm rounded border"
      style={{
        backgroundColor: active ? '#002147' : 'transparent',
        color: active ? '#FFFFFF' : '#4A6B94',
        borderColor: active ? '#002147' : '#8FA9C8',
      }}
    >
      {children}
    </button>
  );
}

function describeActivity(a: ActivityRow): string {
  const time = new Date(a.created_at).toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
  });
  if (a.activity_type === 'comment') {
    const text = String(a.payload?.text || '');
    return `💬 ${time} — ${text.slice(0, 80)}${text.length > 80 ? '…' : ''}`;
  }
  if (a.activity_type === 'file_shared') {
    return `📎 ${time} — File shared: ${a.payload?.file_name || a.payload?.dropbox_path || 'file'}`;
  }
  if (a.activity_type === 'status_change') {
    return `🔄 ${time} — Stage: ${a.payload?.from_stage_label || '—'} → ${a.payload?.to_stage_label || '—'}`;
  }
  return `${a.activity_type} ${time}`;
}

function startOfTodayLocalIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return new Date(`${y}-${m}-${d}T00:00:00`).toISOString();
}
