import { useEffect, useRef, useState } from 'react';
import { useTours, addSiteSubmitToTour } from '../../hooks/useTours';

// ---------------------------------------------------------------------------
// AddToTourButton — overlay-first, drop-in staging control.
//
// Minimal clicks: "Add to tour ▾" opens a dropdown of the client's tours; pick one
// to stage this site submit, or create a new tour inline. Takes objectId-style props
// (siteSubmitId + clientId) and does NOT read useParams, so it drops into the site
// submit slideout, the details page, or a map pin card unchanged.
// ---------------------------------------------------------------------------

interface AddToTourButtonProps {
  /** The site submit to stage. A tour stop always references a site submit, so this
   *  may be null (e.g. a deal with no linked site submit) — the button disables then. */
  siteSubmitId: string | null | undefined;
  clientId: string | null | undefined;
  /** Optional label override. */
  label?: string;
  /** Reason shown (tooltip) when there is no linked site submit to stage. */
  noSiteSubmitReason?: string;
  /** Called after a successful stage, e.g. to show a toast or refresh. */
  onStaged?: (tourId: string) => void;
}

// OVIS brand palette
const MIDNIGHT = '#002147';
const SLATE = '#8FA9C8';

export function AddToTourButton({
  siteSubmitId,
  clientId,
  label = 'Add to tour',
  noSiteSubmitReason = 'No linked site submit to add to a tour',
  onStaged,
}: AddToTourButtonProps) {
  const { tours, loading, createTour, refresh } = useTours(clientId);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const stage = async (tourId: string) => {
    if (!siteSubmitId) return;
    setBusy(true);
    setStatus(null);
    const res = await addSiteSubmitToTour(tourId, siteSubmitId);
    setBusy(false);
    if (res.ok) {
      setStatus('Added to tour');
      onStaged?.(tourId);
      setOpen(false);
    } else if (res.alreadyStaged) {
      setStatus('Already on that tour');
    } else {
      setStatus(res.error ?? 'Failed to add');
    }
  };

  const handleCreateAndStage = async () => {
    const name = newName.trim();
    if (!name || !siteSubmitId) return;
    setBusy(true);
    setStatus(null);
    const { tour, error: createErr } = await createTour({ tour_name: name });
    if (!tour) {
      setBusy(false);
      setStatus(createErr ? `Failed to create tour: ${createErr}` : 'Failed to create tour');
      return;
    }
    const res = await addSiteSubmitToTour(tour.id, siteSubmitId);
    setBusy(false);
    if (res.ok) {
      setStatus('Tour created & site added');
      onStaged?.(tour.id);
      setNewName('');
      setCreating(false);
      setOpen(false);
    } else {
      setStatus(res.error ?? 'Created tour but failed to add site');
      await refresh();
    }
  };

  const disabledReason = !siteSubmitId
    ? noSiteSubmitReason
    : !clientId
    ? "This record has no client, so it can't be added to a tour."
    : null;

  if (disabledReason) {
    return (
      <button
        type="button"
        disabled
        title={disabledReason}
        style={{ ...buttonStyle, color: SLATE, borderColor: SLATE, cursor: 'not-allowed' }}
      >
        {label}
      </button>
    );
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={buttonStyle}
        disabled={busy}
      >
        {label} <span aria-hidden style={{ fontSize: 10 }}>▾</span>
      </button>

      {open && (
        <div style={dropdownStyle} role="menu">
          {loading && <div style={itemMuted}>Loading tours…</div>}

          {!loading && tours.length === 0 && !creating && (
            <div style={itemMuted}>No tours yet for this client.</div>
          )}

          {!loading &&
            !creating &&
            tours.map((t) => (
              <button
                key={t.id}
                type="button"
                role="menuitem"
                onClick={() => stage(t.id)}
                disabled={busy}
                style={itemButton}
              >
                <span style={{ color: MIDNIGHT, fontWeight: 500 }}>
                  {t.tour_name}
                  {t.is_archived ? ' (archived)' : ''}
                </span>
                <span style={{ color: SLATE, fontSize: 12 }}>
                  {t.stop_count} stop{t.stop_count === 1 ? '' : 's'}
                </span>
              </button>
            ))}

          <div style={{ borderTop: `1px solid ${SLATE}`, margin: '4px 0' }} />

          {creating ? (
            <div style={{ padding: '6px 10px' }}>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateAndStage()}
                placeholder="New tour name"
                style={inputStyle}
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <button type="button" onClick={handleCreateAndStage} disabled={busy || !newName.trim()} style={primaryBtn}>
                  Create & add
                </button>
                <button type="button" onClick={() => setCreating(false)} style={itemButton}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setCreating(true)} style={{ ...itemButton, color: MIDNIGHT, fontWeight: 600 }}>
              + New tour…
            </button>
          )}

          {status && <div style={{ ...itemMuted, color: MIDNIGHT }}>{status}</div>}
        </div>
      )}

      {!open && status && (
        <span style={{ marginLeft: 8, fontSize: 12, color: SLATE }}>{status}</span>
      )}
    </div>
  );
}

// ---- inline styles (brand palette; consistent with map slideouts) ----

const buttonStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 6,
  border: `1px solid ${MIDNIGHT}`,
  background: '#FFFFFF',
  color: MIDNIGHT,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
};

const dropdownStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  marginTop: 4,
  minWidth: 240,
  maxHeight: 320,
  overflowY: 'auto',
  background: '#FFFFFF',
  border: `1px solid ${SLATE}`,
  borderRadius: 8,
  boxShadow: '0 4px 16px rgba(0,33,71,0.15)',
  zIndex: 1000,
  padding: '4px 0',
};

const itemButton: React.CSSProperties = {
  display: 'flex',
  width: '100%',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  padding: '8px 10px',
  border: 'none',
  background: 'transparent',
  textAlign: 'left',
  cursor: 'pointer',
  fontSize: 13,
};

const itemMuted: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: 12,
  color: SLATE,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  border: `1px solid ${SLATE}`,
  borderRadius: 6,
  fontSize: 13,
  boxSizing: 'border-box',
};

const primaryBtn: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 6,
  border: 'none',
  background: MIDNIGHT,
  color: '#FFFFFF',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
};

export default AddToTourButton;
