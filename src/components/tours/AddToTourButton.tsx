import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useTours,
  addSiteSubmitToTour,
  removeTourStop,
  fetchSiteSubmitTourStops,
  onTourStopsChanged,
  type SiteSubmitTourMembership,
} from '../../hooks/useTours';

// ---------------------------------------------------------------------------
// AddToTourButton — overlay-first, drop-in staging control.
//
// Minimal clicks: "Add to tour ▾" opens a dropdown of the client's tours; pick one
// to stage this site submit (lands in Unscheduled), or create a new tour inline.
// Tours that already contain it show ✓ and "Remove" on hover; clicking removes the
// stop (confirming first only if the stop carries work: notes, label, approach
// override, or a Leaving-now stamp). The button reads "On N tours ▾" when staged. Takes objectId-style props
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
const TERRACOTTA = '#A27B5C';

// What removing this stop would throw away, for the confirm dialog ([] = no confirm).
function stopWork(m: SiteSubmitTourMembership): string[] {
  const w: string[] = [];
  if (m.notes?.trim()) w.push('notes');
  if (m.display_label?.trim()) w.push('a custom label');
  if (m.approach_waypoints_override != null) w.push('an approach override');
  if (m.actual_departure_at) w.push('a Leaving-now stamp');
  return w;
}

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
  const [members, setMembers] = useState<SiteSubmitTourMembership[]>([]);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const loadMembers = useCallback(async () => {
    if (!siteSubmitId) {
      setMembers([]);
      return;
    }
    try {
      setMembers(await fetchSiteSubmitTourStops(siteSubmitId));
    } catch {
      /* keep the last known state; the menu still works */
    }
  }, [siteSubmitId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);
  // Any add/remove anywhere (this button, another sidebar, the tour panel) can change membership.
  useEffect(() => onTourStopsChanged(null, () => void loadMembers()), [loadMembers]);

  const memberByTour = new Map(members.map((m) => [m.tour_id, m]));

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
      loadMembers();
    } else {
      setStatus(res.error ?? 'Failed to add');
    }
  };

  const unstage = async (m: SiteSubmitTourMembership, tourName: string) => {
    const work = stopWork(m);
    if (
      work.length > 0 &&
      !window.confirm(`Remove this site from "${tourName}"? Its ${work.join(', ')} on that tour will be lost.`)
    )
      return;
    setBusy(true);
    setStatus(null);
    const res = await removeTourStop(m.id);
    setBusy(false);
    setHoverId(null);
    if (res.ok) setStatus('Removed from tour');
    else {
      setStatus(res.error ?? 'Failed to remove');
      loadMembers();
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
        {members.length > 0 ? `On ${members.length} tour${members.length === 1 ? '' : 's'}` : label}{' '}
        <span aria-hidden style={{ fontSize: 10 }}>▾</span>
      </button>

      {open && (
        <div style={dropdownStyle} role="menu">
          {loading && tours.length === 0 && <div style={itemMuted}>Loading tours…</div>}

          {!loading && tours.length === 0 && !creating && (
            <div style={itemMuted}>No tours yet for this client.</div>
          )}

          {!creating &&
            tours.map((t) => {
              const m = memberByTour.get(t.id);
              const removing = !!m && hoverId === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="menuitem"
                  onClick={() => (m ? unstage(m, t.tour_name) : stage(t.id))}
                  onMouseEnter={() => setHoverId(t.id)}
                  onMouseLeave={() => setHoverId((h) => (h === t.id ? null : h))}
                  disabled={busy}
                  title={m ? 'On this tour — click to remove' : 'Add to Unscheduled on this tour'}
                  style={{ ...itemButton, background: removing ? '#FBF6F2' : 'transparent' }}
                >
                  <span style={{ color: MIDNIGHT, fontWeight: 500, display: 'flex', gap: 6, alignItems: 'baseline' }}>
                    <span aria-hidden style={{ width: 12, color: '#2E7D32', fontWeight: 700 }}>{m ? '✓' : ''}</span>
                    <span>
                      {t.tour_name}
                      {t.is_archived ? ' (archived)' : ''}
                    </span>
                  </span>
                  {removing ? (
                    <span style={{ color: TERRACOTTA, fontSize: 12, fontWeight: 600 }}>Remove</span>
                  ) : (
                    <span style={{ color: SLATE, fontSize: 12, whiteSpace: 'nowrap' }}>
                      {t.stop_count} stop{t.stop_count === 1 ? '' : 's'}
                    </span>
                  )}
                </button>
              );
            })}

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
