import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
  // Fired when a run is closed out as reviewed (all rejected / nothing to commit).
  onReviewed?: () => void;
  // Sweep mode only: fired after the failed chunks are handed back to the engine.
  onRerun?: (summary: { reset_count: number; healed_count: number }) => void;
}

// One gap chunk (a 6-month window whose Deep run didn't land) to be re-fired.
interface SweepGap {
  chunk_index: number;
  window_start: string;
  window_end: string;
}
// Authoritative gap classification from get_sweep_gaps (keyed off RUN state, not
// chunk state — so chunks whose run succeeded after a premature timeout are NOT
// treated as gaps and never re-fired/duplicated).
interface SweepGapInfo {
  sweep_state: string | null;
  gap_count: number;
  healable_count: number;
  gaps: SweepGap[];
}

// Re-run cost estimate scales with the number of gap chunks. This is a FLOOR:
// the Aug 10 Hall County sweep ran ~$5.3/chunk on a dense county, inflated by an
// (unrelated, now-fixed on the OpenClaw side) bug routing PDF reads to Opus.
// TODO: re-baseline against a post-fix Deep run before tightening this number.
const PER_CHUNK_COST_USD = 3;

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

// A gap chunk window (YYYY-MM-DD) → "Mon YYYY" for the re-run confirmation.
function fmtWindow(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
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

// Normalized project name for fuzzy in-sweep matching: lowercase, drop
// parenthetical case codes (RZ/PRD/PUD numbers), strip punctuation, collapse
// whitespace. Keeps section/phase words ("Area 7", "Section IIIA") intact so they
// act as differentiators — that's what keeps distinct phases in separate cards.
function normalizeProjectName(name: string | null): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')       // "(RZ 24-001)", "(RZ25-02-01)"
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
// The name with phase/section identifiers stripped — digit tokens ("7", "4a") and
// roman-numeral tokens ("iii", "iiia"). Two names with the SAME core but DIFFERENT
// originals differ only by a phase number ("Section I" vs "Section II") — almost
// always distinct phases of one development, not duplicates. We use this to stop
// near-identical phase names from grouping on name alone (they still group if the
// unit counts also agree).
function corePhaseless(norm: string): string {
  return norm
    .split(' ')
    .filter((t) => t && !/^\d+[a-z]?$/.test(t) && !/^[ivxlcdm]+[a-z]?$/.test(t))
    .join(' ');
}

// Sørensen–Dice coefficient over character bigrams — cheap fuzzy string similarity
// in [0,1]. 1.0 = identical; ~0.82+ = near-identical (only a generic suffix like
// "Subdivision" differs); ~0.6 = same core name with a differing phase/section
// token. Used with a unit-count tie-breaker for the in-sweep NAME dedupe.
function diceCoefficient(a: string, b: string): number {
  if (a === b) return a.length > 0 ? 1 : 0;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const A = bigrams(a), B = bigrams(b);
  let overlap = 0, sizeA = 0, sizeB = 0;
  A.forEach((c) => { sizeA += c; });
  B.forEach((c) => { sizeB += c; });
  A.forEach((c, g) => { const bc = B.get(g); if (bc) overlap += Math.min(c, bc); });
  return (2 * overlap) / (sizeA + sizeB);
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
  onReviewed,
  onRerun,
}: ResearchRunApprovalModalProps) {
  const isSweep = !!sweepId;
  const [run, setRun] = useState<RunRow | null>(null);
  const [sweepState, setSweepState] = useState<string | null>(null);
  const [gapInfo, setGapInfo] = useState<SweepGapInfo | null>(null);
  const [rerunConfirm, setRerunConfirm] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const [checklist, setChecklist] = useState<ChecklistRow[]>([]);
  const [staging, setStaging] = useState<StagingRow[]>([]);
  // stagingId -> sibling stagingIds within ~150m in the same sweep.
  const [inSweepDupes, setInSweepDupes] = useState<Record<string, string[]>>({});
  // stagingId set for rows whose address only geocoded to a street/region centroid
  // (not an address-level point). Proximity dedupe is unreliable for these — every
  // project on the same road collapses to one point — so they're EXCLUDED from
  // both dedupe checks and flagged with a note instead of a false duplicate.
  const [lowPrecisionGeo, setLowPrecisionGeo] = useState<Set<string>>(new Set());
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
  // Triage view state. Rows render compact (one summary line) by default; the
  // reviewer expands the ones they want to edit. Bulk buckets (clean / decided)
  // collapse so the screen leads with the decisions that actually need judgment.
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [showClean, setShowClean] = useState(false);
  const [showDecided, setShowDecided] = useState(false);
  // Per-cluster chosen keeper (stagingId). Defaults to the first member.
  const [keeperByCluster, setKeeperByCluster] = useState<Record<string, string>>({});
  // Staging ids the reviewer pulled out of a NAME cluster ("not a duplicate" /
  // "separate phase"). Excluded from name-clustering so they drop back into the
  // normal flow. Name matching is fuzzy, so breaking a false group must be easy.
  const [dismissedNameDup, setDismissedNameDup] = useState<Set<string>>(new Set());

  // ---- initial load ----
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        if (isSweep) {
          // ---- unified sweep mode: all staged rows across the sweep's runs ----
          const [{ data: sweepRow, error: swErr }, { data: stagingRows, error: stErr }, { data: gaps }] = await Promise.all([
            supabase.from('research_sweep').select('state').eq('id', sweepId!).single(),
            supabase.rpc('get_sweep_staging', { p_sweep_id: sweepId! }),
            // Non-blocking: a gap-lookup failure must never break the approval view.
            supabase.rpc('get_sweep_gaps', { p_sweep_id: sweepId! }),
          ]);
          if (swErr) throw swErr;
          if (stErr) throw stErr;
          if (cancelled) return;
          setSweepState((sweepRow as { state?: string } | null)?.state ?? null);
          setGapInfo((gaps as SweepGapInfo | null) ?? null);
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
      setLowPrecisionGeo(new Set());
      return;
    }
    async function checkNearby() {
      setCheckingDupes(true);
      try {
        // Geocode every candidate, capturing precision. A street-only address
        // ("Baker Place Road") geocodes to the road centroid (GEOMETRIC_CENTER),
        // so EVERY project on that road lands on the same point — proximity can't
        // tell them apart. We keep those points out of the 150m math and flag the
        // rows instead, rather than emit a wall of false duplicates.
        const geocoded = (
          await Promise.all(
            candidates.map(async (s) => {
              const g = await geocodingService.geocodeAddress((s.address ?? '').trim());
              if (!('latitude' in g && 'longitude' in g)) return null;
              const lowPrecision = g.location_type === 'GEOMETRIC_CENTER' || g.location_type === 'APPROXIMATE';
              return { staging_id: s.id, lat: g.latitude, lng: g.longitude, lowPrecision };
            }),
          )
        ).filter(Boolean) as { staging_id: string; lat: number; lng: number; lowPrecision: boolean }[];

        if (cancelled) return;

        setLowPrecisionGeo(new Set(geocoded.filter((p) => p.lowPrecision).map((p) => p.staging_id)));

        // Only address-level points feed the proximity checks.
        const points = geocoded.filter((p) => !p.lowPrecision);
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
          p_points: points.map((p) => ({ staging_id: p.staging_id, lat: p.lat, lng: p.lng })),
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

  // Staging rows keyed by id — resolve sibling ids to their row (cluster members,
  // comparison panels).
  const stagingById = useMemo(() => {
    const m = new Map<string, StagingRow>();
    for (const r of staging) m.set(r.id, r);
    return m;
  }, [staging]);

  // ---- in-sweep duplicate CLUSTERS: connected components over the sibling graph
  // among still-pending rows. Two chunk windows can surface the same project 3–4×;
  // grouping them into one "keep one" card beats scattering badges across the list.
  const clusters = useMemo(() => {
    const pendingIds = Object.keys(inSweepDupes).filter(
      (id) => stagingById.get(id)?.approval_state === 'pending',
    );
    const parent: Record<string, string> = {};
    const find = (x: string): string => {
      parent[x] ??= x;
      return parent[x] === x ? x : (parent[x] = find(parent[x]));
    };
    for (const id of pendingIds) {
      for (const sib of inSweepDupes[id] ?? []) {
        if (stagingById.get(sib)?.approval_state === 'pending') parent[find(id)] = find(sib);
      }
    }
    const groups = new Map<string, StagingRow[]>();
    for (const id of pendingIds) {
      const row = stagingById.get(id);
      if (!row) continue;
      const root = find(id);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root)!.push(row);
    }
    return [...groups.entries()]
      .map(([id, members]) => ({
        id,
        members: members.slice().sort(
          (a, b) => (a.sweep_chunk_index ?? 0) - (b.sweep_chunk_index ?? 0)
            || (a.project_name ?? '').localeCompare(b.project_name ?? ''),
        ),
      }))
      .filter((c) => c.members.length >= 2)          // a lone remaining row isn't a cluster
      .sort((a, b) => b.members.length - a.members.length);
  }, [inSweepDupes, stagingById]);
  const clusterMemberIds = useMemo(
    () => new Set(clusters.flatMap((c) => c.members.map((m) => m.id))),
    [clusters],
  );

  // ---- in-sweep NAME clusters (Balanced): fuzzy-match pending rows by normalized
  // name, with unit count as a secondary signal. Runs on rows the geographic check
  // didn't already pair — INCLUDING approx-location rows — so same-named copies in
  // different chunks still get grouped. Kept SEPARATE from the geographic clusters
  // (lower confidence: phases share names) and easy to break apart (dismissedNameDup).
  const NAME_STRONG = 0.82;      // near-identical name -> group regardless of units
  const NAME_WITH_UNITS = 0.6;   // moderately similar name + equal unit count -> group
  const nameClusters = useMemo(() => {
    const rows = staging.filter(
      (s) => s.approval_state === 'pending' && !s.matched_existing_id
        && !clusterMemberIds.has(s.id) && !dismissedNameDup.has(s.id)
        && normalizeProjectName(s.project_name).length >= 4,
    );
    const norm = new Map(rows.map((r) => [r.id, normalizeProjectName(r.project_name)]));
    const parent: Record<string, string> = {};
    const find = (x: string): string => {
      parent[x] ??= x;
      return parent[x] === x ? x : (parent[x] = find(parent[x]));
    };
    const unitAgree = (a: StagingRow, b: StagingRow) =>
      a.total_housing_units != null && a.total_housing_units === b.total_housing_units;
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const na = norm.get(rows[i].id)!, nb = norm.get(rows[j].id)!;
        const sim = diceCoefficient(na, nb);
        // Names that differ ONLY by a phase/section numeral are treated as distinct
        // phases: they group only if unit counts also agree, never on name alone.
        const phaseOnly = na !== nb && corePhaseless(na) === corePhaseless(nb);
        const units = unitAgree(rows[i], rows[j]);
        const group = (units && sim >= NAME_WITH_UNITS) || (sim >= NAME_STRONG && !phaseOnly);
        if (group) parent[find(rows[i].id)] = find(rows[j].id);
      }
    }
    const groups = new Map<string, StagingRow[]>();
    for (const r of rows) {
      const root = find(r.id);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root)!.push(r);
    }
    return [...groups.entries()]
      .map(([id, members]) => {
        const sorted = members.slice().sort(
          (a, b) => (a.sweep_chunk_index ?? 0) - (b.sweep_chunk_index ?? 0)
            || (a.project_name ?? '').localeCompare(b.project_name ?? ''),
        );
        const u0 = sorted[0].total_housing_units;
        const unitsAgree = u0 != null && sorted.every((m) => m.total_housing_units === u0);
        return { id, members: sorted, unitsAgree };
      })
      .filter((c) => c.members.length >= 2)
      .sort((a, b) => b.members.length - a.members.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staging, clusterMemberIds, dismissedNameDup]);
  const nameClusterMemberIds = useMemo(
    () => new Set(nameClusters.flatMap((c) => c.members.map((m) => m.id))),
    [nameClusters],
  );

  const pendingCount   = staging.filter((s) => s.approval_state === 'pending').length;
  const approvedCount  = staging.filter((s) => s.approval_state === 'approved').length;
  const rejectedCount  = staging.filter((s) => s.approval_state === 'rejected').length;

  // Per-row dedupe flags — drives which triage bucket a row lands in and which
  // comparison panels render. matched = hard match; possible = near a committed
  // project; inSweep = near a sibling staged row in this same sweep.
  const rowFlags = (r: StagingRow) => {
    const matched = !!r.matched_existing_id;
    return {
      matched,
      possible: !matched && (possibleDupes[r.id]?.length ?? 0) > 0,
      inSweep: (inSweepDupes[r.id]?.length ?? 0) > 0,
    };
  };
  const isFlagged = (r: StagingRow) => {
    const f = rowFlags(r);
    // Low-precision rows count as "needs attention": the dup check couldn't run,
    // so they must not be quietly filed under "clean & ready".
    return f.matched || f.possible || f.inSweep || (!f.matched && lowPrecisionGeo.has(r.id));
  };

  // Triage: split every row into the section it belongs to. In-sweep cluster
  // members are rendered inside their cluster card (see `clusters`), so they're
  // excluded here. Everything else: flagged pending -> needs attention; clean
  // pending -> ready; approved/rejected -> decided.
  const triage = useMemo(() => {
    const needsAttention: StagingRow[] = [];
    const clean: StagingRow[] = [];
    const approved: StagingRow[] = [];
    const rejected: StagingRow[] = [];
    const byName = (a: StagingRow, b: StagingRow) =>
      (a.muni_name ?? '').localeCompare(b.muni_name ?? '')
      || (a.project_name ?? '').localeCompare(b.project_name ?? '');
    for (const r of staging) {
      if (r.approval_state === 'approved') { approved.push(r); continue; }
      if (r.approval_state === 'rejected') { rejected.push(r); continue; }
      // Members of a location or name cluster render in their cluster card.
      if (clusterMemberIds.has(r.id) || nameClusterMemberIds.has(r.id)) continue;
      (isFlagged(r) ? needsAttention : clean).push(r);
    }
    return {
      needsAttention: needsAttention.sort(byName),
      clean: clean.sort(byName),
      approved: approved.sort(byName),
      rejected: rejected.sort(byName),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staging, clusterMemberIds, nameClusterMemberIds, possibleDupes, inSweepDupes, lowPrecisionGeo]);

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
  const deselectAll     = () => setSelected(new Set());

  const handleReject = async (rowId: string) => {
    setError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc('reject_research_staging_row', { p_staging_id: rowId });
      if (rpcErr) throw rpcErr;
      // Mark as rejected locally
      setStaging((rows) => rows.map((r) => r.id === rowId ? { ...r, approval_state: 'rejected' } : r));
      setSelected((prev) => { const next = new Set(prev); next.delete(rowId); return next; });
      // If that was the last pending row, the RPC auto-closed the run as reviewed.
      if ((data as { run_reviewed?: boolean } | null)?.run_reviewed) {
        setRun((prev) => (prev ? { ...prev, state: 'archived' } : prev));
        onReviewed?.();
      }
    } catch (e) {
      setError(toErrorMessage(e));
    }
  };

  // Reverse a reject: flip the row back to pending and re-select it. If the run
  // had auto-closed on the last reject, the RPC re-opens it to awaiting_review.
  const handleUnreject = async (rowId: string) => {
    setError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc('unreject_research_staging_row', { p_staging_id: rowId });
      if (rpcErr) throw rpcErr;
      if (!(data as { unrejected?: boolean } | null)?.unrejected) return;
      setStaging((rows) => rows.map((r) => r.id === rowId ? { ...r, approval_state: 'pending' } : r));
      // Re-select unless it hard-matches an existing record (those default off).
      const row = staging.find((s) => s.id === rowId);
      if (!row?.matched_existing_id) {
        setSelected((prev) => { const next = new Set(prev); next.add(rowId); return next; });
      }
      if ((data as { run_reopened?: boolean } | null)?.run_reopened) {
        setRun((prev) => (prev ? { ...prev, state: 'awaiting_review' } : prev));
      }
    } catch (e) {
      setError(toErrorMessage(e));
    }
  };

  // In-sweep dedupe resolver: keep the given row and reject its still-pending
  // siblings in one action. Each reject is reversible (Undo), so this is a fast
  // path, not a commitment. Rejects sequentially — the RPC also auto-closes the
  // run on the last pending row, which we reflect via run_reviewed.
  const handleKeepOne = async (keepId: string, siblingIds: string[]) => {
    setError(null);
    const targets = siblingIds.filter((id) => stagingById.get(id)?.approval_state === 'pending');
    try {
      for (const id of targets) {
        const { data, error: rpcErr } = await supabase.rpc('reject_research_staging_row', { p_staging_id: id });
        if (rpcErr) throw rpcErr;
        setStaging((rows) => rows.map((r) => r.id === id ? { ...r, approval_state: 'rejected' } : r));
        setSelected((prev) => { const next = new Set(prev); next.delete(id); return next; });
        if ((data as { run_reviewed?: boolean } | null)?.run_reviewed) {
          setRun((prev) => (prev ? { ...prev, state: 'archived' } : prev));
          onReviewed?.();
        }
      }
      // Make sure the kept row is selected for commit.
      if (stagingById.get(keepId)?.approval_state === 'pending') {
        setSelected((prev) => { const next = new Set(prev); next.add(keepId); return next; });
      }
    } catch (e) {
      setError(toErrorMessage(e));
    }
  };

  // Explicit close-out for a run sitting all-rejected (nothing left to commit).
  const handleMarkReviewed = async () => {
    if (!run) return;
    setError(null);
    setSubmitting(true);
    try {
      const { data, error: rpcErr } = await supabase.rpc('mark_research_run_reviewed', { p_run_id: run.id });
      if (rpcErr) throw rpcErr;
      if ((data as { reviewed?: boolean })?.reviewed) {
        setRun((prev) => (prev ? { ...prev, state: 'archived' } : prev));
        onReviewed?.();
        onClose();
      } else {
        setError('Could not mark reviewed — the run still has pending records.');
      }
    } catch (e) {
      setError(toErrorMessage(e));
    } finally {
      setSubmitting(false);
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
  const canRun = hasPermission('can_run_market_research');
  // Re-run is offered only on a FINISHED sweep that still has real gaps.
  const canRerunGaps =
    isSweep && canRun && !!gapInfo && gapInfo.gap_count > 0
    && gapInfo.sweep_state !== 'running' && gapInfo.sweep_state !== 'cancelled';
  const rerunCostLabel = `~$${(gapInfo?.gap_count ?? 0) * PER_CHUNK_COST_USD}`;

  const handleRerunGaps = async () => {
    if (!sweepId) return;
    setError(null);
    setRerunning(true);
    try {
      const { data, error: rerr } = await supabase.rpc('rerun_sweep_gaps', { p_sweep_id: sweepId });
      if (rerr) throw rerr;
      const res = (data ?? {}) as { reset_count?: number; healed_count?: number };
      onRerun?.({ reset_count: res.reset_count ?? 0, healed_count: res.healed_count ?? 0 });
      onClose();
    } catch (e) {
      setError(toErrorMessage(e));
      setRerunConfirm(false);
    } finally {
      setRerunning(false);
    }
  };
  const isReadOnlyRun = !canApprove || (!isSweep && (run?.state === 'approved' || run?.state === 'archived'));
  const cleanSelectable = triage.clean.filter((r) => !r.matched_existing_id).map((r) => r.id);

  // ---- compact-row render helpers ----
  const toggleExpand = (id: string) =>
    setExpandedRows((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  // One-line identity for the compact summary.
  const rowSummaryLine = (r: StagingRow) =>
    [
      r.muni_name,
      (edits[r.id]?.address ?? r.address) || 'no address',
      r.total_housing_units != null ? `${r.total_housing_units} units` : null,
      r.sweep_chunk_index != null ? `chunk ${r.sweep_chunk_index}` : null,
    ].filter(Boolean).join(' · ');

  // Status/flag chips shown inline on the summary line.
  const rowBadges = (r: StagingRow) => {
    const f = rowFlags(r);
    return (
      <>
        {f.matched && (
          <span className="px-1.5 py-0.5 rounded-full border text-xs whitespace-nowrap"
                style={{ borderColor: '#A27B5C', color: '#A27B5C', backgroundColor: '#FFF7F0' }}>MATCHES EXISTING</span>
        )}
        {f.possible && (
          <span className="px-1.5 py-0.5 rounded-full border border-dashed text-xs whitespace-nowrap"
                style={{ borderColor: '#A27B5C', color: '#A27B5C' }}>
            ⚠ POSSIBLE DUP · ~{Math.round(possibleDupes[r.id][0].distance_m)}m
          </span>
        )}
        {r.approval_state === 'pending' && !f.matched && lowPrecisionGeo.has(r.id) && (
          <span className="px-1.5 py-0.5 rounded-full border border-dashed text-xs whitespace-nowrap"
                style={{ borderColor: '#8FA9C8', color: '#8FA9C8' }} title="Address only geocoded to a street/area centroid — dup-check skipped. Compare by hand.">
            ℹ APPROX. LOCATION
          </span>
        )}
        {r.approval_state === 'approved' && (
          <span className="px-1.5 py-0.5 rounded-full text-xs" style={{ backgroundColor: '#002147', color: '#FFFFFF' }}>APPROVED</span>
        )}
        {r.approval_state === 'rejected' && (
          <span className="px-1.5 py-0.5 rounded-full border text-xs" style={{ borderColor: '#8FA9C8', color: '#8FA9C8' }}>REJECTED</span>
        )}
      </>
    );
  };

  // Comparison context shown when a row is expanded (possible-dup vs committed +
  // the low-precision explanation). In-sweep siblings live in cluster cards.
  const comparisonPanels = (r: StagingRow) => (
    <>
      {!r.matched_existing_id && (possibleDupes[r.id]?.length ?? 0) > 0 && (
        <div className="mt-2 rounded border border-dashed px-2 py-1.5 text-xs"
             style={{ borderColor: '#A27B5C', backgroundColor: '#FFF7F0' }}>
          <div className="font-medium" style={{ color: '#A27B5C' }}>Already on the map nearby — approving this may duplicate it:</div>
          <ul className="mt-1 space-y-0.5" style={{ color: '#4A6B94' }}>
            {possibleDupes[r.id].map((d) => (
              <li key={d.municipal_project_id}>
                • <b style={{ color: '#002147' }}>{d.project_name ?? '(unnamed project)'}</b> · ~{Math.round(d.distance_m)}m
                {d.municipality_name ? ` · ${d.municipality_name}` : ''}{d.address ? ` · ${d.address}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      {r.approval_state === 'pending' && !r.matched_existing_id && lowPrecisionGeo.has(r.id) && (
        <div className="mt-2 rounded border border-dashed px-2 py-1.5 text-xs"
             style={{ borderColor: '#8FA9C8', color: '#4A6B94', backgroundColor: '#F8FAFC' }}>
          This address only geocoded to a street/area centroid, so the duplicate check couldn't run for this row — every project on the same road lands on the same point. Compare the address by hand before approving.
        </div>
      )}
    </>
  );

  // The full editable field grid — shown only when a row is expanded.
  const fieldEditor = (r: StagingRow) => {
    const isPending = r.approval_state === 'pending';
    const value = (key: keyof Edits): string => {
      const e = edits[r.id]?.[key];
      if (e !== undefined) return String(e ?? '');
      const v = (r as any)[key];
      return v == null ? '' : String(v);
    };
    return (
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
    );
  };

  // A compact, expand-to-edit row (needs-attention / clean / decided sections).
  const rowCard = (r: StagingRow) => {
    const isPending = r.approval_state === 'pending';
    const isExpanded = expandedRows.has(r.id);
    return (
      <div key={r.id} className="px-3 py-1.5"
           style={{ backgroundColor: r.approval_state === 'rejected' ? '#F8FAFC' : '#FFFFFF' }}>
        <div className="flex items-center gap-2">
          {isPending && !isReadOnlyRun && (
            <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)}
                   title="Include in Approve & Commit" />
          )}
          <button type="button" onClick={() => toggleExpand(r.id)} className="flex-1 text-left min-w-0"
                  style={{ opacity: r.approval_state !== 'pending' ? 0.7 : 1 }}>
            <div className="flex items-center flex-wrap gap-1.5">
              <span className="text-xs" style={{ color: '#8FA9C8' }}>{isExpanded ? '▾' : '▸'}</span>
              <span className="text-sm font-medium" style={{ color: '#002147' }}>{r.project_name ?? '(unnamed)'}</span>
              {rowBadges(r)}
            </div>
            <div className="text-xs mt-0.5" style={{ color: '#8FA9C8' }}>{rowSummaryLine(r)}</div>
          </button>
          {isPending && !isReadOnlyRun && (
            <button type="button" onClick={() => handleReject(r.id)}
                    className="text-xs px-2 py-1 rounded border self-start" style={{ borderColor: '#A27B5C', color: '#A27B5C' }}
                    title="Reject this row (kept for audit; reversible with Undo)">Reject</button>
          )}
          {r.approval_state === 'rejected' && canApprove && (
            <button type="button" onClick={() => handleUnreject(r.id)}
                    className="text-xs px-2 py-1 rounded border self-start" style={{ borderColor: '#4A6B94', color: '#4A6B94' }}
                    title="Undo — restore this row to pending">↩ Undo</button>
          )}
        </div>
        {isExpanded && (<div className="pl-6">{comparisonPanels(r)}{fieldEditor(r)}</div>)}
      </div>
    );
  };

  // A duplicate cluster: pick the keeper, reject the rest in one action.
  // Pull one row out of a name cluster (it's a separate phase, not a duplicate).
  const separateFromNameCluster = (id: string) =>
    setDismissedNameDup((prev) => new Set(prev).add(id));
  // Break a whole name cluster apart — none of them are duplicates.
  const dismissNameCluster = (ids: string[]) =>
    setDismissedNameDup((prev) => { const n = new Set(prev); ids.forEach((id) => n.add(id)); return n; });

  // A duplicate cluster card: pick the keeper, reject the rest in one action.
  // `kind: 'name'` renders the lower-confidence name-match variant with break-apart
  // controls (per-row "separate" + a whole-card "not duplicates").
  const clusterCard = (
    c: { id: string; members: StagingRow[] },
    opts?: { kind?: 'location' | 'name'; title?: string; reason?: string },
  ) => {
    const isName = opts?.kind === 'name';
    const accent = isName ? '#A27B5C' : '#4A6B94';
    const chosen = keeperByCluster[c.id];
    const keeperId = chosen && c.members.some((m) => m.id === chosen) ? chosen : c.members[0].id;
    const others = c.members.filter((m) => m.id !== keeperId);
    return (
      <div key={c.id} className="border rounded-md" style={{ borderColor: accent }}>
        <div className="px-3 py-2 border-b text-sm font-semibold" style={{ borderColor: '#8FA9C8', backgroundColor: isName ? '#FFF7F0' : '#F8FAFC', color: accent }}>
          {opts?.title ?? `⚠ Same location, staged ${c.members.length}× in this sweep — keep one`}
          {opts?.reason && (
            <div className="text-xs font-normal mt-0.5" style={{ color: '#8FA9C8' }}>{opts.reason}</div>
          )}
        </div>
        <div className="divide-y" style={{ borderColor: '#8FA9C8' }}>
          {c.members.map((m) => {
            const isExpanded = expandedRows.has(m.id);
            return (
              <div key={m.id} className="px-3 py-1.5" style={{ backgroundColor: m.id === keeperId ? '#FFFFFF' : '#F8FAFC' }}>
                <div className="flex items-center gap-2">
                  <input type="radio" name={`keeper-${c.id}`} checked={m.id === keeperId} disabled={isReadOnlyRun}
                         onChange={() => setKeeperByCluster((p) => ({ ...p, [c.id]: m.id }))} title="Keep this copy" />
                  <button type="button" onClick={() => toggleExpand(m.id)} className="flex-1 text-left min-w-0">
                    <div className="flex items-center flex-wrap gap-1.5">
                      <span className="text-xs" style={{ color: '#8FA9C8' }}>{isExpanded ? '▾' : '▸'}</span>
                      <span className="text-sm font-medium" style={{ color: '#002147' }}>{m.project_name ?? '(unnamed)'}</span>
                      {m.id === keeperId
                        ? <span className="text-xs font-medium" style={{ color: '#4A6B94' }}>· keep</span>
                        : <span className="text-xs" style={{ color: '#A27B5C' }}>· will reject</span>}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: '#8FA9C8' }}>{rowSummaryLine(m)}</div>
                  </button>
                  {isName && !isReadOnlyRun && c.members.length > 2 && (
                    <button type="button" onClick={() => separateFromNameCluster(m.id)}
                            className="text-xs px-1.5 py-0.5 rounded border self-start" style={{ borderColor: '#8FA9C8', color: '#4A6B94' }}
                            title="Not part of this group — pull this row out (it's a separate project/phase)">✕ separate</button>
                  )}
                </div>
                {isExpanded && (<div className="pl-6">{comparisonPanels(m)}{fieldEditor(m)}</div>)}
              </div>
            );
          })}
        </div>
        {!isReadOnlyRun && (
          <div className="px-3 py-2 border-t flex flex-wrap items-center gap-2" style={{ borderColor: '#8FA9C8' }}>
            <button type="button" onClick={() => handleKeepOne(keeperId, others.map((m) => m.id))}
                    className="text-xs px-3 py-1.5 rounded font-medium" style={{ backgroundColor: '#002147', color: '#FFFFFF' }}>
              Keep selected · reject the other {others.length}
            </button>
            {isName && (
              <button type="button" onClick={() => dismissNameCluster(c.members.map((m) => m.id))}
                      className="text-xs px-3 py-1.5 rounded border font-medium" style={{ borderColor: '#8FA9C8', color: '#4A6B94' }}
                      title="These aren't duplicates — keep them all as separate records">
                Not duplicates — keep all
              </button>
            )}
            <span className="text-xs" style={{ color: '#8FA9C8' }}>each reject is reversible with Undo</span>
          </div>
        )}
      </div>
    );
  };

  // Collapsible section shell for the bulk buckets (clean / decided).
  const sectionShell = (title: string, open: boolean, onToggle: () => void, right: ReactNode, body: ReactNode) => (
    <div className="border rounded-md" style={{ borderColor: '#8FA9C8' }}>
      <div className="px-3 py-2 flex items-center justify-between" style={{ backgroundColor: '#F8FAFC' }}>
        <button type="button" onClick={onToggle} className="text-sm font-semibold flex items-center gap-2" style={{ color: '#002147' }}>
          <span style={{ color: '#4A6B94' }}>{open ? '▾' : '▸'}</span>{title}
        </button>
        {right}
      </div>
      {open && <div className="divide-y border-t" style={{ borderColor: '#8FA9C8' }}>{body}</div>}
    </div>
  );

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
            {isSweep && (gapInfo?.healable_count ?? 0) > 0 && (
              <p className="text-xs mt-1" style={{ color: '#4A6B94' }}>
                {gapInfo!.healable_count} chunk{gapInfo!.healable_count === 1 ? '' : 's'} finished after the timeout — their records are already included below and won't be re-run.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {canRerunGaps && !rerunConfirm && (
              <button
                onClick={() => setRerunConfirm(true)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium border"
                style={{ borderColor: '#A27B5C', color: '#A27B5C', backgroundColor: '#FFFFFF' }}
                title="Re-fire the failed chunks sequentially"
              >
                Re-run {gapInfo!.gap_count} gap{gapInfo!.gap_count === 1 ? '' : 's'}
              </button>
            )}
            <button
              onClick={onClose}
              className="px-2 py-1 rounded text-sm"
              style={{ color: '#4A6B94' }}
              title="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Re-run gaps confirmation */}
        {canRerunGaps && rerunConfirm && (
          <div className="px-5 py-3 border-b" style={{ borderColor: '#A27B5C', backgroundColor: '#FFF7F0' }}>
            <div className="text-sm font-medium" style={{ color: '#002147' }}>
              Re-run {gapInfo!.gap_count} failed chunk{gapInfo!.gap_count === 1 ? '' : 's'} · {rerunCostLabel}
            </div>
            <div className="text-xs mt-1 flex flex-wrap gap-x-2 gap-y-0.5" style={{ color: '#4A6B94' }}>
              {gapInfo!.gaps.map((g, i) => (
                <span key={g.chunk_index}>
                  {i > 0 && '· '}
                  {fmtWindow(g.window_start)}–{fmtWindow(g.window_end)}
                </span>
              ))}
            </div>
            <div className="text-xs mt-1" style={{ color: '#8FA9C8' }}>
              Fires one chunk at a time (rate-limit safe), same as the original sweep. Successful chunks are untouched. Estimate is a floor — dense counties can run higher.
            </div>
            <div className="mt-2 flex gap-2">
              <button
                onClick={handleRerunGaps}
                disabled={rerunning}
                className="px-3 py-1.5 rounded-lg text-sm font-medium"
                style={{ backgroundColor: rerunning ? '#8FA9C8' : '#002147', color: '#FFFFFF', opacity: rerunning ? 0.7 : 1 }}
              >
                {rerunning ? 'Re-running…' : `Confirm — re-run ${gapInfo!.gap_count} gap${gapInfo!.gap_count === 1 ? '' : 's'} (${rerunCostLabel})`}
              </button>
              <button
                onClick={() => setRerunConfirm(false)}
                disabled={rerunning}
                className="px-3 py-1.5 rounded-lg text-sm border"
                style={{ borderColor: '#8FA9C8', color: '#4A6B94', backgroundColor: '#FFFFFF' }}
              >
                Back
              </button>
            </div>
          </div>
        )}

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

              {/* Summary bar */}
              {staging.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: '#4A6B94' }}>
                  <span><b style={{ color: '#002147' }}>{pendingCount}</b> to review</span>
                  {clusters.length > 0 && <span>· <b style={{ color: '#002147' }}>{clusters.length}</b> location dup{clusters.length === 1 ? '' : 's'}</span>}
                  {nameClusters.length > 0 && <span>· <b style={{ color: '#A27B5C' }}>{nameClusters.length}</b> name dup{nameClusters.length === 1 ? '' : 's'}</span>}
                  {triage.needsAttention.length > 0 && <span>· {triage.needsAttention.length} need a look</span>}
                  {triage.clean.length > 0 && <span>· {triage.clean.length} clean</span>}
                  <span>· <b style={{ color: '#002147' }}>{selected.size}</b> selected to commit</span>
                  {checkingDupes && <span style={{ color: '#8FA9C8' }}>· checking for duplicates…</span>}
                  {!isReadOnlyRun && (
                    <>
                      <span style={{ color: '#8FA9C8' }}>·</span>
                      <button type="button" onClick={selectAllNew} className="underline" style={{ color: '#002147' }}>Select all new</button>
                      <button type="button" onClick={deselectAll} className="underline" style={{ color: '#4A6B94' }}>Deselect all</button>
                    </>
                  )}
                </div>
              )}

              {staging.length === 0 && (
                <div className="text-sm italic" style={{ color: '#8FA9C8' }}>
                  No staged records {isSweep ? 'in this sweep yet.' : 'on this run.'}
                </div>
              )}

              {/* 1. Duplicates to resolve (in-sweep location clusters) */}
              {clusters.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm font-semibold" style={{ color: '#4A6B94' }}>
                    ⚠ Duplicates to resolve — same location ({clusters.length})
                  </div>
                  {clusters.map((c) => clusterCard(c, { kind: 'location' }))}
                </div>
              )}

              {/* 1b. Possibly the same — matched by NAME (lower confidence) */}
              {nameClusters.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm font-semibold" style={{ color: '#A27B5C' }}>
                    Possibly the same — matched by name ({nameClusters.length})
                  </div>
                  {nameClusters.map((c) => clusterCard(
                    { id: c.id, members: c.members },
                    {
                      kind: 'name',
                      title: `Similar name, staged ${c.members.length}× — keep one if it's a duplicate`,
                      reason: c.unitsAgree
                        ? `grouped by: similar name + matching unit count (${c.members[0].total_housing_units} units)`
                        : 'grouped by: similar name — confirm these aren’t separate phases before rejecting',
                    },
                  ))}
                </div>
              )}

              {/* 2. Needs attention (matches-existing / possible-dup / approx location) */}
              {triage.needsAttention.length > 0 && (
                <div className="border rounded-md" style={{ borderColor: '#A27B5C' }}>
                  <div className="px-3 py-2 border-b text-sm font-semibold" style={{ borderColor: '#8FA9C8', backgroundColor: '#FFF7F0', color: '#A27B5C' }}>
                    Needs attention ({triage.needsAttention.length}) — review before committing
                  </div>
                  <div className="divide-y" style={{ borderColor: '#8FA9C8' }}>
                    {triage.needsAttention.map((r) => rowCard(r))}
                  </div>
                </div>
              )}

              {/* 3. Clean & ready (collapsed by default) */}
              {triage.clean.length > 0 && sectionShell(
                `✓ Clean & ready (${triage.clean.length})`,
                showClean,
                () => setShowClean((v) => !v),
                !isReadOnlyRun && cleanSelectable.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setSelected((prev) => { const n = new Set(prev); cleanSelectable.forEach((id) => n.add(id)); return n; })}
                    className="text-xs px-2 py-1 rounded border"
                    style={{ borderColor: '#002147', color: '#002147' }}
                    title="Select every clean row for Approve & Commit"
                  >
                    Select all {cleanSelectable.length}
                  </button>
                ) : null,
                triage.clean.map((r) => rowCard(r)),
              )}

              {/* 4. Decided (approved + rejected, collapsed by default) */}
              {(triage.approved.length + triage.rejected.length) > 0 && sectionShell(
                `Decided — ${triage.approved.length} approved · ${triage.rejected.length} rejected`,
                showDecided,
                () => setShowDecided((v) => !v),
                null,
                [...triage.approved, ...triage.rejected].map((r) => rowCard(r)),
              )}

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
          {!isSweep && run?.state === 'awaiting_review' && pendingCount === 0 && canApprove ? (
            <button
              type="button"
              onClick={handleMarkReviewed}
              disabled={submitting}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ backgroundColor: submitting ? '#8FA9C8' : '#002147', color: '#FFFFFF', opacity: submitting ? 0.7 : 1 }}
              title="Nothing left to commit — mark this run reviewed"
            >
              {submitting ? 'Marking…' : 'Mark reviewed (nothing to commit)'}
            </button>
          ) : !isReadOnlyRun ? (
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
          ) : null}
        </div>
      </div>
    </div>
  );
}
