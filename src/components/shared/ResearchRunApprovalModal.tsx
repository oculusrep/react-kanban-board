import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { geocodingService } from '../../services/geocodingService';
import { usePermissions } from '../../hooks/usePermissions';

interface ResearchRunApprovalModalProps {
  // Exactly one of researchRunId | sweepId. sweepId opens the UNIFIED approval:
  // all staged rows across the sweep's chunk runs, grouped by municipality, with
  // cross-chunk dedupe. researchRunId keeps the original single-run behavior.
  researchRunId?: string;
  sweepId?: string;
  siteSubmitLabel: string;
  onClose: () => void;
  onDone: (summary: { approved_new: number; approved_matched: number; created_municipality_count: number }) => void;
}

interface RunRow {
  id: string;
  triggered_at: string;
  radius_miles: number;
  state: string;
  needs_review: string | null;
  alt_avenues: string | null;
}
interface ChecklistRow {
  boundary_municipality_id: string;
  priority: number;
  status: string;
  notes: string | null;
  muni_name: string;
  muni_kind: string;
}
interface StagingRow {
  id: string;
  research_run_id: string;         // which chunk run staged this (fan-out approve)
  sweep_chunk_index?: number | null;
  boundary_municipality_id: string | null;
  matched_existing_id: string | null;
  approval_state: 'pending' | 'approved' | 'rejected';
  project_name: string | null;
  address: string | null;
  location_description: string | null;
  parcel_boundary_notes: string | null;
  total_housing_units: number | null;
  builder_developer: string | null;
  permit_url: string | null;
  permit_application_date: string | null;
  source: string | null;
  notes: string | null;
  muni_name: string | null;
  muni_kind: string | null;
}
// A committed municipal_project whose centroid is near a staged candidate —
// the soft "possible duplicate" signal (see find_nearby_municipal_projects RPC).
interface NearbyProject {
  municipal_project_id: string;
  project_name: string | null;
  municipality_name: string | null;
  address: string | null;
  distance_m: number;
}

// Supabase RPC errors are PostgrestError objects (not Error instances). Rendering
// them via `String(e)` yields "[object Object]" and hides the real reason —
// e.g. a duplicate-key constraint violation the reviewer needs to see.
function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e !== null) {
    const obj = e as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof obj.message === 'string' && obj.message) parts.push(obj.message);
    if (typeof obj.details === 'string' && obj.details) parts.push(obj.details);
    if (typeof obj.hint    === 'string' && obj.hint)    parts.push(`hint: ${obj.hint}`);
    if (typeof obj.code    === 'string' && obj.code)    parts.push(`code: ${obj.code}`);
    if (parts.length > 0) return parts.join(' — ');
  }
  return String(e);
}

// Great-circle distance in meters — for the in-sweep staging-vs-staging dedupe
// (find_nearby_municipal_projects only compares against COMMITTED projects, so
// two unapproved sibling rows from adjacent chunk windows need this check).
function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Editable subset — the fields the approval UI lets the user override per row.
type Edits = Partial<Pick<StagingRow,
  'project_name' | 'address' | 'location_description' | 'parcel_boundary_notes'
  | 'total_housing_units' | 'builder_developer'
  | 'permit_url' | 'permit_application_date' | 'source' | 'notes'>>;

const EDITABLE_FIELDS: { key: keyof Edits; label: string; type: 'text' | 'number' | 'date' | 'url'; full?: boolean }[] = [
  { key: 'project_name',            label: 'Project name',     type: 'text', full: true },
  { key: 'address',                 label: 'Address (geocoded)', type: 'text', full: true },
  // Location-precision fields the agent captures from sources; reviewer reads these
  // when manually placing the pin / drawing the polygon. Neither feeds geocoding.
  { key: 'location_description',    label: 'Location description (manual-pin hint)', type: 'text', full: true },
  { key: 'parcel_boundary_notes',   label: 'Parcel / boundary notes (polygon hint)', type: 'text', full: true },
  { key: 'total_housing_units',     label: 'Total units',      type: 'number' },
  { key: 'builder_developer',       label: 'Builder',          type: 'text' },
  { key: 'permit_url',              label: 'Permit URL',       type: 'url', full: true },
  { key: 'permit_application_date', label: 'Permit app. date', type: 'date' },
  { key: 'source',                  label: 'Source',           type: 'text', full: true },
  { key: 'notes',                   label: 'Notes',            type: 'text', full: true },
];

