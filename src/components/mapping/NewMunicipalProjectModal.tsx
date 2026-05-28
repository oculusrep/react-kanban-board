import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { geocodingService } from '../../services/geocodingService';

interface Municipality {
  id: string;
  name: string;
  state: string;
}

interface ProjectStage {
  id: string;
  name: string;
  sort_order: number;
}

interface CreatedProject {
  id: string;
}

interface Props {
  isOpen: boolean;
  coordinates: { lat: number; lng: number } | null;
  onClose: () => void;
  onCreated: (project: CreatedProject) => void;
}

const BRAND = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
  terracotta: '#A27B5C',
};

const NewMunicipalProjectModal: React.FC<Props> = ({ isOpen, coordinates, onClose, onCreated }) => {
  const [munis, setMunis] = useState<Municipality[]>([]);
  const [stages, setStages] = useState<ProjectStage[]>([]);

  // Form state
  const [municipalityId, setMunicipalityId] = useState<string>('');
  const [projectName, setProjectName] = useState('');
  const [phaseLabel, setPhaseLabel] = useState('');
  const [address, setAddress] = useState('');
  const [totalUnits, setTotalUnits] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [statusOverrideId, setStatusOverrideId] = useState<string>('');

  const [reverseGeocoding, setReverseGeocoding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>('');

  // Inline "create new municipality" support
  const [creatingMuni, setCreatingMuni] = useState(false);
  const [newMuniName, setNewMuniName] = useState('');
  const [newMuniState, setNewMuniState] = useState('');
  const [muniSaving, setMuniSaving] = useState(false);
  const [muniError, setMuniError] = useState<string>('');

  async function createNewMunicipality() {
    const name = newMuniName.trim();
    const state = newMuniState.trim().toUpperCase();
    if (!name || !state) {
      setMuniError('Both name and state are required.');
      return;
    }
    setMuniSaving(true);
    setMuniError('');
    try {
      const { data, error: insertErr } = await supabase
        .from('municipality')
        .insert({ name, state })
        .select('id, name, state')
        .single();
      if (insertErr) throw insertErr;
      const created = data as Municipality;
      setMunis((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setMunicipalityId(created.id);
      setCreatingMuni(false);
      setNewMuniName('');
      setNewMuniState('');
    } catch (e) {
      setMuniError(e instanceof Error ? e.message : String(e));
    } finally {
      setMuniSaving(false);
    }
  }

  // Load reference data when opened.
  useEffect(() => {
    if (!isOpen) return;
    void (async () => {
      const [{ data: m }, { data: s }] = await Promise.all([
        supabase.from('municipality').select('id, name, state').order('name'),
        supabase.from('project_stage').select('id, name, sort_order').order('sort_order'),
      ]);
      setMunis((m ?? []) as Municipality[]);
      setStages((s ?? []) as ProjectStage[]);
    })();
  }, [isOpen]);

  // Reverse-geocode the clicked coordinates to prefill the address. Uses the shared
  // geocodingService (OSM-first with Google fallback, rate-limited) so it matches the
  // rest of the codebase and respects the same API key configuration.
  useEffect(() => {
    if (!isOpen || !coordinates) return;
    setReverseGeocoding(true);
    setError('');
    void (async () => {
      try {
        const result = await geocodingService.reverseGeocode(coordinates.lat, coordinates.lng);
        if ('error' in result) {
          console.warn('Reverse geocode failed:', result.error);
        } else if (result.formatted_address) {
          setAddress(result.formatted_address);
        }
      } catch (e) {
        console.warn('Reverse geocode threw:', e);
      } finally {
        setReverseGeocoding(false);
      }
    })();
  }, [isOpen, coordinates]);

  // Reset on close.
  useEffect(() => {
    if (isOpen) return;
    setMunicipalityId('');
    setProjectName('');
    setPhaseLabel('');
    setAddress('');
    setTotalUnits('');
    setNotes('');
    setStatusOverrideId('');
    setError('');
  }, [isOpen]);

  if (!isOpen || !coordinates) return null;

  const canSubmit = !!municipalityId && !saving;

  async function submit() {
    if (!coordinates) return;
    setSaving(true);
    setError('');
    try {
      const parsedUnits = totalUnits.trim() === '' ? null : Number(totalUnits);
      if (parsedUnits != null && !Number.isFinite(parsedUnits)) {
        throw new Error('Total housing units must be a number.');
      }

      // If the user typed an address, forward-geocode it so subsequent re-geocode flows
      // (Remove polygon, Verify location) have a clean reference. If the field is blank,
      // fall back to a coordinates-string address so the NOT NULL constraint is satisfied
      // and dedup still works (different pins at different lat/lng will be distinct).
      const userAddress = address.trim();
      let geocodedAddress: string | null = null;
      if (userAddress.length > 0) {
        try {
          const fwd = await geocodingService.geocodeAddress(userAddress);
          if (!('error' in fwd)) geocodedAddress = fwd.formatted_address;
        } catch {
          /* non-fatal */
        }
      }
      const addressToSave =
        userAddress || `${coordinates.lat.toFixed(5)}, ${coordinates.lng.toFixed(5)}`;

      const { data, error: insertErr } = await supabase
        .from('municipal_project')
        .insert({
          municipality_id: municipalityId,
          address: addressToSave,
          project_name: projectName.trim(),
          phase_label: phaseLabel.trim(),
          total_housing_units: parsedUnits,
          notes: notes.trim() || null,
          status_override_id: statusOverrideId || null,
          centroid: `SRID=4326;POINT(${coordinates.lng} ${coordinates.lat})`,
          geocoded_address: geocodedAddress,
        })
        .select('id')
        .single();
      if (insertErr) throw insertErr;

      onCreated({ id: data.id as string });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Must sit above the "Layers" popover (z-[10001]) and the create-mode banner (z-[10001]). */}
      <div className="fixed inset-0 z-[10100] bg-black bg-opacity-30" onClick={onClose} />
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[10101] w-[440px] bg-white rounded-lg shadow-2xl"
        style={{ border: `1px solid ${BRAND.slate}` }}
      >
        <header
          className="px-5 py-3 border-b flex items-center justify-between"
          style={{ borderColor: '#EAEEF3' }}
        >
          <div>
            <h2 className="text-lg font-semibold" style={{ color: BRAND.midnight }}>
              New municipal project
            </h2>
            <div className="text-xs mt-0.5" style={{ color: BRAND.slate }}>
              Pin at {coordinates.lat.toFixed(5)}, {coordinates.lng.toFixed(5)}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">
            ×
          </button>
        </header>

        <div className="px-5 py-4 space-y-3 text-sm">
          <Field label="Municipality" required>
            {!creatingMuni ? (
              <div className="flex items-center gap-2">
                <select
                  value={municipalityId}
                  onChange={(e) => setMunicipalityId(e.target.value)}
                  className="flex-1 border rounded px-2 py-1.5"
                  style={{ borderColor: BRAND.slate }}
                >
                  <option value="">— select —</option>
                  {munis.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}, {m.state}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    setCreatingMuni(true);
                    setMuniError('');
                  }}
                  className="px-2 py-1.5 text-xs rounded border whitespace-nowrap"
                  style={{ borderColor: BRAND.steel, color: BRAND.steel }}
                >
                  + New
                </button>
              </div>
            ) : (
              <div className="space-y-1.5 p-2 rounded border" style={{ borderColor: BRAND.slate, backgroundColor: '#F8FAFC' }}>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Name (e.g. Snellville)"
                    value={newMuniName}
                    onChange={(e) => setNewMuniName(e.target.value)}
                    className="flex-1 border rounded px-2 py-1"
                    style={{ borderColor: BRAND.slate }}
                  />
                  <input
                    type="text"
                    placeholder="ST"
                    maxLength={2}
                    value={newMuniState}
                    onChange={(e) => setNewMuniState(e.target.value.toUpperCase())}
                    className="w-14 border rounded px-2 py-1"
                    style={{ borderColor: BRAND.slate }}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={createNewMunicipality}
                    disabled={muniSaving}
                    className="px-3 py-1 text-xs rounded text-white font-semibold disabled:opacity-40"
                    style={{ backgroundColor: BRAND.midnight }}
                  >
                    {muniSaving ? 'Saving…' : 'Create'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCreatingMuni(false);
                      setNewMuniName('');
                      setNewMuniState('');
                      setMuniError('');
                    }}
                    className="px-3 py-1 text-xs rounded border"
                    style={{ borderColor: BRAND.slate, color: BRAND.steel }}
                  >
                    Cancel
                  </button>
                  {muniError && (
                    <span className="text-xs" style={{ color: BRAND.terracotta }}>
                      {muniError}
                    </span>
                  )}
                </div>
              </div>
            )}
          </Field>

          <Field label="Project name">
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="(optional)"
              className="w-full border rounded px-2 py-1.5"
              style={{ borderColor: BRAND.slate }}
            />
          </Field>

          <Field label="Phase">
            <input
              type="text"
              value={phaseLabel}
              onChange={(e) => setPhaseLabel(e.target.value)}
              placeholder="e.g. Phase I (optional)"
              className="w-full border rounded px-2 py-1.5"
              style={{ borderColor: BRAND.slate }}
            />
          </Field>

          <Field
            label="Address"
            hint={reverseGeocoding ? 'Reverse-geocoding…' : 'Optional — pin location is enough'}
          >
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="(leave blank to use pin coordinates)"
              className="w-full border rounded px-2 py-1.5"
              style={{ borderColor: BRAND.slate }}
            />
          </Field>

          <Field label="Total housing units">
            <input
              type="number"
              min={0}
              value={totalUnits}
              onChange={(e) => setTotalUnits(e.target.value)}
              placeholder="(optional)"
              className="w-full border rounded px-2 py-1.5"
              style={{ borderColor: BRAND.slate }}
            />
          </Field>

          <Field label="Initial status">
            <select
              value={statusOverrideId}
              onChange={(e) => setStatusOverrideId(e.target.value)}
              className="w-full border rounded px-2 py-1.5"
              style={{ borderColor: BRAND.slate }}
            >
              <option value="">— leave blank (Planning) —</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full border rounded px-2 py-1.5 resize-y"
              style={{ borderColor: BRAND.slate }}
            />
          </Field>

          {error && (
            <div className="text-xs" style={{ color: BRAND.terracotta }}>
              {error}
            </div>
          )}
        </div>

        <footer className="px-5 py-3 border-t flex items-center justify-end gap-2" style={{ borderColor: '#EAEEF3' }}>
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
            onClick={submit}
            disabled={!canSubmit}
            className="px-4 py-1.5 text-sm rounded text-white font-semibold disabled:opacity-40"
            style={{ backgroundColor: BRAND.midnight }}
          >
            {saving ? 'Saving…' : 'Create project'}
          </button>
        </footer>
      </div>
    </>
  );
};

const Field: React.FC<{
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}> = ({ label, required, hint, children }) => (
  <div>
    <div className="flex items-baseline justify-between mb-0.5">
      <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: BRAND.steel }}>
        {label}
        {required && <span style={{ color: BRAND.terracotta }}> *</span>}
      </label>
      {hint && (
        <span className="text-[10px]" style={{ color: BRAND.slate }}>
          {hint}
        </span>
      )}
    </div>
    {children}
  </div>
);

export default NewMunicipalProjectModal;
