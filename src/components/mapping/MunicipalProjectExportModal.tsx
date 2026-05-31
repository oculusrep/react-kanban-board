import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import {
  buildKml,
  downloadKml,
  fetchProjectsForExport,
} from '../../services/municipalProjectKmlExport';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

interface ProjectListRow {
  id: string;
  project_name: string | null;
  phase_label: string | null;
  address: string | null;
  total_housing_units: number | null;
  municipality_id: string;
  municipality_name: string | null;
  municipality_state: string | null;
  effective_stage_name: string | null;
  effective_stage_color: string | null;
  has_geometry: boolean;
}

interface MunicipalityGroup {
  id: string;
  name: string;
  state: string;
  projects: ProjectListRow[];
}

const BRAND = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
  terracotta: '#A27B5C',
};

const MunicipalProjectExportModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ProjectListRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string>('');
  const [onlyWithGeometry, setOnlyWithGeometry] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setSelectedIds(new Set());
    setLoading(true);
    void (async () => {
      try {
        const { data, error: qErr } = await supabase
          .from('municipal_project_v')
          .select(
            'id, project_name, phase_label, address, total_housing_units, municipality_id, municipality_name, municipality_state, effective_stage_name, effective_stage_color, geometry_geojson'
          )
          .order('municipality_name')
          .order('project_name');
        if (qErr) throw qErr;
        const mapped = (data ?? []).map(
          (r) =>
            ({
              id: r.id,
              project_name: r.project_name,
              phase_label: r.phase_label,
              address: r.address,
              total_housing_units: r.total_housing_units,
              municipality_id: r.municipality_id,
              municipality_name: r.municipality_name,
              municipality_state: r.municipality_state,
              effective_stage_name: r.effective_stage_name,
              effective_stage_color: r.effective_stage_color,
              has_geometry: r.geometry_geojson != null,
            }) as ProjectListRow
        );
        setRows(mapped);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen]);

  const groups: MunicipalityGroup[] = useMemo(() => {
    const filtered = onlyWithGeometry ? rows.filter((r) => r.has_geometry) : rows;
    const g = new Map<string, MunicipalityGroup>();
    for (const r of filtered) {
      if (!g.has(r.municipality_id)) {
        g.set(r.municipality_id, {
          id: r.municipality_id,
          name: r.municipality_name ?? 'Unknown',
          state: r.municipality_state ?? '',
          projects: [],
        });
      }
      g.get(r.municipality_id)!.projects.push(r);
    }
    return Array.from(g.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, onlyWithGeometry]);

  const selectedExportable = useMemo(
    () => rows.filter((r) => selectedIds.has(r.id) && r.has_geometry).length,
    [rows, selectedIds]
  );
  const selectedTotal = selectedIds.size;

  function toggleProject(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleMuni(muniId: string) {
    const muni = groups.find((g) => g.id === muniId);
    if (!muni) return;
    const projectIds = muni.projects.map((p) => p.id);
    const allSelected = projectIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) projectIds.forEach((id) => next.delete(id));
      else projectIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function selectAll() {
    const visible = groups.flatMap((g) => g.projects.map((p) => p.id));
    setSelectedIds(new Set(visible));
  }

  function clearAll() {
    setSelectedIds(new Set());
  }

  async function doExport() {
    setExporting(true);
    setError('');
    try {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) {
        setError('Select at least one project.');
        return;
      }
      const exportRows = await fetchProjectsForExport(ids);
      if (exportRows.length === 0) {
        setError('None of the selected projects have a polygon — nothing to export.');
        return;
      }
      const munisInSelection = new Set(exportRows.map((r) => r.municipality_name).filter(Boolean));
      const docName =
        munisInSelection.size === 1
          ? `Municipal Projects — ${Array.from(munisInSelection)[0]}`
          : `Municipal Projects (${munisInSelection.size} municipalities)`;
      const today = new Date();
      const yyyymmdd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
      const fileSafeBase =
        munisInSelection.size === 1
          ? `${Array.from(munisInSelection)[0]?.replace(/\s+/g, '_') ?? 'municipal'}_${yyyymmdd}`
          : `municipal_projects_${yyyymmdd}`;
      const kml = buildKml(exportRows, docName);
      downloadKml(fileSafeBase, kml);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-[10100] bg-black bg-opacity-30" onClick={onClose} />
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[10101] w-[560px] max-h-[80vh] bg-white rounded-lg shadow-2xl flex flex-col"
        style={{ border: `1px solid ${BRAND.slate}` }}
      >
        <header
          className="px-5 py-3 border-b flex items-center justify-between"
          style={{ borderColor: '#EAEEF3' }}
        >
          <div>
            <h2 className="text-lg font-semibold" style={{ color: BRAND.midnight }}>
              Export polygons to KML
            </h2>
            <div className="text-xs mt-0.5" style={{ color: BRAND.slate }}>
              Includes project name, address, units, units label, status, zoning, and notes.
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">
            ×
          </button>
        </header>

        {/* Toolbar */}
        <div
          className="px-5 py-2 border-b flex items-center gap-3 text-xs"
          style={{ borderColor: '#EAEEF3' }}
        >
          <button
            onClick={selectAll}
            className="underline"
            style={{ color: BRAND.steel }}
          >
            Select all
          </button>
          <button
            onClick={clearAll}
            className="underline"
            style={{ color: BRAND.steel }}
          >
            Clear
          </button>
          <label className="flex items-center gap-1.5 ml-auto cursor-pointer">
            <input
              type="checkbox"
              checked={onlyWithGeometry}
              onChange={(e) => setOnlyWithGeometry(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            <span style={{ color: BRAND.steel }}>Only show projects with polygons</span>
          </label>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="text-sm text-gray-500">Loading projects…</div>
          ) : groups.length === 0 ? (
            <div className="text-sm text-gray-500">
              {onlyWithGeometry
                ? 'No projects with drawn polygons yet.'
                : 'No projects yet — import a CSV first.'}
            </div>
          ) : (
            <ul className="space-y-3">
              {groups.map((g) => {
                const projectIds = g.projects.map((p) => p.id);
                const selectedCount = projectIds.filter((id) => selectedIds.has(id)).length;
                const allSelected = selectedCount === projectIds.length && projectIds.length > 0;
                const someSelected = selectedCount > 0 && !allSelected;
                return (
                  <li key={g.id}>
                    <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someSelected;
                        }}
                        onChange={() => toggleMuni(g.id)}
                      />
                      <span style={{ color: BRAND.midnight }}>
                        {g.name}, {g.state}
                      </span>
                      <span className="text-xs font-normal" style={{ color: BRAND.slate }}>
                        ({selectedCount}/{projectIds.length})
                      </span>
                    </label>
                    <ul className="ml-6 mt-1 space-y-0.5">
                      {g.projects.map((p) => (
                        <li key={p.id}>
                          <label className="flex items-start gap-2 text-xs cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(p.id)}
                              onChange={() => toggleProject(p.id)}
                              className="mt-0.5"
                            />
                            <span
                              className="inline-block w-2.5 h-2.5 rounded-full mt-1"
                              style={{ backgroundColor: p.effective_stage_color || BRAND.slate }}
                            />
                            <span className="flex-1" style={{ color: BRAND.midnight }}>
                              {p.project_name || <span className="italic" style={{ color: BRAND.slate }}>(unnamed)</span>}
                              {p.phase_label && (
                                <span style={{ color: BRAND.steel }}> — {p.phase_label}</span>
                              )}
                              {!p.has_geometry && (
                                <span className="ml-1.5 text-[10px]" style={{ color: BRAND.terracotta }}>
                                  no polygon
                                </span>
                              )}
                              {p.address && (
                                <span className="block text-[10px]" style={{ color: BRAND.slate }}>
                                  {p.address}
                                </span>
                              )}
                            </span>
                            {p.total_housing_units != null && (
                              <span className="text-[10px] tabular-nums" style={{ color: BRAND.steel }}>
                                {p.total_housing_units} units
                              </span>
                            )}
                          </label>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer
          className="px-5 py-3 border-t flex items-center justify-between"
          style={{ borderColor: '#EAEEF3' }}
        >
          <div className="text-xs" style={{ color: BRAND.steel }}>
            {selectedTotal === 0
              ? 'Nothing selected'
              : selectedExportable === selectedTotal
                ? `${selectedExportable} project${selectedExportable === 1 ? '' : 's'} will be exported`
                : `${selectedExportable} of ${selectedTotal} selected have polygons`}
          </div>
          <div className="flex items-center gap-2">
            {error && (
              <span className="text-xs" style={{ color: BRAND.terracotta }}>
                {error}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm rounded border"
              style={{ borderColor: BRAND.slate, color: BRAND.steel }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={doExport}
              disabled={exporting || selectedExportable === 0}
              className="px-4 py-1.5 text-sm rounded text-white font-semibold disabled:opacity-40"
              style={{ backgroundColor: BRAND.midnight }}
            >
              {exporting ? 'Building KML…' : 'Download KML'}
            </button>
          </div>
        </footer>
      </div>
    </>
  );
};

export default MunicipalProjectExportModal;