export default function ResearchRunApprovalModal({
  researchRunId,
  sweepId,
  siteSubmitLabel,
  onClose,
  onDone,
}: ResearchRunApprovalModalProps) {
  const isSweep = !!sweepId;
  const [run, setRun] = useState<RunRow | null>(null);
  const [sweepState, setSweepState] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<ChecklistRow[]>([]);
  const [staging, setStaging] = useState<StagingRow[]>([]);
  // stagingId -> sibling stagingIds within ~150m in the same sweep.
  const [inSweepDupes, setInSweepDupes] = useState<Record<string, string[]>>({});
  const [edits, setEdits] = useState<Record<string, Edits>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [needsReview, setNeedsReview] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);
  // Soft dedupe: stagingId -> nearby committed projects, plus an in-flight flag.
  const [possibleDupes, setPossibleDupes] = useState<Record<string, NearbyProject[]>>({});
  const [checkingDupes, setCheckingDupes] = useState(false);

  // ---- initial load ----
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        if (isSweep) {
          // ---- unified sweep mode: all staged rows across the sweep's runs ----
          const [{ data: sweepRow, error: swErr }, { data: stagingRows, error: stErr }] = await Promise.all([
            supabase.from('research_sweep').select('state').eq('id', sweepId!).single(),
            supabase.rpc('get_sweep_staging', { p_sweep_id: sweepId! }),
          ]);
          if (swErr) throw swErr;
          if (stErr) throw stErr;
          if (cancelled) return;
          setSweepState((sweepRow as { state?: string } | null)?.state ?? null);
          setRun(null);
          setChecklist([]);
          const stagingNorm: StagingRow[] = ((stagingRows ?? []) as any[]).map((r) => ({
            id: r.id,
            research_run_id: r.research_run_id,
            sweep_chunk_index: r.sweep_chunk_index,
            boundary_municipality_id: r.boundary_municipality_id,
            matched_existing_id: r.matched_existing_id,
            approval_state: r.approval_state,
            project_name: r.project_name,
            address: r.address,
            location_description: r.location_description,
            parcel_boundary_notes: r.parcel_boundary_notes,
            total_housing_units: r.total_housing_units,
            builder_developer: r.builder_developer,
            permit_url: r.permit_url,
            permit_application_date: r.permit_application_date,
            source: r.source,
            notes: r.notes,
            muni_name: r.muni_name,
            muni_kind: r.muni_kind,
          }));
          setStaging(stagingNorm);
          setSelected(new Set(stagingNorm.filter((s) => s.approval_state === 'pending' && !s.matched_existing_id).map((s) => s.id)));
          return;
        }

        // ---- single-run mode (unchanged) ----
        const { data: runRow, error: runErr } = await supabase
          .from('research_run')
          .select('id, triggered_at, radius_miles, state, needs_review, alt_avenues')
          .eq('id', researchRunId!)
          .single();
        if (runErr) throw runErr;

        const [{ data: checklistRows, error: clErr }, { data: stagingRows, error: stErr }] = await Promise.all([
          supabase
            .from('research_checklist_item')
            .select('boundary_municipality_id, priority, status, notes, boundary_municipality(name, kind)')
            .eq('research_run_id', researchRunId!)
            .order('priority'),
          supabase
            .from('municipal_project_staging')
            .select(`
              id, research_run_id, boundary_municipality_id, matched_existing_id, approval_state,
              project_name, address, location_description, parcel_boundary_notes,
              total_housing_units, builder_developer, permit_url,
              permit_application_date, source, notes,
              boundary_municipality(name, kind)
            `)
            .eq('research_run_id', researchRunId!)
            .order('created_at'),
        ]);
        if (clErr) throw clErr;
        if (stErr) throw stErr;
        if (cancelled) return;

        setRun(runRow as RunRow);
        setNeedsReview(runRow?.needs_review ?? '');
        setChecklist((checklistRows ?? []).map((r: any) => ({
          boundary_municipality_id: r.boundary_municipality_id,
          priority: r.priority,
          status: r.status,
          notes: r.notes,
          muni_name: r.boundary_municipality?.name ?? '(unknown)',
          muni_kind: r.boundary_municipality?.kind ?? '',
        })));
        const stagingNorm: StagingRow[] = (stagingRows ?? []).map((r: any) => ({
          ...r,
          muni_name: r.boundary_municipality?.name ?? null,
          muni_kind: r.boundary_municipality?.kind ?? null,
        }));
        setStaging(stagingNorm);
        // Default: select all pending rows that don't match an existing record.
        const defaultSelected = new Set(
          stagingNorm.filter((s) => s.approval_state === 'pending' && !s.matched_existing_id).map((s) => s.id),
        );
        setSelected(defaultSelected);
      } catch (e) {
        setError(toErrorMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [researchRunId, sweepId, isSweep]);

  // ---- soft dedupe: flag staged rows sitting near an already-committed project ----
  // The hard match (matched_existing_id) covers exact name/address + permit_url.
  // This catches the same physical project resurfacing under a DIFFERENT name and
  // address with no shared permit_url: geocode each pending, not-yet-matched row
  // and ask the DB for committed municipal_project centroids within ~150m.
  // Non-blocking — a geocode/RPC failure must never break the approval flow.
  useEffect(() => {
    let cancelled = false;
    const candidates = staging.filter(
      (s) => s.approval_state === 'pending' && !s.matched_existing_id && (s.address ?? '').trim(),
    );
    if (candidates.length === 0) {
      setPossibleDupes({});
      setInSweepDupes({});
      return;
    }
    async function checkNearby() {
      setCheckingDupes(true);
      try {
        const points = (
          await Promise.all(
            candidates.map(async (s) => {
              const g = await geocodingService.geocodeAddress((s.address ?? '').trim());
              return ('latitude' in g && 'longitude' in g)
                ? { staging_id: s.id, lat: g.latitude, lng: g.longitude }
                : null;
            }),
          )
        ).filter(Boolean) as { staging_id: string; lat: number; lng: number }[];

        if (cancelled) return;
        if (points.length === 0) { setPossibleDupes({}); setInSweepDupes({}); return; }

        // In-sweep staging-vs-staging dedupe: rows within 150m of each other are
        // likely the same project surfaced in adjacent chunk windows. (The RPC
        // below only compares against COMMITTED projects, not sibling rows.)
        const siblings: Record<string, string[]> = {};
        for (let i = 0; i < points.length; i++) {
          for (let j = i + 1; j < points.length; j++) {
            if (haversineMeters(points[i], points[j]) <= 150) {
              (siblings[points[i].staging_id] ??= []).push(points[j].staging_id);
              (siblings[points[j].staging_id] ??= []).push(points[i].staging_id);
            }
          }
        }
        setInSweepDupes(siblings);

        const { data, error: rpcErr } = await supabase.rpc('find_nearby_municipal_projects', {
          p_points: points,
          p_radius_meters: 150,
        });
        if (rpcErr) throw rpcErr;
        if (cancelled) return;

        const grouped: Record<string, NearbyProject[]> = {};
        for (const row of (data ?? []) as any[]) {
          (grouped[row.staging_id] ??= []).push({
            municipal_project_id: row.municipal_project_id,
            project_name: row.project_name,
            municipality_name: row.municipality_name,
            address: row.address,
            distance_m: row.distance_m,
          });
        }
        setPossibleDupes(grouped);
      } catch (e) {
        console.warn('Nearby-project dup check failed (non-blocking):', toErrorMessage(e));
      } finally {
        if (!cancelled) setCheckingDupes(false);
      }
    }
    checkNearby();
    return () => { cancelled = true; };
  }, [staging]);

  // ---- group by municipality for display ----
  const grouped = useMemo(() => {
    const m = new Map<string, { name: string; kind: string; rows: StagingRow[] }>();
    for (const r of staging) {
      const key = r.boundary_municipality_id ?? '__none__';
      const display = r.muni_name ?? '(unknown municipality)';
      if (!m.has(key)) m.set(key, { name: display, kind: r.muni_kind ?? '', rows: [] });
      m.get(key)!.rows.push(r);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [staging]);

  const pendingCount   = staging.filter((s) => s.approval_state === 'pending').length;
  const approvedCount  = staging.filter((s) => s.approval_state === 'approved').length;
  const rejectedCount  = staging.filter((s) => s.approval_state === 'rejected').length;
  const matchedExistingCount = staging.filter((s) => s.matched_existing_id && s.approval_state === 'pending').length;
  const possibleDupCount = staging.filter(
    (s) => s.approval_state === 'pending' && !s.matched_existing_id && (possibleDupes[s.id]?.length ?? 0) > 0,
  ).length;

  // ---- handlers ----
  const setEdit = (id: string, key: keyof Edits, value: string) => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
  };
  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const selectAllNew    = () => setSelected(new Set(staging.filter((s) => s.approval_state === 'pending' && !s.matched_existing_id).map((s) => s.id)));
  const selectAllPending = () => setSelected(new Set(staging.filter((s) => s.approval_state === 'pending').map((s) => s.id)));
  const deselectAll     = () => setSelected(new Set());

  const handleReject = async (rowId: string) => {
    setError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc('reject_research_staging_row', { p_staging_id: rowId });
      if (rpcErr) throw rpcErr;
      // Mark as rejected locally
      setStaging((rows) => rows.map((r) => r.id === rowId ? { ...r, approval_state: 'rejected' } : r));
      setSelected((prev) => { const next = new Set(prev); next.delete(rowId); return next; });
      // data: { rejected: bool } — silently ignore false (idempotent no-op)
      void data;
    } catch (e) {
      setError(toErrorMessage(e));
    }
  };

  const handleApprove = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const ids = [...selected].filter((id) => {
        const row = staging.find((s) => s.id === id);
        return row?.approval_state === 'pending';
      });
      if (ids.length === 0) {
        throw new Error('Nothing to approve — select at least one pending row.');
      }

      // Optionally save needs_review if user edited it
      if (run && needsReview !== (run.needs_review ?? '')) {
        const { error: nrErr } = await supabase
          .from('research_run')
          .update({ needs_review: needsReview })
          .eq('id', researchRunId);
        // RLS read-only — this won't work for the user. Best-effort; ignore if blocked.
        // (Future: add a dedicated RPC if editing needs_review is required.)
        if (nrErr) console.warn('needs_review update skipped (RLS):', nrErr.message);
      }

      // Geocode each selected row before submitting so the new municipal_project
      // rows land with a centroid + geocoded_address — without those the
      // Municipal Projects map layer can't render a pin. Mirrors the importer's
      // pre-insert geocode pass.
      const geocodeFailures: string[] = [];
      const payload = await Promise.all(
        ids.map(async (id) => {
          const row = staging.find((s) => s.id === id);
          const e = edits[id] ?? {};
          const finalAddress = (e.address ?? row?.address ?? '').trim();

          let lat: number | null = null;
          let lng: number | null = null;
          let formatted: string | null = null;
          if (finalAddress) {
            const g = await geocodingService.geocodeAddress(finalAddress);
            if ('latitude' in g && 'longitude' in g) {
              lat = g.latitude;
              lng = g.longitude;
              formatted = g.formatted_address ?? null;
            } else {
              geocodeFailures.push(`${row?.project_name ?? id}: ${('error' in g) ? g.error : 'geocode failed'}`);
            }
          }

          return {
            staging_id: id,
            ...(e.project_name        !== undefined ? { project_name:            e.project_name        } : {}),
            ...(e.address             !== undefined ? { address:                 e.address             } : {}),
            ...(e.location_description  !== undefined ? { location_description:  e.location_description  } : {}),
            ...(e.parcel_boundary_notes !== undefined ? { parcel_boundary_notes: e.parcel_boundary_notes } : {}),
            ...(e.total_housing_units !== undefined ? { total_housing_units:     Number(e.total_housing_units) || null } : {}),
            ...(e.builder_developer   !== undefined ? { builder_developer:       e.builder_developer   } : {}),
            ...(e.permit_url          !== undefined ? { permit_url:              e.permit_url          } : {}),
            ...(e.permit_application_date !== undefined ? { permit_application_date: e.permit_application_date } : {}),
            ...(e.source              !== undefined ? { source:                  e.source              } : {}),
            ...(e.notes               !== undefined ? { notes:                   e.notes               } : {}),
            ...(lat !== null && lng !== null ? { latitude: lat, longitude: lng } : {}),
            ...(formatted ? { geocoded_address: formatted } : {}),
          };
        }),
      );

      if (geocodeFailures.length > 0) {
        // Surface but don't block — backfill script can fill these in later.
        console.warn('Geocoding failed for some rows; they will land without a centroid:', geocodeFailures);
      }

      // Fan out per research_run — approve_research_staging_rows rejects a batch
      // spanning runs (and flips one run to 'approved'). In single-run mode this
      // is exactly one group; across a sweep it's one call per chunk run.
      const byRun = new Map<string, typeof payload>();
      for (const row of payload) {
        const rid = staging.find((s) => s.id === row.staging_id)?.research_run_id;
        if (!rid) continue;
        if (!byRun.has(rid)) byRun.set(rid, []);
        byRun.get(rid)!.push(row);
      }
      let approved_new = 0, approved_matched = 0, created_municipality_count = 0;
      for (const rows of byRun.values()) {
        const { data, error: rpcErr } = await supabase.rpc('approve_research_staging_rows', { p_rows: rows });
        if (rpcErr) throw rpcErr;
        approved_new               += (data as any)?.approved_new               ?? 0;
        approved_matched           += (data as any)?.approved_matched           ?? 0;
        created_municipality_count += (data as any)?.created_municipality_count ?? 0;
      }
      onDone({ approved_new, approved_matched, created_municipality_count });
      onClose();
    } catch (e) {
      setError(toErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  // ---- render ----
  // Read-only if the run is in a terminal state OR the user lacks approval
  // permission. Both produce the same UX (view but don't edit/approve/reject).
  const { hasPermission } = usePermissions();
  const canApprove = hasPermission('can_approve_market_research');
  const isReadOnlyRun = !canApprove || (!isSweep && (run?.state === 'approved' || run?.state === 'archived'));
  const inSweepDupCount = staging.filter(
    (s) => s.approval_state === 'pending' && (inSweepDupes[s.id]?.length ?? 0) > 0,
  ).length;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl my-4 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b flex items-start justify-between" style={{ borderColor: '#8FA9C8' }}>
          <div>
            <h3 className="text-lg font-semibold" style={{ color: '#002147' }}>Approve research findings</h3>
            <p className="text-sm mt-1" style={{ color: '#4A6B94' }}>{siteSubmitLabel}</p>
            {run && (
              <p className="text-xs mt-1" style={{ color: '#8FA9C8' }}>
                {run.radius_miles}-mile radius · state: {run.state} · {pendingCount} pending · {approvedCount} approved · {rejectedCount} rejected
              </p>
            )}
            {isSweep && (
              <p className="text-xs mt-1" style={{ color: '#8FA9C8' }}>
                Deep Sweep{sweepState ? ` · ${sweepState}` : ''} · all chunks · {pendingCount} pending · {approvedCount} approved · {rejectedCount} rejected
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-2 py-1 rounded text-sm"
            style={{ color: '#4A6B94' }}
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {loading && <div className="text-sm" style={{ color: '#8FA9C8' }}>Loading…</div>}
          {error && (
            <div className="rounded-md p-3 text-sm border"
                 style={{ borderColor: '#A27B5C', color: '#A27B5C', backgroundColor: '#FFF7F0' }}>
              {error}
            </div>
          )}
          {!loading && !canApprove && (
            <div className="rounded-md p-3 text-sm border"
                 style={{ borderColor: '#8FA9C8', color: '#4A6B94', backgroundColor: '#F8FAFC' }}>
              View-only — you don't have the <code>can_approve_market_research</code> permission. Ask an admin to grant it if you need to approve or reject findings here.
            </div>
          )}

          {!loading && (run || isSweep) && (
            <>
              {/* Checklist (collapsible) — single-run only */}
              {!isSweep && (
              <div className="border rounded-md" style={{ borderColor: '#8FA9C8' }}>
                <button
                  type="button"
                  onClick={() => setShowChecklist((s) => !s)}
                  className="w-full text-left px-3 py-2 text-sm font-medium flex justify-between items-center"
                  style={{ color: '#002147', backgroundColor: '#F8FAFC' }}
                >
                  <span>Per-municipality checklist ({checklist.length})</span>
                  <span style={{ color: '#4A6B94' }}>{showChecklist ? '▲' : '▼'}</span>
                </button>
                {showChecklist && (
                  <div className="px-3 py-2 text-xs space-y-1">
                    {checklist.map((c) => (
                      <div key={c.boundary_municipality_id} className="flex justify-between gap-2">
                        <span style={{ color: '#002147' }}>{c.priority}. {c.muni_name} <span style={{ color: '#8FA9C8' }}>({c.muni_kind})</span></span>
                        <span style={{ color: '#4A6B94' }}>{c.status}{c.notes ? ` — ${c.notes}` : ''}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              )}

              {/* Bulk controls */}
              {!isReadOnlyRun && (
                <div className="flex items-center gap-2 text-xs">
                  <span style={{ color: '#4A6B94' }}>
                    Selected: <b>{selected.size}</b> / {pendingCount} pending
                    {matchedExistingCount > 0 && <span style={{ color: '#A27B5C' }}> · {matchedExistingCount} matches existing</span>}
                    {checkingDupes && <span style={{ color: '#8FA9C8' }}> · checking for nearby projects…</span>}
                    {possibleDupCount > 0 && <span style={{ color: '#A27B5C' }}> · {possibleDupCount} possible duplicate{possibleDupCount === 1 ? '' : 's'} nearby</span>}
                    {inSweepDupCount > 0 && <span style={{ color: '#4A6B94' }}> · {inSweepDupCount} in-sweep duplicate{inSweepDupCount === 1 ? '' : 's'}</span>}
                  </span>
                  <span style={{ color: '#8FA9C8' }}>·</span>
                  <button type="button" onClick={selectAllNew}     className="underline" style={{ color: '#002147' }}>Select all NEW</button>
                  <button type="button" onClick={selectAllPending} className="underline" style={{ color: '#002147' }}>Select all pending</button>
                  <button type="button" onClick={deselectAll}      className="underline" style={{ color: '#4A6B94' }}>Deselect all</button>
                </div>
              )}

              {/* Staged records by municipality */}
              {grouped.length === 0 && (
                <div className="text-sm italic" style={{ color: '#8FA9C8' }}>
                  No staged records {isSweep ? 'in this sweep yet.' : 'on this run.'}
                </div>
              )}
              {grouped.map((g) => (
                <div key={g.name} className="border rounded-md" style={{ borderColor: '#8FA9C8' }}>
                  <div className="px-3 py-2 border-b text-sm font-semibold"
                       style={{ borderColor: '#8FA9C8', backgroundColor: '#F8FAFC', color: '#002147' }}>
                    {g.name} <span style={{ color: '#4A6B94', fontWeight: 400 }}>({g.kind}, {g.rows.length} record{g.rows.length === 1 ? '' : 's'})</span>
                  </div>
                  <div className="divide-y" style={{ borderColor: '#8FA9C8' }}>
                    {g.rows.map((r) => {
                      const isPending = r.approval_state === 'pending';
                      const value = (key: keyof Edits): string => {
                        const e = edits[r.id]?.[key];
                        if (e !== undefined) return String(e ?? '');
                        const v = (r as any)[key];
                        return v == null ? '' : String(v);
                      };
                      return (
                        <div key={r.id} className="px-3 py-2 space-y-2"
                             style={{ backgroundColor: r.approval_state === 'rejected' ? '#F8FAFC' : '#FFFFFF',
                                      opacity: r.approval_state !== 'pending' ? 0.7 : 1 }}>
                          <div className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              checked={selected.has(r.id)}
                              disabled={!isPending || isReadOnlyRun}
                              onChange={() => toggleSelect(r.id)}
                              className="mt-1"
                            />
                            <div className="flex-1">
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                {r.matched_existing_id && (
                                  <span className="px-2 py-0.5 rounded-full border"
                                        style={{ borderColor: '#A27B5C', color: '#A27B5C', backgroundColor: '#FFF7F0' }}>
                                    MATCHES EXISTING
                                  </span>
                                )}
                                {!r.matched_existing_id && (possibleDupes[r.id]?.length ?? 0) > 0 && (
                                  <span
                                    className="px-2 py-0.5 rounded-full border border-dashed"
                                    style={{ borderColor: '#A27B5C', color: '#A27B5C', backgroundColor: '#FFFFFF' }}
                                    title={
                                      'Committed project(s) already on the map nearby — review before approving:\n' +
                                      possibleDupes[r.id]
                                        .map((d) => `• ${d.project_name ?? '(unnamed)'} — ~${Math.round(d.distance_m)}m`
                                          + `${d.municipality_name ? ` (${d.municipality_name})` : ''}`
                                          + `${d.address ? `, ${d.address}` : ''}`)
                                        .join('\n')
                                    }
                                  >
                                    ⚠ POSSIBLE DUPLICATE · ~{Math.round(possibleDupes[r.id][0].distance_m)}m
                                  </span>
                                )}
                                {r.approval_state === 'pending' && (inSweepDupes[r.id]?.length ?? 0) > 0 && (
                                  <span
                                    className="px-2 py-0.5 rounded-full border border-dashed"
                                    style={{ borderColor: '#4A6B94', color: '#4A6B94', backgroundColor: '#FFFFFF' }}
                                    title={`Within ~150m of ${inSweepDupes[r.id].length} other staged row(s) in this sweep — likely the same project surfaced in adjacent chunk windows. Approve only one.`}
                                  >
                                    ⚠ IN-SWEEP DUPLICATE
                                  </span>
                                )}
                                {r.approval_state === 'approved' && (
                                  <span className="px-2 py-0.5 rounded-full"
                                        style={{ backgroundColor: '#002147', color: '#FFFFFF' }}>APPROVED</span>
                                )}
                                {r.approval_state === 'rejected' && (
                                  <span className="px-2 py-0.5 rounded-full border"
                                        style={{ borderColor: '#8FA9C8', color: '#8FA9C8' }}>REJECTED</span>
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-2 mt-2">
                                {EDITABLE_FIELDS.map((f) => (
                                  <div key={f.key} className={f.full ? 'col-span-2' : ''}>
                                    <label className="block text-xs mb-0.5" style={{ color: '#4A6B94' }}>{f.label}</label>
                                    <input
                                      type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                                      value={value(f.key)}
                                      disabled={!isPending || isReadOnlyRun}
                                      onChange={(e) => setEdit(r.id, f.key, e.target.value)}
                                      className="w-full px-2 py-1 text-sm border rounded"
                                      style={{ borderColor: '#8FA9C8', color: '#002147' }}
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                            {isPending && !isReadOnlyRun && (
                              <button
                                type="button"
                                onClick={() => handleReject(r.id)}
                                className="text-xs px-2 py-1 rounded border self-start"
                                style={{ borderColor: '#A27B5C', color: '#A27B5C' }}
                                title="Reject this row (kept for audit)"
                              >
                                Reject
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Needs review — single-run only */}
              {run && (
              <div>
                <label className="block text-sm font-semibold mb-1" style={{ color: '#002147' }}>Needs review</label>
                <textarea
                  rows={3}
                  value={needsReview}
                  disabled={isReadOnlyRun}
                  onChange={(e) => setNeedsReview(e.target.value)}
                  className="w-full px-2 py-1 text-sm border rounded"
                  style={{ borderColor: '#8FA9C8', color: '#002147' }}
                  placeholder="Anything the agent flagged for human review."
                />
                {run.alt_avenues && (
                  <p className="text-xs mt-1" style={{ color: '#4A6B94' }}>
                    Agent alt avenues: {run.alt_avenues}
                  </p>
                )}
              </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t flex justify-end gap-2"
             style={{ borderColor: '#8FA9C8', backgroundColor: '#F8FAFC' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-sm border"
            style={{ borderColor: '#8FA9C8', color: '#4A6B94', backgroundColor: '#FFFFFF' }}
          >
            {isReadOnlyRun ? 'Close' : 'Cancel'}
          </button>
          {!isReadOnlyRun && (
            <button
              type="button"
              onClick={handleApprove}
              disabled={submitting || selected.size === 0}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{
                backgroundColor: selected.size === 0 || submitting ? '#8FA9C8' : '#002147',
                color: '#FFFFFF',
                opacity: selected.size === 0 || submitting ? 0.7 : 1,
              }}
            >
              {submitting ? 'Approving…' : `Approve & Commit (${selected.size})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
