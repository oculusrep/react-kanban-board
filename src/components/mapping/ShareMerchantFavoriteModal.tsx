import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

export type SharePermission = 'view' | 'edit';

interface ShareRow {
  user_id: string;
  permission: SharePermission;
}

interface UserRow {
  id: string;
  name: string | null;
  email: string | null;
}

interface ShareMerchantFavoriteModalProps {
  isOpen: boolean;
  onClose: () => void;
  favorite: { id: string; name: string } | null;
  /** The owner's "user".id — excluded from the picker (they already have it). */
  ownerUserId: string | null;
  /** Called after shares are saved so the drawer can refresh its list. */
  onSaved?: () => void | Promise<void>;
}

const DARK = {
  panelBg: '#0f172a',
  subtleBg: '#1e293b',
  border: '#334155',
  textPrimary: '#f1f5f9',
  textSecondary: '#e2e8f0',
  textMuted: '#94a3b8',
  accentStrong: '#60a5fa',
  inputBg: '#1e293b',
  errorText: '#fca5a5',
};

/**
 * Share a merchant favorite with other OVIS users.
 *
 * The sharing model already exists in the database (merchant_favorite_share +
 * RLS: recipients can read, 'edit' recipients can also update the brand set).
 * This modal is the missing UI for it. Writes are owner-only per RLS, so the
 * drawer only offers "Share" on favorites the current user owns.
 */
