import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { useLayerManager } from './LayerManager';
import { useMunicipalProjectPolygonStyle, DEFAULT_POLYGON_STYLE } from '../../../hooks/useMunicipalProjectPolygonStyle';
import MunicipalProjectExportModal from '../MunicipalProjectExportModal';
import type { MunicipalProjectMapRow } from './MunicipalProjectLayer';

interface MuniRow { id: string; name: string; state: string; display_color: string | null; }
interface StageRow { id: string; name: string; color: string | null; sort_order: number; }

interface Props {
  // Called when the user clicks a search result. Parent typically pans the map
  // and opens the project slideout. Optional so the panel still renders when
  // search wiring isn't needed (e.g. tests).
  onSelectSearchResult?: (project: MunicipalProjectMapRow) => void;
}

const MunicipalProjectInlineFilters: React.FC<Props> = ({ onSelectSearchResult }) => {
  const {
    municipalProjectsHiddenMunicipalityIds,
    toggleMunicipalProjectsMunicipality,
    municipalProjectsHiddenStageIds,
    toggleMunicipalProjectsStage,
    municipalProjectsMinUnits,
    municipalProjectsMaxUnits,
    setMunicipalProjectsMinUnits,
    setMunicipalProjectsMaxUnits,
    municipalProjectsShowPins,
    municipalProjectsShowPolygons,
    setMunicipalProjectsShowPins,
    setMunicipalProjectsShowPolygons,
    refreshLayer,
    createMode,
    setCreateMode,
  } = useLayerManager();

  const [munis, setMunis] = useState<MuniRow[]>([]);
  const [stages, setStages] = useState<StageRow[]>([]);
  const [addingMuni, setAddingMuni] = useState(false);
  const [newMuniName, setNewMuniName] = useState('');
  const [newMuniState, setNewMuniState] = useState('');
  const [muniError, setMuniError] = useState<string>('');
  const [savingMuni, setSavingMuni] = useState(false);
  const [deletingMuniId, setDeletingMuniId] = useState<string | null>(null);

  async function deleteMunicipality(muni: MuniRow) {
    setDeletingMuniId(muni.id);
    setMuniError('');
    try {
      // Show what will cascade so the user can decide knowingly.
      const [{ count: projectCount }, { count: importCount }] = await Promise.all([
        supabase
          .from('municipal_project')
          .select('id', { count: 'exact', head: true })
          .eq('municipality_id', muni.id),
        supabase
          .from('municipal_import')
          .select('id', { count: 'exact', head: true })
          .eq('municipality_id', muni.id),
      ]);

      const lines = [`Delete ${muni.name}, ${muni.state}?`, ''];
      if (projectCount && projectCount > 0) {
        lines.push(`This will also delete ${projectCount} project${projectCount === 1 ? '' : 's'} (including any drawn polygons).`);
      }
      if (importCount && importCount > 0) {
        lines.push(`${importCount} import log${importCount === 1 ? '' : 's'} will also be removed.`);
      }
      if ((projectCount ?? 0) === 0 && (importCount ?? 0) === 0) {
        lines.push('No projects or imports are attached.');
      }
      lines.push('', 'This cannot be undone.');

      if (!confirm(lines.join('\n'))) return;

      const { error } = await supabase.from('municipality').delete().eq('id', muni.id);
      if (error) throw error;

      setMunis((prev) => prev.filter((m) => m.id !== muni.id));
      refreshLayer('municipal_projects');
    } catch (e) {
      setMuniError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingMuniId(null);
    }
  }

  async function createMunicipality() {
    const name = newMuniName.trim();
    const state = newMuniState.trim().toUpperCase();
    if (!name || !state) {
      setMuniError('Both name and state are required.');
      return;
    }
    setSavingMuni(true);
    setMuniError('');
    try {
      const { data, error } = await supabase
        .from('municipality')
        .insert({ name, state })
        .select('id, name, state, display_color')
        .single();
      if (error) throw error;
      setMunis((prev) => [...prev, data as MuniRow].sort((a, b) => a.name.localeCompare(b.name)));
      setAddingMuni(false);
      setNewMuniName('');
      setNewMuniState('');
    } catch (e) {
      setMuniError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingMuni(false);
    }
  }
  const { style: polyStyle, update: updatePolyStyle, resetToDefaults: resetPolyStyle } = useMunicipalProjectPolygonStyle();
  const [polyStyleOpen, setPolyStyleOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [savingStageId, setSavingStageId] = useState<string | null>(null);
  const [stageColorError, setStageColorError] = useState<string>('');

  // Search: "do we already have this project?" — matches name / address / municipality
  // across all projects, ignoring the visibility filters so dupes can't hide behind them.
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MunicipalProjectMapRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchError, setSearchError] = useState<string>('');
  const searchContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const term = searchQuery.trim();
    if (term.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    setSearchError('');
    const timer = setTimeout(async () => {
      // PostgREST or() splits on commas, so strip chars that would break the filter syntax.
      const safe = term.replace(/[,()*]/g, ' ').trim();
      if (!safe) {
        setSearchResults([]);
        setSearching(false);
        return;
      }
      const like = `%${safe}%`;
      const { data, error } = await supabase
        .from('municipal_project_v')
        .select('*')
        .or(
          `project_name.ilike.${like},address.ilike.${like},geocoded_address.ilike.${like},municipality_name.ilike.${like}`
        )
        .limit(10);
      if (error) {
        setSearchError(error.message);
        setSearchResults([]);
      } else {
        setSearchResults((data ?? []) as MunicipalProjectMapRow[]);
      }
      setSearching(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Close the results dropdown on outside click so it doesn't linger over other UI.
  useEffect(() => {
    if (!searchOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (!searchContainerRef.current?.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [searchOpen]);

  function handleSelectResult(project: MunicipalProjectMapRow) {
    onSelectSearchResult?.(project);
    setSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
  }

  async function saveStageColor(stageId: string, newColor: string) {
    setSavingStageId(stageId);
    setStageColorError('');
    // Optimistic local update so the swatch UI feels immediate.
    setStages((prev) => prev.map((s) => (s.id === stageId ? { ...s, color: newColor } : s)));
    try {
      const { error } = await supabase
        .from('project_stage')
        .update({ color: newColor })
        .eq('id', stageId);
      if (error) throw error;
      refreshLayer('municipal_projects');
    } catch (e) {
      setStageColorError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingStageId(null);
    }
  }

  useEffect(() => {
    void (async () => {
      const [{ data: m }, { data: s }] = await Promise.all([
        supabase.from('municipality').select('id, name, state, display_color').order('name'),
        supabase.from('project_stage').select('id, name, color, sort_order').order('sort_order'),
      ]);
      setMunis((m ?? []) as MuniRow[]);
      setStages((s ?? []) as StageRow[]);
    })();
  }, []);

  const isCreateActive = createMode === 'municipal_project';

  const trimmedQuery = searchQuery.trim();
  const showSearchDropdown = searchOpen && trimmedQuery.length >= 2;

  return (
    <div className="space-y-3 text-xs">
      {/* Search — "do we already have this project?" */}
      <div ref={searchContainerRef} className="relative">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setSearchOpen(false);
                setSearchQuery('');
              }
            }}
            placeholder="Search projects by name, address, or city"
            className="w-full border border-[#8FA9C8] rounded pl-6 pr-6 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#4A6B94]"
          />
          <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[#8FA9C8] pointer-events-none">🔍</span>
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSearchResults([]);
              }}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 leading-none"
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
        {showSearchDropdown && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#8FA9C8] rounded shadow-lg z-50 max-h-64 overflow-y-auto">
            {searching ? (
              <div className="px-2 py-1.5 text-gray-500">Searching…</div>
            ) : searchError ? (
              <div className="px-2 py-1.5" style={{ color: '#A27B5C' }}>{searchError}</div>
            ) : searchResults.length === 0 ? (
              <div className="px-2 py-1.5 text-gray-500">
                No matches — looks like a new project.
              </div>
            ) : (
              searchResults.map((p) => {
                const title = p.project_name || p.address || '(unnamed)';
                const subParts: string[] = [];
                if (p.address && p.address !== title) subParts.push(p.address);
                if (p.municipality_name) {
                  subParts.push(
                    p.municipality_state ? `${p.municipality_name}, ${p.municipality_state}` : p.municipality_name
                  );
                }
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectResult(p)}
                    className="block w-full text-left px-2 py-1.5 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                  >
                    <div className="text-gray-900 font-medium truncate">{title}</div>
                    {subParts.length > 0 && (
                      <div className="text-[10px] text-gray-500 truncate">
                        {subParts.join(' · ')}
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Click-to-create + Export buttons */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setCreateMode(isCreateActive ? null : 'municipal_project')}
          className={`flex-1 px-2 py-1.5 rounded text-xs font-semibold ${
            isCreateActive
              ? 'bg-[#002147] text-white'
              : 'bg-white border border-[#8FA9C8] text-[#4A6B94] hover:bg-gray-50'
          }`}
        >
          {isCreateActive ? '🎯 Click map to drop pin' : '+ Add project'}
        </button>
        <button
          type="button"
          onClick={() => setExportOpen(true)}
          className="px-2 py-1.5 rounded text-xs font-semibold bg-white border border-[#8FA9C8] text-[#4A6B94] hover:bg-gray-50"
          title="Export polygons to KML"
        >
          📤 Export
        </button>
      </div>
      <MunicipalProjectExportModal isOpen={exportOpen} onClose={() => setExportOpen(false)} />

      {/* Show / hide pins and polygons independently */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={municipalProjectsShowPins}
            onChange={(e) => setMunicipalProjectsShowPins(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          <span className="text-gray-800">Show pins</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={municipalProjectsShowPolygons}
            onChange={(e) => setMunicipalProjectsShowPolygons(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          <span className="text-gray-800">Show polygons</span>
        </label>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setPolyStyleOpen((v) => !v)}
          className="font-semibold text-gray-700 mb-1 flex items-center gap-1"
        >
          <span>{polyStyleOpen ? '▾' : '▸'}</span>
          <span>Polygon style</span>
        </button>
        {polyStyleOpen && (
          <div className="space-y-2 pl-3">
            <StyleRow
              label="Fill opacity"
              value={polyStyle.fillOpacity}
              min={0}
              max={1}
              step={0.05}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => updatePolyStyle({ fillOpacity: v })}
            />
            <StyleRow
              label="Line opacity"
              value={polyStyle.strokeOpacity}
              min={0}
              max={1}
              step={0.05}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => updatePolyStyle({ strokeOpacity: v })}
            />
            <StyleRow
              label="Line weight"
              value={polyStyle.strokeWeight}
              min={1}
              max={6}
              step={0.5}
              format={(v) => `${v}px`}
              onChange={(v) => updatePolyStyle({ strokeWeight: v })}
            />
            <button
              type="button"
              onClick={resetPolyStyle}
              className="text-[10px] underline text-gray-500 hover:text-gray-800"
            >
              Reset to defaults ({Math.round(DEFAULT_POLYGON_STYLE.fillOpacity * 100)}% fill, {Math.round(DEFAULT_POLYGON_STYLE.strokeOpacity * 100)}% line, {DEFAULT_POLYGON_STYLE.strokeWeight}px)
            </button>

            {/* Per-stage color pickers — writes to project_stage.color (shared across users). */}
            <div className="border-t pt-2 mt-2" style={{ borderColor: '#EAEEF3' }}>
              <div className="text-gray-700 font-semibold mb-1">Stage colors</div>
              <div className="text-[10px] text-gray-500 mb-1.5">
                Shared across all users.
              </div>
              <div className="space-y-1">
                {stages.map((s) => (
                  <div key={s.id} className="flex items-center gap-2">
                    <input
                      type="color"
                      value={s.color || '#8FA9C8'}
                      onChange={(e) => saveStageColor(s.id, e.target.value)}
                      disabled={savingStageId === s.id}
                      className="w-8 h-5 border border-gray-300 rounded cursor-pointer disabled:opacity-40"
                      title={`Edit color for ${s.name}`}
                    />
                    <span className="text-gray-800 flex-1">{s.name}</span>
                    {savingStageId === s.id && (
                      <span className="text-[10px] text-gray-500">saving…</span>
                    )}
                  </div>
                ))}
              </div>
              {stageColorError && (
                <div className="text-[10px] mt-1" style={{ color: '#A27B5C' }}>
                  {stageColorError}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="font-semibold text-gray-700 mb-1">Housing units</div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            placeholder="Min"
            value={municipalProjectsMinUnits ?? ''}
            onChange={(e) => {
              const v = e.target.value.trim();
              setMunicipalProjectsMinUnits(v === '' ? null : Number(v));
            }}
            className="w-16 border border-gray-300 rounded px-1.5 py-0.5"
          />
          <span className="text-gray-400">–</span>
          <input
            type="number"
            min={0}
            placeholder="Max"
            value={municipalProjectsMaxUnits ?? ''}
            onChange={(e) => {
              const v = e.target.value.trim();
              setMunicipalProjectsMaxUnits(v === '' ? null : Number(v));
            }}
            className="w-16 border border-gray-300 rounded px-1.5 py-0.5"
          />
          {(municipalProjectsMinUnits != null || municipalProjectsMaxUnits != null) && (
            <button
              onClick={() => {
                setMunicipalProjectsMinUnits(null);
                setMunicipalProjectsMaxUnits(null);
              }}
              className="text-gray-500 hover:text-gray-800 text-[10px] underline"
            >
              clear
            </button>
          )}
        </div>
        <div className="text-gray-400 mt-0.5 text-[10px]">
          Projects without a unit count are hidden when a filter is set.
        </div>
      </div>

      <div>
        <div className="font-semibold text-gray-700 mb-1">Municipalities</div>
        {munis.length === 0 ? (
          <div className="text-gray-500">No municipalities yet.</div>
        ) : (
          <ul className="space-y-0.5">
            {munis.map((m) => {
              const visible = !municipalProjectsHiddenMunicipalityIds.has(m.id);
              const isDeleting = deletingMuniId === m.id;
              return (
                <li key={m.id} className="flex items-center gap-2 group">
                  <input
                    type="checkbox"
                    checked={visible}
                    onChange={() => toggleMunicipalProjectsMunicipality(m.id)}
                    className="h-3.5 w-3.5"
                  />
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: m.display_color || '#8FA9C8' }}
                  />
                  <span className="flex-1 text-gray-800">
                    {m.name}, {m.state}
                  </span>
                  <button
                    type="button"
                    onClick={() => deleteMunicipality(m)}
                    disabled={isDeleting}
                    title={`Delete ${m.name}, ${m.state}`}
                    aria-label={`Delete ${m.name}, ${m.state}`}
                    className="text-gray-300 hover:text-[#A27B5C] disabled:opacity-40 px-1 leading-none"
                  >
                    {isDeleting ? '…' : '×'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* Inline add-municipality form */}
        {!addingMuni ? (
          <button
            type="button"
            onClick={() => {
              setAddingMuni(true);
              setMuniError('');
            }}
            className="mt-1.5 text-[10px] underline text-gray-500 hover:text-gray-800"
          >
            + Add municipality
          </button>
        ) : (
          <div className="mt-1.5 space-y-1 border-t pt-1.5" style={{ borderColor: '#EAEEF3' }}>
            <div className="flex items-center gap-1">
              <input
                type="text"
                placeholder="Name"
                value={newMuniName}
                onChange={(e) => setNewMuniName(e.target.value)}
                className="flex-1 border border-gray-300 rounded px-1.5 py-0.5"
              />
              <input
                type="text"
                placeholder="ST"
                maxLength={2}
                value={newMuniState}
                onChange={(e) => setNewMuniState(e.target.value.toUpperCase())}
                className="w-10 border border-gray-300 rounded px-1.5 py-0.5"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={createMunicipality}
                disabled={savingMuni}
                className="px-2 py-0.5 text-[10px] rounded text-white font-semibold disabled:opacity-40"
                style={{ backgroundColor: '#002147' }}
              >
                {savingMuni ? 'Saving…' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddingMuni(false);
                  setNewMuniName('');
                  setNewMuniState('');
                  setMuniError('');
                }}
                className="text-[10px] underline text-gray-500"
              >
                Cancel
              </button>
              {muniError && (
                <span className="text-[10px]" style={{ color: '#A27B5C' }}>
                  {muniError}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="font-semibold text-gray-700 mb-1">Status</div>
        <ul className="space-y-0.5">
          {stages.map((s) => {
            const visible = !municipalProjectsHiddenStageIds.has(s.id);
            return (
              <li key={s.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={visible}
                  onChange={() => toggleMunicipalProjectsStage(s.id)}
                  className="h-3.5 w-3.5"
                />
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: s.color || '#8FA9C8' }}
                />
                <span className="text-gray-800">{s.name}</span>
              </li>
            );
          })}
          <li className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!municipalProjectsHiddenStageIds.has(null)}
              onChange={() => toggleMunicipalProjectsStage(null)}
              className="h-3.5 w-3.5"
            />
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: '#CBD5E1' }}
            />
            <span className="text-gray-500 italic">No status set</span>
          </li>
        </ul>
      </div>
    </div>
  );
};

interface StyleRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}

const StyleRow: React.FC<StyleRowProps> = ({ label, value, min, max, step, format, onChange }) => (
  <div className="flex items-center gap-2">
    <span className="text-gray-700 w-20">{label}</span>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="flex-1"
    />
    <span className="text-gray-500 w-10 text-right tabular-nums">{format(value)}</span>
  </div>
);

export default MunicipalProjectInlineFilters;
