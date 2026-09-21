import React, { useEffect, useState } from 'react';
import { useOverlayStack } from '../../../hooks/useOverlayStack';
import { supabase } from '../../../lib/supabaseClient';
import { geocodingService } from '../../../services/geocodingService';
import { classifyGeocode, unplacedLabel } from '../../../services/placementPrecision';
import { adapterFor, applyParcelBoundary } from '../../../services/parcelFabric';
import type { MunicipalProjectMapRow } from '../layers/MunicipalProjectLayer';
import { formatUnitsLabel } from '../../../utils/municipalProjectUnitsLabel';
import UserByIdDisplay from '../../shared/UserByIdDisplay';

interface ProjectStageOption {
  id: string;
  name: string;
  sort_order: number;
  abbreviation: string | null;
}

interface Props {
  isOpen: boolean;
  project: MunicipalProjectMapRow | null;
  onClose: () => void;
  onProjectUpdated?: (updated: {
    id: string;
    status_override_id?: string | null;
    effective_stage_id?: string | null;
    effective_stage_name?: string | null;
    effective_stage_color?: string | null;
    project_name?: string;
    total_housing_units?: number | null;
    notes?: string | null;
    location_description?: string | null;
    geometry_geojson?: MunicipalProjectMapRow['geometry_geojson'];
    geometry_source?: MunicipalProjectMapRow['geometry_source'];
    centroid_lat?: number | null;
    centroid_lng?: number | null;
    is_unplaced?: boolean;
    unplaced_reason?: string | null;
    geometry_unreviewed?: boolean;
    geometry_needs_review?: boolean;
  }) => void;
  onProjectDeleted?: (id: string) => void;
  // Phase 3: invoked when the user clicks "Draw polygon" — the parent activates terra-draw
  // on the map and is responsible for saving the result.
  onStartDrawingPolygon?: (projectId: string) => void;
  // When true, this project is currently in drawing mode (parent passes back to disable button).
  isDrawingPolygon?: boolean;
  // Pin-drop mode, for "I only know roughly where it is". The parent puts the map
  // into click-to-pick and hands the chosen point back through droppedPin; the
  // write stays here so the placement rules live in one component.
  onStartDroppingPin?: (projectId: string) => void;
  isDroppingPin?: boolean;
  droppedPin?: { lat: number; lng: number } | null;
}

const BRAND = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
  terracotta: '#A27B5C',
};

// Display labels for municipal_project.discovery_source. Unknown keys fall
// through to the raw value rather than rendering blank.
const DISCOVERY_SOURCE_LABELS: Record<string, string> = {
  pz_agenda: 'P&Z / commission agenda',
  news: 'News / press',
  permit_portal: 'Permit portal',
  activity_pdf: 'Permit activity PDF',
  builder_site: 'Builder / developer site',
  econ_dev: 'Econ dev / open records',
  other: 'Other',
};

// Supabase/PostgREST errors are plain objects, not Error instances — String(e) would
// render "[object Object]". Pull out a real message.
function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) {
    return String((e as { message: unknown }).message);
  }
  return String(e);
}