const ShareMerchantFavoriteModal: React.FC<ShareMerchantFavoriteModalProps> = ({
  isOpen,
  onClose,
  favorite,
  ownerUserId,
  onSaved,
}) => {
  const [users, setUsers] = useState<UserRow[]>([]);
  // Current DB state, so save can diff instead of delete-all + re-insert
  // (which would churn shared_at on every save).
  const [existing, setExisting] = useState<Map<string, SharePermission>>(new Map());
  const [draft, setDraft] = useState<Map<string, SharePermission>>(new Map());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!favorite) return;
    setLoading(true);
    setError(null);
    try {
      const [userRes, shareRes] = await Promise.all([
        supabase
          .from('user')
          .select('id, name, email')
          .eq('active', true)
          .order('name', { ascending: true }),
        supabase
          .from('merchant_favorite_share')
          .select('user_id, permission')
          .eq('favorite_id', favorite.id),
      ]);
      if (userRes.error) throw userRes.error;
      if (shareRes.error) throw shareRes.error;
      setUsers((userRes.data || []).filter((u: UserRow) => u.id !== ownerUserId));
      const map = new Map<string, SharePermission>(
        ((shareRes.data || []) as ShareRow[]).map((s) => [s.user_id, s.permission]),
      );
      setExisting(map);
      setDraft(new Map(map));
    } catch (e: any) {
      console.error('Load favorite shares failed:', e);
      setError(e?.message || 'Failed to load sharing');
    } finally {
      setLoading(false);
    }
  }, [favorite, ownerUserId]);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  const toggleUser = (userId: string) => {
    setDraft((prev) => {
      const next = new Map(prev);
      if (next.has(userId)) next.delete(userId);
      else next.set(userId, 'view');
      return next;
    });
  };

  const setPermission = (userId: string, permission: SharePermission) => {
    setDraft((prev) => {
      const next = new Map(prev);
      if (next.has(userId)) next.set(userId, permission);
      return next;
    });
  };

  const handleSave = async () => {
    if (!favorite) return;
    setSaving(true);
    setError(null);
    try {
      const toDelete = [...existing.keys()].filter((id) => !draft.has(id));
      const toInsert = [...draft.entries()].filter(([id]) => !existing.has(id));
      const toUpdate = [...draft.entries()].filter(
        ([id, perm]) => existing.has(id) && existing.get(id) !== perm,
      );

      if (toDelete.length > 0) {
        const { error: delErr } = await supabase
          .from('merchant_favorite_share')
          .delete()
          .eq('favorite_id', favorite.id)
          .in('user_id', toDelete);
        if (delErr) throw delErr;
      }
      if (toInsert.length > 0) {
        const { error: insErr } = await supabase.from('merchant_favorite_share').insert(
          toInsert.map(([user_id, permission]) => ({
            favorite_id: favorite.id,
            user_id,
            permission,
          })),
        );
        if (insErr) throw insErr;
      }
      for (const [user_id, permission] of toUpdate) {
        const { error: updErr } = await supabase
          .from('merchant_favorite_share')
          .update({ permission })
          .eq('favorite_id', favorite.id)
          .eq('user_id', user_id);
        if (updErr) throw updErr;
      }

      if (onSaved) await onSaved();
      onClose();
    } catch (e: any) {
      console.error('Save favorite shares failed:', e);
      setError(e?.message || 'Failed to save sharing');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !favorite) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 10010,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 420,
          maxWidth: '92vw',
          maxHeight: '85vh',
          background: DARK.panelBg,
          border: `1px solid ${DARK.border}`,
          borderRadius: 10,
          boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
          display: 'flex',
          flexDirection: 'column',
          color: DARK.textPrimary,
        }}
      >
        <div
          style={{
            padding: '14px 16px',
            borderBottom: `1px solid ${DARK.border}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Share favorite</div>
            <div style={{ fontSize: 12, color: DARK.textMuted, marginTop: 2 }}>
              {favorite.name}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: DARK.textMuted,
              fontSize: 22,
              lineHeight: 1,
              padding: 0,
              width: 24,
              height: 24,
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {loading && (
            <div style={{ padding: '10px 16px', fontSize: 13, color: DARK.textMuted }}>
              Loading users…
            </div>
          )}
          {!loading && users.length === 0 && (
            <div style={{ padding: '10px 16px', fontSize: 13, color: DARK.textMuted }}>
              No other active users to share with.
            </div>
          )}
          {!loading &&
            users.map((u) => {
              const shared = draft.has(u.id);
              return (
                <div
                  key={u.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 16px',
                    fontSize: 13,
                    color: DARK.textSecondary,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={shared}
                    onChange={() => toggleUser(u.id)}
                    style={{ width: 16, height: 16, accentColor: DARK.accentStrong, cursor: 'pointer' }}
                    aria-label={`Share with ${u.name || u.email || 'user'}`}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {u.name || u.email || u.id}
                    </div>
                    {u.name && u.email && (
                      <div style={{ fontSize: 11, color: DARK.textMuted }}>{u.email}</div>
                    )}
                  </div>
                  <select
                    value={draft.get(u.id) ?? 'view'}
                    onChange={(e) => setPermission(u.id, e.target.value as SharePermission)}
                    disabled={!shared}
                    style={{
                      fontSize: 12,
                      padding: '4px 6px',
                      background: DARK.inputBg,
                      color: shared ? DARK.textPrimary : DARK.textMuted,
                      border: `1px solid ${DARK.border}`,
                      borderRadius: 6,
                      cursor: shared ? 'pointer' : 'not-allowed',
                    }}
                  >
                    <option value="view">Can view</option>
                    <option value="edit">Can edit</option>
                  </select>
                </div>
              );
            })}
        </div>

        {error && (
          <div
            style={{
              padding: '8px 16px',
              fontSize: 13,
              color: DARK.errorText,
              borderTop: `1px solid ${DARK.border}`,
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            padding: '12px 16px',
            borderTop: `1px solid ${DARK.border}`,
            background: DARK.subtleBg,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              padding: '8px 14px',
              fontSize: 13,
              background: 'transparent',
              border: `1px solid ${DARK.border}`,
              borderRadius: 6,
              color: DARK.textSecondary,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            style={{
              padding: '8px 14px',
              fontSize: 13,
              background: saving || loading ? DARK.border : DARK.accentStrong,
              border: 'none',
              borderRadius: 6,
              color: saving || loading ? DARK.textMuted : '#0f172a',
              fontWeight: 600,
              cursor: saving || loading ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Saving…' : 'Save sharing'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShareMerchantFavoriteModal;
