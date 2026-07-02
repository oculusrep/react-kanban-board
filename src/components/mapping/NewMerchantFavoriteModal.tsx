import React, { useEffect, useMemo, useState } from 'react';
import MerchantCategoryTree, {
  type MerchantCategoryTreeBrand,
  type MerchantCategoryTreeCategory,
} from './MerchantCategoryTree';

interface NewMerchantFavoriteModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: MerchantCategoryTreeCategory[];
  brands: MerchantCategoryTreeBrand[];
  /** Preloaded brand set — typically the drawer's current selection. */
  initialSelectedBrandIds: Set<string>;
  /** Called with the final name + brand set. Modal closes on success. */
  onSave: (name: string, brandIds: Set<string>) => Promise<void> | void;
  /** For rename: prefills the name field and changes button text. */
  editing?: { id: string; name: string } | null;
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

const NewMerchantFavoriteModal: React.FC<NewMerchantFavoriteModalProps> = ({
  isOpen,
  onClose,
  categories,
  brands,
  initialSelectedBrandIds,
  onSave,
  editing = null,
}) => {
  const [name, setName] = useState(editing?.name ?? '');
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelectedBrandIds));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(editing?.name ?? '');
      setSelected(new Set(initialSelectedBrandIds));
      setError(null);
    }
  }, [isOpen, editing, initialSelectedBrandIds]);

  const brandCount = selected.size;
  const canSave = name.trim().length > 0 && brandCount > 0 && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(name.trim(), selected);
      onClose();
    } catch (e: any) {
      console.error('Save favorite failed:', e);
      setError(e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const title = useMemo(() => (editing ? 'Edit favorite' : 'New favorite'), [editing]);
  const saveLabel = editing ? 'Save changes' : 'Save favorite';

  if (!isOpen) return null;

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
          width: 460,
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
          <span style={{ fontWeight: 600, fontSize: 15 }}>{title}</span>
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

        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${DARK.border}` }}>
          <label
            style={{
              display: 'block',
              fontSize: 12,
              color: DARK.textMuted,
              marginBottom: 4,
              textTransform: 'uppercase',
              letterSpacing: 0.4,
              fontWeight: 600,
            }}
          >
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Starbucks Competition"
            autoFocus
            style={{
              width: '100%',
              padding: '8px 10px',
              fontSize: 14,
              border: `1px solid ${DARK.border}`,
              borderRadius: 6,
              outline: 'none',
              boxSizing: 'border-box',
              background: DARK.inputBg,
              color: DARK.textPrimary,
            }}
          />
          <div
            style={{
              marginTop: 8,
              fontSize: 12,
              color: brandCount === 0 ? DARK.errorText : DARK.textMuted,
            }}
          >
            {brandCount === 0
              ? 'Select at least one brand below.'
              : `${brandCount} brand${brandCount === 1 ? '' : 's'} selected`}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          <MerchantCategoryTree
            categories={categories}
            brands={brands}
            selectedBrandIds={selected}
            onChange={setSelected}
            expandAllByDefault={false}
          />
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
            disabled={!canSave}
            style={{
              padding: '8px 14px',
              fontSize: 13,
              background: canSave ? DARK.accentStrong : DARK.border,
              border: 'none',
              borderRadius: 6,
              color: canSave ? '#0f172a' : DARK.textMuted,
              fontWeight: 600,
              cursor: canSave ? 'pointer' : 'not-allowed',
            }}
          >
            {saving ? 'Saving…' : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewMerchantFavoriteModal;