// Provenance footer dates render in the user's Eastern-Time working day
// (per CLAUDE.md timezone rule) so "created today" matches what they see.
function formatProvenanceDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const MunicipalProjectSlideout: React.FC<Props> = ({
  isOpen,
  project,
  onClose,
  onProjectUpdated,
  onProjectDeleted,
  onStartDrawingPolygon,
  isDrawingPolygon,
  onStartDroppingPin,
  isDroppingPin,
  droppedPin,
}) => {
  const { zIndex, bringToFront } = useOverlayStack(isOpen);
  const [stages, setStages] = useState<ProjectStageOption[]>([]);
  const [overrideId, setOverrideId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>('');
  const [showRawStages, setShowRawStages] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>('');
  const [notesDraft, setNotesDraft] = useState<string>('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesError, setNotesError] = useState<string>('');
  const [nameDraft, setNameDraft] = useState<string>('');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string>('');
  const [unitsDraft, setUnitsDraft] = useState<string>('');
  const [savingUnits, setSavingUnits] = useState(false);
  const [unitsError, setUnitsError] = useState<string>('');
  const [locDescDraft, setLocDescDraft] = useState<string>('');
  const [savingLocDesc, setSavingLocDesc] = useState(false);
  const [locDescError, setLocDescError] = useState<string>('');
  const [removingPolygon, setRemovingPolygon] = useState(false);
  const [droppingPin, setDroppingPin] = useState(false);
  const [markingReviewed, setMarkingReviewed] = useState(false);
  const [fetchingParcel, setFetchingParcel] = useState(false);
  const [parcelNotice, setParcelNotice] = useState<string>('');
  // Phase 3 is flagged off until the Forsyth adapter has been exercised on real
  // records. Offered only where a county adapter exists, the project has parcel
  // ids, and there is no boundary yet — re-fetching over an existing one is the
  // thing we specifically do not do.
  const parcelFetchAvailable =
    import.meta.env.VITE_PARCEL_FETCH_ENABLED === 'true'
    && !!project
    && !project.geometry_geojson
    && (project.parcel_numbers?.length ?? 0) > 0
    && !!adapterFor(project.municipality_name);
  const [polygonError, setPolygonError] = useState<string>('');

  // Load project stages once for the override dropdown.
  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('project_stage')
        .select('id, name, sort_order, abbreviation')
        .order('sort_order');
      setStages((data ?? []) as ProjectStageOption[]);
    })();
  }, []);

  // Reset local override state whenever a different project is selected.
  useEffect(() => {
    setOverrideId(project?.status_override_id ?? null);
    setSaveError('');
    setShowRawStages(false);
    setNotesDraft(project?.notes ?? '');
    setNotesError('');
    setNameDraft(project?.project_name ?? '');
    setNameError('');
    setUnitsDraft(project?.total_housing_units != null ? String(project.total_housing_units) : '');
    setUnitsError('');
    setLocDescDraft(project?.location_description ?? '');
    setLocDescError('');
    setDeleteError('');
  }, [
    project?.id,
    project?.status_override_id,
    project?.notes,
    project?.project_name,
    project?.total_housing_units,
    project?.location_description,
  ]);

  if (!isOpen || !project) return null;

  const computedStage = stages.find((s) => s.id === project.status_stage_id) ?? null;
  const overrideStage = overrideId ? stages.find((s) => s.id === overrideId) ?? null : null;
  const computedStageName = computedStage?.name ?? 'Planning';
  const overrideStageName = overrideStage?.name ?? null;
  const effectiveName = overrideStageName ?? computedStageName;
  const effectiveAbbreviation = (overrideStage?.abbreviation ?? computedStage?.abbreviation) ?? null;
  const unitsLabel = formatUnitsLabel(project.total_housing_units, effectiveAbbreviation);
  const overrideChanged = (project.status_override_id ?? null) !== overrideId;

  async function saveOverride() {
    if (!project) return;
    setSaving(true);
    setSaveError('');
    try {
      const { data, error } = await supabase
        .from('municipal_project')
        .update({ status_override_id: overrideId })
        .eq('id', project.id)
        .select('id, status_override_id, status_stage_id')
        .single();
      if (error) throw error;

      const newEffective = data.status_override_id ?? data.status_stage_id;
      const newStage = stages.find((s) => s.id === newEffective);
      onProjectUpdated?.({
        id: data.id,
        status_override_id: data.status_override_id,
        effective_stage_id: newEffective,
        effective_stage_name: newStage?.name ?? null,
        // We don't have color in the stages dropdown query; keep existing color
        // until the next layer refresh picks up the change.
        effective_stage_color: project.effective_stage_color,
      });
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const units: Array<[string, number | null]> = [
    ['Single family lots', project.single_family_lots],
    ['Townhouse', project.townhouse_units],
    ['Duplex', project.duplex_units],
    ['Apartments', project.apt_units],
    ['Cottages', project.cottage_units],
  ];
  const hasUnits = units.some(([, n]) => n != null && n > 0);

  async function saveName() {
    if (!project) return;
    const next = nameDraft.trim();
    setSavingName(true);
    setNameError('');
    try {
      const { error } = await supabase
        .from('municipal_project')
        .update({ project_name: next })
        .eq('id', project.id);
      if (error) throw error;
      onProjectUpdated?.({ id: project.id, project_name: next });
    } catch (e) {
      setNameError(errMessage(e));
    } finally {
      setSavingName(false);
    }
  }

  async function saveUnits() {
    if (!project) return;
    const trimmed = unitsDraft.trim();
    const next = trimmed === '' ? null : Number(trimmed);
    if (next != null && (!Number.isFinite(next) || next < 0)) {
      setUnitsError('Enter a valid number of units.');
      return;
    }
    setSavingUnits(true);
    setUnitsError('');
    try {
      const { error } = await supabase
        .from('municipal_project')
        .update({ total_housing_units: next })
        .eq('id', project.id);
      if (error) throw error;
      onProjectUpdated?.({ id: project.id, total_housing_units: next });
    } catch (e) {
      setUnitsError(errMessage(e));
    } finally {
      setSavingUnits(false);
    }
  }

  async function saveNotes() {
    if (!project) return;
    const next = notesDraft.trim() === '' ? null : notesDraft;
    setSavingNotes(true);
    setNotesError('');
    try {
      const { error } = await supabase
        .from('municipal_project')
        .update({ notes: next })
        .eq('id', project.id);
      if (error) throw error;
      onProjectUpdated?.({ id: project.id, notes: next });
    } catch (e) {
      setNotesError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingNotes(false);
    }
  }

  async function saveLocationDescription() {
    if (!project) return;
    const next = locDescDraft.trim() === '' ? null : locDescDraft.trim();
    setSavingLocDesc(true);
    setLocDescError('');
    try {
      const { error } = await supabase
        .from('municipal_project')
        .update({ location_description: next })
        .eq('id', project.id);
      if (error) throw error;
      onProjectUpdated?.({ id: project.id, location_description: next });
    } catch (e) {
      setLocDescError(errMessage(e));
    } finally {
      setSavingLocDesc(false);
    }
  }

  async function removePolygon() {
    if (!project) return;
    setRemovingPolygon(true);
    setPolygonError('');
    try {
      // The pin used to "snap back to the geocoded address" — re-geocoding and
      // writing whatever came out, county centroid included. That is the
      // fabrication this work removes. Now the address is re-geocoded only to see
      // whether it is PRECISE enough to stand on its own; if it isn't, the record
      // goes back on the unplaced list rather than getting an invented pin.
      const target =
        project.geocoded_address ||
        [project.address, project.municipality_name, project.municipality_state]
          .filter(Boolean)
          .join(', ');
      const geo = target ? await geocodingService.geocodeAddress(target) : null;
      const placement = classifyGeocode(geo, !!target);

      if (!confirm(
        placement.placed
          ? 'Remove the drawn boundary? The pin falls back to the geocoded address.'
          : `Remove the drawn boundary? ${unplacedLabel(placement.reason)}, so this project `
            + 'will have no pin until you draw a boundary or drop one by hand.',
      )) {
        setRemovingPolygon(false);
        return;
      }

      const { error } = await supabase.rpc('clear_municipal_project_polygon', {
        p_id: project.id,
        p_lat: placement.latitude,
        p_lng: placement.longitude,
        p_unplaced_reason: placement.reason ?? 'geocode_failed',
      });
      if (error) throw error;

      onProjectUpdated?.({
        id: project.id,
        geometry_geojson: null,
        geometry_source: null,
        centroid_lat: placement.latitude ?? null,
        centroid_lng: placement.longitude ?? null,
        is_unplaced: !placement.placed,
        unplaced_reason: placement.reason,
      });
    } catch (e) {
      setPolygonError(e instanceof Error ? e.message : String(e));
    } finally {
      setRemovingPolygon(false);
    }
  }

  // Pull the boundary from the county parcel map. Behind a flag, and only offered
  // where a county adapter exists and the project actually has parcel ids.
  // Deliberately a one-shot at the user's request, never an automatic refetch:
  // the fabric refreshes nightly and a re-plat would overwrite a correct boundary.
  async function fetchParcelBoundary() {
    if (!project) return;
    setFetchingParcel(true);
    setPolygonError('');
    setParcelNotice('');
    try {
      const r = await applyParcelBoundary({
        projectId: project.id,
        municipalityName: project.municipality_name ?? null,
        parcelNumbers: project.parcel_numbers ?? [],
        statedAcres: null,   // the RPC parses it from parcel_boundary_notes
      });
      const bits = [`Boundary set from ${r.parts} parcel${r.parts === 1 ? '' : 's'}`];
      if (r.computedAcres != null) bits.push(`${r.computedAcres} ac`);
      if (r.missing.length) {
        bits.push(
          `${r.missing.length} parcel id${r.missing.length === 1 ? '' : 's'} `
          + `no longer in the parcel map (${r.missing.join(', ')}) — usually re-platted`,
        );
      }
      if (r.needsReview && r.variancePct != null) {
        bits.push(`acreage is ${r.variancePct > 0 ? '+' : ''}${r.variancePct}% against the ${r.statedAcres} ac stated — check it`);
      }
      setParcelNotice(bits.join(' · '));
      onProjectUpdated?.({ id: project.id, is_unplaced: false, unplaced_reason: null });
    } catch (e) {
      setPolygonError(e instanceof Error ? e.message : String(e));
    } finally {
      setFetchingParcel(false);
    }
  }

  // The slideout is REUSED across records — it is not unmounted between them — so
  // every transient bit of placement state has to be cleared when the record
  // changes. Without this, a fetch result carried over: fetching a boundary on one
  // project and then opening an unplaced one showed that project's
  // "Boundary set from 2 parcels · 32.19 ac" under "Not on the map yet".
  // (Nothing was ever written to the wrong record — confirmed in the database —
  // but the panel said otherwise, which is just as bad.)
  useEffect(() => {
    setParcelNotice('');
    setPolygonError('');
    setRemovingPolygon(false);
    setDroppingPin(false);
    setFetchingParcel(false);
    setMarkingReviewed(false);
  }, [project?.id]);

  // Confirm a fetched boundary. Until this happens the polygon renders dashed —
  // the dashes mean "nobody has checked this yet", not "this is suspect".
  //
  // Editing a fetched boundary ALSO counts as review and needs no button: the
  // write RPC stamps geometry_reviewed_at on anything that isn't a fresh
  // parcel_fetch, because having reshaped it by hand you have plainly looked at
  // it. This button is for the case where the fetched shape was already right.
  async function markBoundaryReviewed() {
    if (!project) return;
    setMarkingReviewed(true);
    setPolygonError('');
    try {
      const { error } = await supabase.rpc('mark_municipal_project_geometry_reviewed', {
        p_id: project.id,
      });
      if (error) throw error;
      onProjectUpdated?.({
        id: project.id,
        geometry_unreviewed: false,
        geometry_needs_review: false,
      });
    } catch (e) {
      setPolygonError(e instanceof Error ? e.message : String(e));
    } finally {
      setMarkingReviewed(false);
    }
  }

  // "I only know roughly where it is." Available only while the project has no
  // boundary — a project with one takes its pin from the shape, and the RPC
  // refuses a manual pin in that case.
  async function dropPinHere() {
    if (!project || !droppedPin) return;
    setDroppingPin(true);
    setPolygonError('');
    try {
      const { error } = await supabase.rpc('set_municipal_project_pin', {
        p_id: project.id,
        p_lat: droppedPin.lat,
        p_lng: droppedPin.lng,
      });
      if (error) throw error;
      onProjectUpdated?.({
        id: project.id,
        centroid_lat: droppedPin.lat,
        centroid_lng: droppedPin.lng,
        is_unplaced: false,
        unplaced_reason: null,
      });
    } catch (e) {
      setPolygonError(e instanceof Error ? e.message : String(e));
    } finally {
      setDroppingPin(false);
    }
  }

  async function deleteProject() {
    if (!project) return;
    if (!confirm(`Delete "${project.project_name || project.address}"? This cannot be undone.`)) {
      return;
    }
    setDeleting(true);
    setDeleteError('');
    try {
      const { error } = await supabase.from('municipal_project').delete().eq('id', project.id);
      if (error) throw error;
      onProjectDeleted?.(project.id);
      onClose();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <aside
      // No backdrop overlay — map stays pan/zoom-able while slideout is open.
      // Close via the × button.
      onMouseDown={bringToFront}
      className="fixed top-0 right-0 h-full w-[420px] shadow-2xl flex flex-col"
      style={{ backgroundColor: '#FFFFFF', zIndex }}
    >
        {/* Header */}
        <header
          className="px-5 py-4 border-b flex items-start justify-between"
          style={{ borderColor: '#EAEEF3' }}
        >
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide" style={{ color: BRAND.slate }}>
              {project.municipality_name}, {project.municipality_state}
            </div>
            <h2
              className="text-lg font-semibold mt-0.5 truncate"
              style={{ color: BRAND.midnight }}
              title={project.project_name || '(unnamed)'}
            >
              {project.project_name || <span style={{ color: BRAND.slate }}>(no name)</span>}
              {project.phase_label && (
                <span className="ml-2 text-sm font-normal" style={{ color: BRAND.steel }}>
                  {project.phase_label}
                </span>
              )}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Project name — editable */}
          <section>
            <SectionLabel>Project name</SectionLabel>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder="(unnamed)"
                className="flex-1 border rounded px-2 py-1.5 text-sm"
                style={{ borderColor: BRAND.slate, color: BRAND.midnight }}
              />
              <button
                type="button"
                onClick={saveName}
                disabled={savingName || nameDraft.trim() === (project.project_name ?? '')}
                className="px-3 py-1.5 rounded text-white text-xs font-semibold disabled:opacity-40"
                style={{ backgroundColor: BRAND.midnight }}
              >
                {savingName ? 'Saving…' : 'Save'}
              </button>
            </div>
            {nameError && (
              <div className="mt-1 text-xs" style={{ color: BRAND.terracotta }}>
                {nameError}
              </div>
            )}
          </section>

          {/* Status block */}
          <section>
            <SectionLabel>Status</SectionLabel>
            <div className="mt-1.5 space-y-2">
              <div className="flex items-center gap-2">
                <span
                  className="px-2 py-1 rounded text-xs font-semibold"
                  style={{
                    backgroundColor: project.effective_stage_color || BRAND.slate,
                    color: '#FFFFFF',
                  }}
                >
                  {effectiveName}
                </span>
                {overrideStageName && (
                  <span className="text-xs" style={{ color: BRAND.steel }}>
                    (override; computed: {computedStageName})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={overrideId ?? ''}
                  onChange={(e) => setOverrideId(e.target.value || null)}
                  className="flex-1 border rounded px-2 py-1.5 text-sm"
                  style={{ borderColor: BRAND.slate }}
                >
                  <option value="">Use computed stage</option>
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      Override: {s.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!overrideChanged || saving}
                  onClick={saveOverride}
                  className="px-3 py-1.5 rounded text-white text-xs font-semibold disabled:opacity-40"
                  style={{ backgroundColor: BRAND.midnight }}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
              {saveError && (
                <div className="text-xs" style={{ color: BRAND.terracotta }}>
                  {saveError}
                </div>
              )}
            </div>
          </section>

          {/* Address */}
          <section>
            <SectionLabel>Address</SectionLabel>
            <div className="mt-1 text-sm" style={{ color: BRAND.midnight }}>
              {project.address || <span style={{ color: BRAND.slate }}>—</span>}
            </div>
            {project.geocoded_address && project.geocoded_address !== project.address && (
              <div className="text-xs mt-0.5" style={{ color: BRAND.slate }}>
                Geocoded as: {project.geocoded_address}
              </div>
            )}
            <div className="mt-2">
              <span className="font-semibold uppercase tracking-wide block mb-1"
                    style={{ color: BRAND.slate, fontSize: '0.65rem' }}>
                Pin placement hint
              </span>
              <textarea
                value={locDescDraft}
                onChange={(e) => setLocDescDraft(e.target.value)}
                placeholder='e.g. "NWC of Hwy 92 & Dallas-Acworth Rd, behind the Publix"'
                rows={2}
                className="w-full border rounded px-2 py-1.5 text-sm resize-y"
                style={{ borderColor: BRAND.slate, color: BRAND.midnight, borderLeft: `3px solid ${BRAND.terracotta}` }}
              />
              <div className="mt-1 flex items-center justify-between">
                {locDescError ? (
                  <span className="text-xs" style={{ color: BRAND.terracotta }}>{locDescError}</span>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={saveLocationDescription}
                  disabled={savingLocDesc || locDescDraft.trim() === (project.location_description ?? '')}
                  className="px-3 py-1 rounded text-white text-xs font-semibold disabled:opacity-40"
                  style={{ backgroundColor: BRAND.midnight }}
                >
                  {savingLocDesc ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
            {project.parcel_numbers && project.parcel_numbers.length > 0 && (
              <div className="text-xs mt-1.5" style={{ color: BRAND.steel }}>
                <span style={{ color: BRAND.slate }}>Parcels:</span>{' '}
                {project.parcel_numbers.join(', ')}
              </div>
            )}
          </section>

          {/* Units — total is always editable; per-unit breakdown shown read-only when imported */}
          <section>
            <SectionLabel>Housing units</SectionLabel>
            {hasUnits && (
              <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                {units
                  .filter(([, n]) => n != null && n > 0)
                  .map(([label, n]) => (
                    <React.Fragment key={label}>
                      <span style={{ color: BRAND.steel }}>{label}</span>
                      <span className="text-right font-mono" style={{ color: BRAND.midnight }}>
                        {n}
                      </span>
                    </React.Fragment>
                  ))}
              </div>
            )}
            <div className="mt-1.5 flex items-center gap-2">
              <label className="text-sm whitespace-nowrap font-semibold" style={{ color: BRAND.midnight }}>
                Total units
              </label>
              <input
                type="number"
                min={0}
                value={unitsDraft}
                onChange={(e) => setUnitsDraft(e.target.value)}
                placeholder="—"
                className="w-24 border rounded px-2 py-1 text-sm text-right font-mono"
                style={{ borderColor: BRAND.slate, color: BRAND.midnight }}
              />
              <button
                type="button"
                onClick={saveUnits}
                disabled={
                  savingUnits ||
                  unitsDraft.trim() ===
                    (project.total_housing_units != null ? String(project.total_housing_units) : '')
                }
                className="px-3 py-1 rounded text-white text-xs font-semibold disabled:opacity-40"
                style={{ backgroundColor: BRAND.midnight }}
              >
                {savingUnits ? 'Saving…' : 'Save'}
              </button>
            </div>
            {unitsError && (
              <div className="mt-1 text-xs" style={{ color: BRAND.terracotta }}>
                {unitsError}
              </div>
            )}
            <div className="mt-2 flex items-center gap-2">
              <label
                className="text-xs whitespace-nowrap font-semibold uppercase tracking-wide"
                style={{ color: BRAND.steel }}
              >
                Units label
              </label>
              <span
                className="text-sm font-mono"
                style={{ color: unitsLabel ? BRAND.midnight : BRAND.slate }}
                title="Auto-generated from total units and status abbreviation. Exported in KML."
              >
                {unitsLabel || '—'}
              </span>
              {!effectiveAbbreviation && (
                <span className="text-[10px]" style={{ color: BRAND.terracotta }}>
                  set status abbreviation in layer panel
                </span>
              )}
            </div>
          </section>

          {/* Zoning */}
          {(project.zoning || project.zoning_approval_date) && (
            <section>
              <SectionLabel>Zoning</SectionLabel>
              <div className="mt-1 text-sm" style={{ color: BRAND.midnight }}>
                {project.zoning || '—'}
                {project.zoning_approval_date && (
                  <span className="ml-2 text-xs" style={{ color: BRAND.steel }}>
                    approved {project.zoning_approval_date}
                  </span>
                )}
              </div>
            </section>
          )}

          {/* Source — agent-discovered context. Only renders if any of these fields are populated.
              Importer + manually-created rows usually have all four NULL → section is hidden. */}
          {(project.builder_developer || project.permit_url || project.permit_application_date || project.source) && (
            <section>
              <SectionLabel>Source</SectionLabel>
              <div className="mt-1.5 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
                {project.builder_developer && (
                  <>
                    <span className="text-xs uppercase tracking-wide" style={{ color: BRAND.slate }}>Builder</span>
                    <span style={{ color: BRAND.midnight }}>{project.builder_developer}</span>
                  </>
                )}
                {project.permit_application_date && (
                  <>
                    <span className="text-xs uppercase tracking-wide" style={{ color: BRAND.slate }}>Permit app</span>
                    <span style={{ color: BRAND.midnight }}>{project.permit_application_date}</span>
                  </>
                )}
                {project.permit_url && (
                  <>
                    <span className="text-xs uppercase tracking-wide" style={{ color: BRAND.slate }}>Permit URL</span>
                    <a
                      href={project.permit_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate underline"
                      style={{ color: BRAND.steel }}
                      title={project.permit_url}
                    >
                      {project.permit_url}
                    </a>
                  </>
                )}
                {project.source && (
                  <>
                    <span className="text-xs uppercase tracking-wide" style={{ color: BRAND.slate }}>Origin</span>
                    <span style={{ color: BRAND.midnight }}>{project.source}</span>
                  </>
                )}
                {project.discovery_source && (
                  <>
                    <span className="text-xs uppercase tracking-wide" style={{ color: BRAND.slate }}>Found via</span>
                    <span style={{ color: BRAND.midnight }}>
                      {DISCOVERY_SOURCE_LABELS[project.discovery_source] ?? project.discovery_source}
                    </span>
                  </>
                )}
              </div>
            </section>
          )}

          {/* Notes — always visible, editable */}
          <section>
            <SectionLabel>Notes</SectionLabel>
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              placeholder="No notes yet — add one"
              rows={4}
              className="mt-1 w-full border rounded px-2 py-1.5 text-sm resize-y"
              style={{ borderColor: BRAND.slate, color: BRAND.midnight }}
            />
            <div className="mt-1.5 flex items-center justify-between">
              {notesError ? (
                <span className="text-xs" style={{ color: BRAND.terracotta }}>
                  {notesError}
                </span>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={saveNotes}
                disabled={savingNotes || notesDraft === (project.notes ?? '')}
                className="px-3 py-1 rounded text-white text-xs font-semibold disabled:opacity-40"
                style={{ backgroundColor: BRAND.midnight }}
              >
                {savingNotes ? 'Saving…' : 'Save notes'}
              </button>
            </div>
          </section>

          {/* Raw stages */}
          {project.raw_stages && Object.keys(project.raw_stages).length > 0 && (
            <section>
              <button
                type="button"
                onClick={() => setShowRawStages((v) => !v)}
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: BRAND.steel }}
              >
                Source stage columns {showRawStages ? '▾' : '▸'}
              </button>
              {showRawStages && (
                <div className="mt-1.5 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
                  {Object.entries(project.raw_stages).map(([col, val]) => (
                    <React.Fragment key={col}>
                      <span className="font-mono" style={{ color: BRAND.slate }}>
                        {col}
                      </span>
                      <span style={{ color: BRAND.midnight }}>{val || '—'}</span>
                    </React.Fragment>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Polygon drawing */}
          <section>
            <SectionLabel>Polygon</SectionLabel>
            {project.parcel_boundary_notes && (
              <div className="mt-1.5 text-xs px-2 py-1.5 rounded"
                   style={{ backgroundColor: '#F8FAFC', color: BRAND.midnight, borderLeft: `3px solid ${BRAND.terracotta}` }}>
                <span className="font-semibold uppercase tracking-wide block mb-0.5"
                      style={{ color: BRAND.slate, fontSize: '0.65rem' }}>
                  Parcel / boundary notes (polygon hint)
                </span>
                {project.parcel_boundary_notes}
              </div>
            )}
            <div className="mt-1.5">
              {/* Placement state. An unplaced record is a COMPLETE record with no
                  trustworthy coordinate — never a stub — so this says what is
                  missing and offers the two ways to fix it, right here. */}
              {project.is_unplaced ? (
                <div className="text-xs mb-2 px-2 py-1.5 rounded"
                     style={{ backgroundColor: '#FFF7F0', color: BRAND.midnight,
                              borderLeft: `3px solid ${BRAND.terracotta}` }}>
                  <span className="font-semibold">Not on the map yet.</span>{' '}
                  <span style={{ color: BRAND.steel }}>{unplacedLabel(project.unplaced_reason)}.</span>
                  <div style={{ color: BRAND.slate }} className="mt-0.5">
                    Draw the boundary below, or drop a pin if you only know roughly where it is.
                  </div>
                </div>
              ) : project.geometry_geojson ? (
                <div className="text-xs mb-2" style={{ color: BRAND.steel }}>
                  {project.geometry_source === 'parcel_fetch'
                    ? 'Boundary from the county parcel map'
                    : project.geometry_source === 'parcel_fetch_adjusted'
                      ? 'Boundary from the county parcel map, adjusted by hand'
                      : 'Boundary drawn by hand'}
                  {' — the pin sits inside the shape.'}
                  {project.geometry_computed_acres != null && (
                    <span style={{ color: BRAND.slate }}> · {project.geometry_computed_acres} ac</span>
                  )}
                </div>
              ) : (
                <div className="text-xs mb-2" style={{ color: BRAND.slate }}>
                  No boundary — pin is at the geocoded address.
                </div>
              )}

              {/* Acreage validation. A fetched boundary that disagrees with the
                  acreage the source stated is the retired-parcel-id signal: the
                  fabric gave us the wrong parcels, or not all of them. */}
              {project.geometry_area_variance_pct != null && (
                <div className="text-xs mb-2 px-2 py-1.5 rounded"
                     style={{
                       backgroundColor: project.geometry_needs_review ? '#FFF7F0' : '#F8FAFC',
                       color: BRAND.midnight,
                       borderLeft: `3px solid ${project.geometry_needs_review ? BRAND.terracotta : BRAND.slate}`,
                     }}>
                  <span className="font-semibold">
                    {project.geometry_needs_review ? '⚠ Acreage doesn’t match' : 'Acreage checks out'}
                  </span>
                  <div style={{ color: BRAND.steel }} className="mt-0.5">
                    Source says {project.geometry_stated_acres} ac · boundary measures{' '}
                    {project.geometry_computed_acres} ac ·{' '}
                    <b style={{ color: project.geometry_needs_review ? BRAND.terracotta : BRAND.steel }}>
                      {project.geometry_area_variance_pct > 0 ? '+' : ''}
                      {project.geometry_area_variance_pct}%
                    </b>
                  </div>
                  {project.geometry_needs_review && (
                    <div style={{ color: BRAND.slate }} className="mt-0.5">
                      Usually a parcel id that was re-platted away, or a parcel missing
                      from the set. Check the boundary before trusting it.
                    </div>
                  )}
                </div>
              )}

              {/* Pin-drop: only when there is no boundary. A project with one takes
                  its pin from the shape, and the RPC refuses a manual pin there. */}
              {!project.geometry_geojson && (
                <div className="mb-2">
                  {isDroppingPin && droppedPin ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs" style={{ color: BRAND.steel }}>
                        Pin at {droppedPin.lat.toFixed(5)}, {droppedPin.lng.toFixed(5)}
                      </span>
                      <button type="button" onClick={dropPinHere} disabled={droppingPin}
                              className="px-2.5 py-1 rounded text-white text-xs font-semibold disabled:opacity-40"
                              style={{ backgroundColor: BRAND.midnight }}>
                        {droppingPin ? 'Placing…' : 'Place pin here'}
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => project && onStartDroppingPin?.(project.id)}
                            disabled={isDroppingPin || isDrawingPolygon || !onStartDroppingPin}
                            className="px-3 py-1.5 rounded text-xs font-semibold disabled:opacity-40 border"
                            style={{ borderColor: BRAND.slate, color: BRAND.steel }}>
                      {isDroppingPin ? 'Click the map…' : 'Drop a pin instead'}
                    </button>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => project && onStartDrawingPolygon?.(project.id)}
                  disabled={isDrawingPolygon || !onStartDrawingPolygon}
                  className="px-3 py-1.5 rounded text-white text-xs font-semibold disabled:opacity-40"
                  style={{ backgroundColor: BRAND.steel }}
                >
                  {isDrawingPolygon
                    ? 'Drawing on map…'
                    : project.geometry_geojson
                      ? 'Edit boundary'
                      : project.is_unplaced
                        ? 'Draw boundary to place it'
                        : 'Draw boundary'}
                </button>
                {project.geometry_unreviewed && (
                  <button
                    type="button"
                    onClick={markBoundaryReviewed}
                    disabled={markingReviewed || isDrawingPolygon}
                    className="px-3 py-1.5 rounded text-xs font-semibold disabled:opacity-40 border"
                    style={{ borderColor: BRAND.midnight, color: BRAND.midnight }}
                    title="Confirm this fetched boundary is right — it stops rendering dashed"
                  >
                    {markingReviewed ? 'Marking…' : 'Mark boundary reviewed'}
                  </button>
                )}
                {project.geometry_geojson && (
                  <button
                    type="button"
                    onClick={removePolygon}
                    disabled={removingPolygon || isDrawingPolygon}
                    className="px-3 py-1.5 rounded text-xs font-semibold disabled:opacity-40 border"
                    style={{ borderColor: BRAND.terracotta, color: BRAND.terracotta }}
                  >
                    {removingPolygon ? 'Removing…' : 'Remove polygon'}
                  </button>
                )}
              </div>
              {parcelFetchAvailable && (
                <div className="mt-2">
                  <button type="button" onClick={fetchParcelBoundary}
                          disabled={fetchingParcel || isDrawingPolygon}
                          className="px-3 py-1.5 rounded text-xs font-semibold disabled:opacity-40 border"
                          style={{ borderColor: BRAND.steel, color: BRAND.steel }}
                          title={`Pull the boundary for ${(project.parcel_numbers ?? []).join(', ')} from the county parcel map`}>
                    {fetchingParcel
                      ? 'Fetching parcel boundary…'
                      : `Fetch boundary from ${(project.parcel_numbers ?? []).length} parcel`
                        + `${(project.parcel_numbers ?? []).length === 1 ? '' : 's'}`}
                  </button>
                  <div className="text-xs mt-0.5" style={{ color: BRAND.slate }}>
                    Fetched once, on request — never refreshed, so a re-plat can&rsquo;t overwrite it.
                  </div>
                </div>
              )}
              {parcelNotice && (
                <div className="mt-1.5 text-xs" style={{ color: BRAND.steel }}>
                  {parcelNotice}
                </div>
              )}
              {polygonError && (
                <div className="mt-1.5 text-xs" style={{ color: BRAND.terracotta }}>
                  {polygonError}
                </div>
              )}
            </div>
          </section>

          {/* Provenance footer — quietly tells the user where this row came from,
              who created it, and (if edited since) who last touched it.
              Agent rows: "Found by the market research agent". Importer rows:
              "Imported via CSV". Otherwise: created manually. */}
          <section className="pt-2 border-t text-xs space-y-1" style={{ borderColor: '#EAEEF3', color: BRAND.slate }}>
            <div>
              {project.source_research_run_id ? (
                <>Found by the market research agent</>
              ) : project.source_import_id ? (
                <>Imported via municipal-project CSV</>
              ) : (
                <>Manually created</>
              )}
              {project.created_at && (
                <> · created {formatProvenanceDate(project.created_at)}</>
              )}
              {project.created_by_id && (
                <UserByIdDisplay userId={project.created_by_id} />
              )}
            </div>
            {project.updated_at && project.created_at
              && new Date(project.updated_at).getTime() - new Date(project.created_at).getTime() > 1000 && (
              <div>
                Updated {formatProvenanceDate(project.updated_at)}
                {project.updated_by_id && (
                  <UserByIdDisplay userId={project.updated_by_id} />
                )}
              </div>
            )}
          </section>
        </div>

        {/* Footer with destructive action */}
        <footer
          className="px-5 py-3 border-t flex flex-col gap-1"
          style={{ borderColor: '#EAEEF3' }}
        >
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={deleteProject}
              disabled={deleting}
              className="text-xs font-medium disabled:opacity-40"
              style={{ color: BRAND.terracotta }}
            >
              {deleting ? 'Deleting…' : 'Delete project'}
            </button>
            <span className="text-xs" style={{ color: BRAND.slate }}>
              Row {project.id.slice(0, 8)}…
            </span>
          </div>
          {deleteError && (
            <div className="text-xs" style={{ color: BRAND.terracotta }}>
              {deleteError}
            </div>
          )}
        </footer>
      </aside>
  );
};

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: BRAND.steel }}>
    {children}
  </div>
);

export default MunicipalProjectSlideout;
