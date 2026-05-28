import React, { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { geocodingService } from '../../../services/geocodingService';
import type { MunicipalProjectMapRow } from '../layers/MunicipalProjectLayer';

interface ProjectStageOption {
  id: string;
  name: string;
  sort_order: number;
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
    notes?: string | null;
    geometry_geojson?: MunicipalProjectMapRow['geometry_geojson'];
    centroid_lat?: number;
    centroid_lng?: number;
  }) => void;
  onProjectDeleted?: (id: string) => void;
  // Phase 3: invoked when the user clicks "Draw polygon" — the parent activates terra-draw
  // on the map and is responsible for saving the result.
  onStartDrawingPolygon?: (projectId: string) => void;
  // When true, this project is currently in drawing mode (parent passes back to disable button).
  isDrawingPolygon?: boolean;
}

const BRAND = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
  terracotta: '#A27B5C',
};

const MunicipalProjectSlideout: React.FC<Props> = ({
  isOpen,
  project,
  onClose,
  onProjectUpdated,
  onProjectDeleted,
  onStartDrawingPolygon,
  isDrawingPolygon,
}) => {
  const [stages, setStages] = useState<ProjectStageOption[]>([]);
  const [overrideId, setOverrideId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>('');
  const [showRawStages, setShowRawStages] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notesDraft, setNotesDraft] = useState<string>('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesError, setNotesError] = useState<string>('');
  const [removingPolygon, setRemovingPolygon] = useState(false);
  const [polygonError, setPolygonError] = useState<string>('');

  // Load project stages once for the override dropdown.
  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('project_stage')
        .select('id, name, sort_order')
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
  }, [project?.id, project?.status_override_id, project?.notes]);

  if (!isOpen || !project) return null;

  const computedStageName = stages.find((s) => s.id === project.status_stage_id)?.name ?? 'Planning';
  const overrideStageName = overrideId ? stages.find((s) => s.id === overrideId)?.name ?? null : null;
  const effectiveName = overrideStageName ?? computedStageName;
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

  async function removePolygon() {
    if (!project) return;
    if (!confirm('Remove the drawn polygon? The pin will snap back to the original geocoded address.')) {
      return;
    }
    setRemovingPolygon(true);
    setPolygonError('');
    try {
      // Prefer the previously-geocoded address; fall back to the raw address + muni/state.
      const target =
        project.geocoded_address ||
        [project.address, project.municipality_name, project.municipality_state]
          .filter(Boolean)
          .join(', ');
      const geo = await geocodingService.geocodeAddress(target);
      if ('error' in geo) throw new Error(`Could not re-geocode address: ${geo.error}`);

      const newCentroid = `SRID=4326;POINT(${geo.longitude} ${geo.latitude})`;
      const { error } = await supabase
        .from('municipal_project')
        .update({ geometry: null, centroid: newCentroid })
        .eq('id', project.id);
      if (error) throw error;

      onProjectUpdated?.({
        id: project.id,
        geometry_geojson: null,
        centroid_lat: geo.latitude,
        centroid_lng: geo.longitude,
      });
    } catch (e) {
      setPolygonError(e instanceof Error ? e.message : String(e));
    } finally {
      setRemovingPolygon(false);
    }
  }

  async function deleteProject() {
    if (!project) return;
    if (!confirm(`Delete "${project.project_name || project.address}"? This cannot be undone.`)) {
      return;
    }
    setDeleting(true);
    setSaveError('');
    try {
      const { error } = await supabase.from('municipal_project').delete().eq('id', project.id);
      if (error) throw error;
      onProjectDeleted?.(project.id);
      onClose();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <aside
      // No backdrop overlay — map stays pan/zoom-able while slideout is open.
      // Close via the × button.
      className="fixed top-0 right-0 h-full w-[420px] z-[50] shadow-2xl flex flex-col"
      style={{ backgroundColor: '#FFFFFF' }}
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
            {project.parcel_numbers && project.parcel_numbers.length > 0 && (
              <div className="text-xs mt-1.5" style={{ color: BRAND.steel }}>
                <span style={{ color: BRAND.slate }}>Parcels:</span>{' '}
                {project.parcel_numbers.join(', ')}
              </div>
            )}
          </section>

          {/* Units */}
          {(hasUnits || project.total_housing_units != null) && (
            <section>
              <SectionLabel>Housing units</SectionLabel>
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
                {project.total_housing_units != null && (
                  <React.Fragment>
                    <span className="font-semibold" style={{ color: BRAND.midnight }}>
                      Total
                    </span>
                    <span
                      className="text-right font-mono font-semibold"
                      style={{ color: BRAND.midnight }}
                    >
                      {project.total_housing_units}
                    </span>
                  </React.Fragment>
                )}
              </div>
            </section>
          )}

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
            <div className="mt-1.5">
              {project.geometry_geojson ? (
                <div className="text-xs mb-2" style={{ color: BRAND.steel }}>
                  Polygon drawn — pin is positioned at the polygon's centroid.
                </div>
              ) : (
                <div className="text-xs mb-2" style={{ color: BRAND.slate }}>
                  No polygon yet — pin is at the geocoded address.
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
                      ? 'Redraw polygon'
                      : 'Draw polygon'}
                </button>
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
              {polygonError && (
                <div className="mt-1.5 text-xs" style={{ color: BRAND.terracotta }}>
                  {polygonError}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Footer with destructive action */}
        <footer
          className="px-5 py-3 border-t flex items-center justify-between"
          style={{ borderColor: '#EAEEF3' }}
        >
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
