import { useEffect, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useAuth } from '../contexts/AuthContext';
import {
  autoMapColumns,
  computeFileSha256,
  createMunicipality,
  createProjectStage,
  diffRow,
  fetchExistingProjects,
  geocodeAddressForImport,
  isFooterRow,
  loadLatestImportForMunicipality,
  loadMunicipalities,
  loadProjectStages,
  loadStageMappings,
  normalizeRow,
  parseCsv,
  persistStageMappings,
  runImport,
  TARGET_FIELDS,
  type ColumnMapping,
  type ImportResult,
  type Municipality,
  type ParsedCsv,
  type PreviewRow,
  type ProjectStage,
  type StageMappingDraft,
  type StageMappingForCompute,
  type TargetField,
} from '../services/municipalImportService';

const STEPS = ['Upload', 'Column Mapping', 'Stage Mapping', 'Preview', 'Import'] as const;
type Step = (typeof STEPS)[number];

const BRAND = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
  terracotta: '#A27B5C',
};

export default function MunicipalImportPage() {
  const { userTableId } = useAuth();
  const [step, setStep] = useState<Step>('Upload');

  // Reference data
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [projectStages, setProjectStages] = useState<ProjectStage[]>([]);

  // Step 1
  const [selectedMuniId, setSelectedMuniId] = useState<string>('');
  const [creatingMuni, setCreatingMuni] = useState(false);
  const [newMuniName, setNewMuniName] = useState('');
  const [newMuniState, setNewMuniState] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [fileSha, setFileSha] = useState<string>('');

  // Step 2
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});

  // Step 3
  const [stageDrafts, setStageDrafts] = useState<StageMappingDraft[]>([]);

  // Step 4
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [geocoding, setGeocoding] = useState(false);

  // Step 5
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string>('');

  const selectedMuni = useMemo(
    () => municipalities.find((m) => m.id === selectedMuniId) ?? null,
    [municipalities, selectedMuniId]
  );

  // ---------- Bootstrap ----------
  useEffect(() => {
    (async () => {
      try {
        const [munis, stages] = await Promise.all([loadMunicipalities(), loadProjectStages()]);
        setMunicipalities(munis);
        setProjectStages(stages);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  // ---------- Dropzone ----------
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'text/csv': ['.csv'] },
    maxFiles: 1,
    onDrop: async (accepted) => {
      const f = accepted[0];
      if (!f) return;
      setError('');
      setFile(f);
      try {
        const [p, sha] = await Promise.all([parseCsv(f), computeFileSha256(f)]);
        setParsed(p);
        setFileSha(sha);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
  });

  // ---------- Navigation actions ----------

  async function goToColumnMapping() {
    if (!selectedMuniId || !parsed) return;
    setError('');
    try {
      const prior = await loadLatestImportForMunicipality(selectedMuniId);
      const mapping = autoMapColumns(parsed.headers, prior?.column_mapping);
      setColumnMapping(mapping);
      setStep('Column Mapping');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function goToStageMapping() {
    setError('');
    try {
      const stageColumns = Object.entries(columnMapping)
        .filter(([, v]) => v === 'raw_stage_column')
        .map(([k]) => k);
      const persisted = await loadStageMappings(selectedMuniId);
      const drafts: StageMappingDraft[] = stageColumns.map((col, idx) => {
        const prior = persisted.find((p) => p.source_column_name === col);
        return {
          source_column_name: col,
          project_stage_id: prior?.project_stage_id ?? null,
          completion_values: prior?.completion_values ?? ['Yes'],
          date_column: prior?.date_column ?? false,
          priority: prior?.priority ?? (idx + 1) * 10,
        };
      });
      setStageDrafts(drafts);
      setStep('Stage Mapping');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function goToPreview() {
    if (!parsed || !selectedMuni) return;
    setError('');
    try {
      // Persist stage mappings (and create any new canonical stages first).
      const drafts: StageMappingDraft[] = [];
      let stagesChanged = false;
      for (const d of stageDrafts) {
        let stageId = d.project_stage_id;
        if (!stageId && d.new_stage_name?.trim()) {
          const created = await createProjectStage(d.new_stage_name.trim());
          stageId = created.id;
          stagesChanged = true;
        }
        drafts.push({ ...d, project_stage_id: stageId });
      }
      if (stagesChanged) {
        setProjectStages(await loadProjectStages());
      }
      await persistStageMappings(selectedMuniId, drafts);

      // Normalize + diff
      const existing = await fetchExistingProjects(selectedMuniId);
      const rows: PreviewRow[] = parsed.rows.map((raw, idx) => {
        const normalized = normalizeRow(raw, columnMapping, idx + 2); // +2 = header row + 1-index
        if (isFooterRow(normalized)) {
          return {
            kind: 'SKIP_FOOTER',
            normalized,
            existing: null,
            changedFields: [],
            selected: false,
          };
        }
        const ex = existing.get([normalized.address, normalized.project_name, normalized.phase_label]
          .map((s) => s.trim().toLowerCase()).join('||'));
        if (!ex) {
          return { kind: 'NEW', normalized, existing: null, changedFields: [], selected: true };
        }
        const changed = diffRow(normalized, ex);
        return {
          kind: changed.length === 0 ? 'UNCHANGED' : 'UPDATE',
          normalized,
          existing: ex,
          changedFields: changed,
          selected: changed.length > 0,
        };
      });
      setPreviewRows(rows);
      setStep('Preview');

      // Kick off geocoding in the background (only for rows that will be imported).
      void geocodeRows(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function geocodeRows(rows: PreviewRow[]) {
    if (!selectedMuni) return;
    setGeocoding(true);
    try {
      // Geocode NEW rows; UPDATE rows preserve existing centroid (see runImport).
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (r.kind !== 'NEW' || !r.selected) continue;
        setPreviewRows((prev) => {
          const copy = [...prev];
          copy[i] = { ...copy[i], geocode: { status: 'pending' } };
          return copy;
        });
        const outcome = await geocodeAddressForImport(r.normalized.address, selectedMuni);
        setPreviewRows((prev) => {
          const copy = [...prev];
          copy[i] = {
            ...copy[i],
            geocode: outcome.ok
              ? {
                  status: 'success',
                  lat: outcome.lat,
                  lng: outcome.lng,
                  formatted: outcome.formatted,
                }
              : { status: 'failed', error: outcome.error },
          };
          return copy;
        });
      }
    } finally {
      setGeocoding(false);
    }
  }

  async function submit() {
    if (!selectedMuni || !file) return;
    setError('');
    setImporting(true);
    try {
      const stageMappings: StageMappingForCompute[] = stageDrafts
        .filter((d): d is StageMappingDraft & { project_stage_id: string } => !!d.project_stage_id)
        .map((d) => ({
          source_column_name: d.source_column_name,
          project_stage_id: d.project_stage_id,
          completion_values: d.completion_values,
          date_column: d.date_column,
          priority: d.priority,
        }));

      const res = await runImport({
        municipalityId: selectedMuniId,
        municipality: { name: selectedMuni.name, state: selectedMuni.state },
        fileName: file.name,
        fileSha256: fileSha,
        uploadedBy: userTableId ?? null,
        columnMapping,
        stageMappings,
        rows: previewRows,
      });
      setResult(res);
      setStep('Import');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  }

  // ---------- Render ----------

  return (
    <div className="min-h-screen bg-[#F8FAFC] py-6">
      <div className="max-w-7xl mx-auto px-4">
        <h1 className="text-2xl font-bold mb-1" style={{ color: BRAND.midnight }}>
          Municipal Project Importer
        </h1>
        <p className="text-sm mb-6" style={{ color: BRAND.steel }}>
          Upload a municipality's CSV, map columns, preview, and insert with per-row deduplication.
        </p>

        <Stepper current={step} />

        {error && (
          <div
            className="my-4 p-3 rounded border-l-4 bg-white text-sm"
            style={{ borderColor: BRAND.terracotta, color: BRAND.midnight }}
          >
            {error}
          </div>
        )}

        <div className="mt-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          {step === 'Upload' && (
            <UploadStep
              municipalities={municipalities}
              selectedMuniId={selectedMuniId}
              onSelect={setSelectedMuniId}
              creatingMuni={creatingMuni}
              setCreatingMuni={setCreatingMuni}
              newMuniName={newMuniName}
              setNewMuniName={setNewMuniName}
              newMuniState={newMuniState}
              setNewMuniState={setNewMuniState}
              onCreateMuni={async () => {
                if (!newMuniName.trim() || !newMuniState.trim()) return;
                try {
                  const created = await createMunicipality(newMuniName, newMuniState);
                  const next = [...municipalities, created].sort((a, b) =>
                    a.name.localeCompare(b.name)
                  );
                  setMunicipalities(next);
                  setSelectedMuniId(created.id);
                  setCreatingMuni(false);
                  setNewMuniName('');
                  setNewMuniState('');
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                }
              }}
              file={file}
              parsed={parsed}
              getRootProps={getRootProps}
              getInputProps={getInputProps}
              isDragActive={isDragActive}
              onNext={goToColumnMapping}
            />
          )}

          {step === 'Column Mapping' && parsed && (
            <ColumnMappingStep
              headers={parsed.headers}
              mapping={columnMapping}
              setMapping={setColumnMapping}
              previewRow={parsed.rows[0]}
              onBack={() => setStep('Upload')}
              onNext={goToStageMapping}
            />
          )}

          {step === 'Stage Mapping' && (
            <StageMappingStep
              drafts={stageDrafts}
              setDrafts={setStageDrafts}
              stages={projectStages}
              sampleValues={(col) => {
                const samples = (parsed?.rows ?? [])
                  .map((r) => r[col])
                  .filter((v) => v && v.trim())
                  .slice(0, 5);
                return Array.from(new Set(samples));
              }}
              onBack={() => setStep('Column Mapping')}
              onNext={goToPreview}
            />
          )}

          {step === 'Preview' && (
            <PreviewStep
              rows={previewRows}
              setRows={setPreviewRows}
              geocoding={geocoding}
              importing={importing}
              onBack={() => setStep('Stage Mapping')}
              onSubmit={submit}
            />
          )}

          {step === 'Import' && result && (
            <ResultStep
              result={result}
              onAnother={() => {
                setStep('Upload');
                setFile(null);
                setParsed(null);
                setFileSha('');
                setColumnMapping({});
                setStageDrafts([]);
                setPreviewRows([]);
                setResult(null);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Stepper ----------

function Stepper({ current }: { current: Step }) {
  const currentIdx = STEPS.indexOf(current);
  return (
    <ol className="flex items-center gap-2 text-sm">
      {STEPS.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <li key={s} className="flex items-center gap-2">
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
              style={{
                backgroundColor: active ? BRAND.midnight : done ? BRAND.steel : '#FFFFFF',
                color: active || done ? '#FFFFFF' : BRAND.slate,
                border: `1px solid ${active || done ? 'transparent' : BRAND.slate}`,
              }}
            >
              {i + 1}
            </span>
            <span style={{ color: active ? BRAND.midnight : BRAND.steel, fontWeight: active ? 600 : 400 }}>
              {s}
            </span>
            {i < STEPS.length - 1 && <span style={{ color: BRAND.slate }}>→</span>}
          </li>
        );
      })}
    </ol>
  );
}

// ---------- Step 1: Upload ----------

interface UploadStepProps {
  municipalities: Municipality[];
  selectedMuniId: string;
  onSelect: (id: string) => void;
  creatingMuni: boolean;
  setCreatingMuni: (v: boolean) => void;
  newMuniName: string;
  setNewMuniName: (v: string) => void;
  newMuniState: string;
  setNewMuniState: (v: string) => void;
  onCreateMuni: () => void;
  file: File | null;
  parsed: ParsedCsv | null;
  getRootProps: () => Record<string, unknown>;
  getInputProps: () => Record<string, unknown>;
  isDragActive: boolean;
  onNext: () => void;
}

function UploadStep(props: UploadStepProps) {
  const canContinue = !!props.selectedMuniId && !!props.parsed;
  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-semibold mb-2" style={{ color: BRAND.midnight }}>
          1. Municipality
        </label>
        {!props.creatingMuni ? (
          <div className="flex gap-2">
            <select
              value={props.selectedMuniId}
              onChange={(e) => props.onSelect(e.target.value)}
              className="flex-1 border rounded px-3 py-2 text-sm"
              style={{ borderColor: BRAND.slate }}
            >
              <option value="">— Select municipality —</option>
              {props.municipalities.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}, {m.state}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => props.setCreatingMuni(true)}
              className="px-3 py-2 text-sm rounded border"
              style={{ borderColor: BRAND.steel, color: BRAND.steel }}
            >
              + New
            </button>
          </div>
        ) : (
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Name (e.g. Winder)"
                value={props.newMuniName}
                onChange={(e) => props.setNewMuniName(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
                style={{ borderColor: BRAND.slate }}
              />
            </div>
            <div className="w-24">
              <input
                type="text"
                placeholder="GA"
                maxLength={2}
                value={props.newMuniState}
                onChange={(e) => props.setNewMuniState(e.target.value.toUpperCase())}
                className="w-full border rounded px-3 py-2 text-sm"
                style={{ borderColor: BRAND.slate }}
              />
            </div>
            <button
              type="button"
              onClick={props.onCreateMuni}
              className="px-3 py-2 text-sm rounded text-white"
              style={{ backgroundColor: BRAND.midnight }}
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => props.setCreatingMuni(false)}
              className="px-3 py-2 text-sm rounded border"
              style={{ borderColor: BRAND.slate, color: BRAND.slate }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-semibold mb-2" style={{ color: BRAND.midnight }}>
          2. CSV File
        </label>
        <div
          {...props.getRootProps()}
          className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer"
          style={{ borderColor: props.isDragActive ? BRAND.midnight : BRAND.slate }}
        >
          <input {...props.getInputProps()} />
          {props.file ? (
            <div style={{ color: BRAND.midnight }}>
              <div className="font-semibold">{props.file.name}</div>
              <div className="text-xs mt-1" style={{ color: BRAND.steel }}>
                {props.parsed
                  ? `${props.parsed.headers.length} columns × ${props.parsed.rows.length} rows`
                  : 'Parsing…'}
              </div>
            </div>
          ) : (
            <div style={{ color: BRAND.steel }}>
              {props.isDragActive ? 'Drop the CSV here…' : 'Drag a CSV here, or click to browse'}
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          disabled={!canContinue}
          onClick={props.onNext}
          className="px-5 py-2 rounded text-white text-sm font-semibold disabled:opacity-40"
          style={{ backgroundColor: BRAND.midnight }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}

// ---------- Step 2: Column Mapping ----------

interface ColumnMappingStepProps {
  headers: string[];
  mapping: ColumnMapping;
  setMapping: (m: ColumnMapping) => void;
  previewRow: Record<string, string> | undefined;
  onBack: () => void;
  onNext: () => void;
}

function ColumnMappingStep(props: ColumnMappingStepProps) {
  const requiredFields: TargetField[] = ['address', 'project_name'];
  const mappedFields = new Set(Object.values(props.mapping));
  const missingRequired = requiredFields.filter((f) => !mappedFields.has(f));
  const canContinue = missingRequired.length === 0;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm" style={{ color: BRAND.steel }}>
          Map each CSV column to a target field. Columns mapped as <b>raw_stage_column</b> will be configured in the next step.
        </p>
      </div>

      <div className="border rounded overflow-hidden" style={{ borderColor: BRAND.slate }}>
        <table className="w-full text-sm">
          <thead style={{ backgroundColor: '#F8FAFC' }}>
            <tr>
              <th className="text-left px-3 py-2" style={{ color: BRAND.midnight }}>CSV column</th>
              <th className="text-left px-3 py-2" style={{ color: BRAND.midnight }}>Sample</th>
              <th className="text-left px-3 py-2" style={{ color: BRAND.midnight }}>Target field</th>
            </tr>
          </thead>
          <tbody>
            {props.headers.map((h) => (
              <tr key={h} className="border-t" style={{ borderColor: '#EAEEF3' }}>
                <td className="px-3 py-2 font-mono text-xs" style={{ color: BRAND.midnight }}>{h}</td>
                <td className="px-3 py-2 text-xs" style={{ color: BRAND.steel }}>
                  {(props.previewRow?.[h] ?? '').slice(0, 50) || '—'}
                </td>
                <td className="px-3 py-2">
                  <select
                    value={props.mapping[h] ?? 'ignore'}
                    onChange={(e) =>
                      props.setMapping({ ...props.mapping, [h]: e.target.value as TargetField })
                    }
                    className="border rounded px-2 py-1 text-xs w-full max-w-xs"
                    style={{ borderColor: BRAND.slate }}
                  >
                    {TARGET_FIELDS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!canContinue && (
        <div className="text-xs" style={{ color: BRAND.terracotta }}>
          Required: {missingRequired.join(', ')}
        </div>
      )}

      <div className="flex justify-between">
        <button
          type="button"
          onClick={props.onBack}
          className="px-4 py-2 rounded border text-sm"
          style={{ borderColor: BRAND.slate, color: BRAND.steel }}
        >
          Back
        </button>
        <button
          type="button"
          onClick={props.onNext}
          disabled={!canContinue}
          className="px-5 py-2 rounded text-white text-sm font-semibold disabled:opacity-40"
          style={{ backgroundColor: BRAND.midnight }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}

// ---------- Step 3: Stage Mapping ----------

interface StageMappingStepProps {
  drafts: StageMappingDraft[];
  setDrafts: (d: StageMappingDraft[]) => void;
  stages: ProjectStage[];
  sampleValues: (col: string) => string[];
  onBack: () => void;
  onNext: () => void;
}

function StageMappingStep(props: StageMappingStepProps) {
  const update = (idx: number, patch: Partial<StageMappingDraft>) => {
    const copy = [...props.drafts];
    copy[idx] = { ...copy[idx], ...patch };
    props.setDrafts(copy);
  };

  const canContinue = props.drafts.every(
    (d) => d.project_stage_id != null || (d.new_stage_name?.trim()?.length ?? 0) > 0
  );

  if (props.drafts.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm" style={{ color: BRAND.steel }}>
          No stage columns to map. (You can revisit this on the Column Mapping step if some columns should be raw_stage_column.)
        </p>
        <div className="flex justify-between">
          <button
            type="button"
            onClick={props.onBack}
            className="px-4 py-2 rounded border text-sm"
            style={{ borderColor: BRAND.slate, color: BRAND.steel }}
          >
            Back
          </button>
          <button
            type="button"
            onClick={props.onNext}
            className="px-5 py-2 rounded text-white text-sm font-semibold"
            style={{ backgroundColor: BRAND.midnight }}
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: BRAND.steel }}>
        For each stage column, pick the canonical project stage it maps to. Higher priority = later in the workflow (used to compute each project's current status).
      </p>

      <div className="space-y-3">
        {props.drafts.map((d, i) => {
          const samples = props.sampleValues(d.source_column_name);
          return (
            <div
              key={d.source_column_name}
              className="border rounded p-3"
              style={{ borderColor: BRAND.slate }}
            >
              <div className="grid grid-cols-12 gap-3 items-start">
                <div className="col-span-3">
                  <div className="font-mono text-xs" style={{ color: BRAND.midnight }}>
                    {d.source_column_name}
                  </div>
                  <div className="text-xs mt-1" style={{ color: BRAND.slate }}>
                    Samples: {samples.length > 0 ? samples.join(', ') : '—'}
                  </div>
                </div>

                <div className="col-span-3">
                  <label className="block text-xs mb-1" style={{ color: BRAND.steel }}>Maps to</label>
                  <select
                    value={d.project_stage_id ?? '__NEW__'}
                    onChange={(e) => {
                      if (e.target.value === '__NEW__') {
                        update(i, { project_stage_id: null });
                      } else {
                        update(i, { project_stage_id: e.target.value, new_stage_name: '' });
                      }
                    }}
                    className="w-full border rounded px-2 py-1 text-xs"
                    style={{ borderColor: BRAND.slate }}
                  >
                    <option value="">—</option>
                    {props.stages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                    <option value="__NEW__">+ Create new canonical stage…</option>
                  </select>
                  {d.project_stage_id === null && (
                    <input
                      type="text"
                      placeholder="New stage name"
                      value={d.new_stage_name ?? ''}
                      onChange={(e) => update(i, { new_stage_name: e.target.value })}
                      className="w-full border rounded px-2 py-1 text-xs mt-1"
                      style={{ borderColor: BRAND.slate }}
                    />
                  )}
                </div>

                <div className="col-span-3">
                  <label className="block text-xs mb-1" style={{ color: BRAND.steel }}>Completion</label>
                  <select
                    value={d.date_column ? 'date' : d.completion_values.length > 0 ? 'values' : 'any'}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === 'date') update(i, { date_column: true, completion_values: [] });
                      else if (v === 'values')
                        update(i, { date_column: false, completion_values: ['Yes'] });
                      else update(i, { date_column: false, completion_values: [] });
                    }}
                    className="w-full border rounded px-2 py-1 text-xs"
                    style={{ borderColor: BRAND.slate }}
                  >
                    <option value="date">Date present</option>
                    <option value="values">Value match</option>
                    <option value="any">Any non-blank</option>
                  </select>
                  {!d.date_column && d.completion_values.length > 0 && (
                    <input
                      type="text"
                      value={d.completion_values.join(', ')}
                      onChange={(e) =>
                        update(i, {
                          completion_values: e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="Yes, Complete"
                      className="w-full border rounded px-2 py-1 text-xs mt-1"
                      style={{ borderColor: BRAND.slate }}
                    />
                  )}
                </div>

                <div className="col-span-3">
                  <label className="block text-xs mb-1" style={{ color: BRAND.steel }}>Priority</label>
                  <input
                    type="number"
                    value={d.priority}
                    onChange={(e) => update(i, { priority: Number(e.target.value) })}
                    className="w-full border rounded px-2 py-1 text-xs"
                    style={{ borderColor: BRAND.slate }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between">
        <button
          type="button"
          onClick={props.onBack}
          className="px-4 py-2 rounded border text-sm"
          style={{ borderColor: BRAND.slate, color: BRAND.steel }}
        >
          Back
        </button>
        <button
          type="button"
          onClick={props.onNext}
          disabled={!canContinue}
          className="px-5 py-2 rounded text-white text-sm font-semibold disabled:opacity-40"
          style={{ backgroundColor: BRAND.midnight }}
        >
          Continue to preview
        </button>
      </div>
    </div>
  );
}

// ---------- Step 4: Preview ----------

interface PreviewStepProps {
  rows: PreviewRow[];
  setRows: (r: PreviewRow[]) => void;
  geocoding: boolean;
  importing: boolean;
  onBack: () => void;
  onSubmit: () => void;
}

function PreviewStep(props: PreviewStepProps) {
  const counts = useMemo(() => {
    const c = { NEW: 0, UPDATE: 0, UNCHANGED: 0, SKIP_FOOTER: 0, selected: 0 };
    for (const r of props.rows) {
      c[r.kind]++;
      if (r.selected) c.selected++;
    }
    return c;
  }, [props.rows]);

  const toggleAll = (kind: PreviewRow['kind'], value: boolean) => {
    props.setRows(props.rows.map((r) => (r.kind === kind ? { ...r, selected: value } : r)));
  };

  const toggleOne = (idx: number) => {
    const copy = [...props.rows];
    copy[idx] = { ...copy[idx], selected: !copy[idx].selected };
    props.setRows(copy);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 text-xs">
        <Badge label={`${counts.NEW} NEW`} color="#22c55e" />
        <Badge label={`${counts.UPDATE} UPDATE`} color={BRAND.steel} />
        <Badge label={`${counts.UNCHANGED} unchanged`} color={BRAND.slate} />
        <Badge label={`${counts.SKIP_FOOTER} footer rows skipped`} color={BRAND.slate} />
        <span className="ml-auto text-xs" style={{ color: BRAND.midnight }}>
          {counts.selected} rows will be imported {props.geocoding && '• geocoding…'}
        </span>
      </div>

      <div className="flex gap-2 text-xs">
        <button
          onClick={() => toggleAll('NEW', true)}
          className="px-2 py-1 rounded border"
          style={{ borderColor: BRAND.slate, color: BRAND.steel }}
        >
          Select all NEW
        </button>
        <button
          onClick={() => toggleAll('UPDATE', true)}
          className="px-2 py-1 rounded border"
          style={{ borderColor: BRAND.slate, color: BRAND.steel }}
        >
          Select all UPDATE
        </button>
        <button
          onClick={() => toggleAll('UNCHANGED', false)}
          className="px-2 py-1 rounded border"
          style={{ borderColor: BRAND.slate, color: BRAND.steel }}
        >
          Deselect UNCHANGED
        </button>
      </div>

      <div className="border rounded overflow-x-auto" style={{ borderColor: BRAND.slate }}>
        <table className="w-full text-xs">
          <thead style={{ backgroundColor: '#F8FAFC' }}>
            <tr>
              <th className="text-left px-2 py-2 w-8"></th>
              <th className="text-left px-2 py-2" style={{ color: BRAND.midnight }}>Row</th>
              <th className="text-left px-2 py-2" style={{ color: BRAND.midnight }}>Status</th>
              <th className="text-left px-2 py-2" style={{ color: BRAND.midnight }}>Project</th>
              <th className="text-left px-2 py-2" style={{ color: BRAND.midnight }}>Address</th>
              <th className="text-left px-2 py-2" style={{ color: BRAND.midnight }}>Phase</th>
              <th className="text-left px-2 py-2" style={{ color: BRAND.midnight }}>Total units</th>
              <th className="text-left px-2 py-2" style={{ color: BRAND.midnight }}>Geocode</th>
              <th className="text-left px-2 py-2" style={{ color: BRAND.midnight }}>Diff</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((r, idx) => {
              if (r.kind === 'SKIP_FOOTER') return null;
              return (
                <tr key={idx} className="border-t" style={{ borderColor: '#EAEEF3' }}>
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      checked={r.selected}
                      onChange={() => toggleOne(idx)}
                    />
                  </td>
                  <td className="px-2 py-2" style={{ color: BRAND.steel }}>
                    {r.normalized.source_row_number}
                  </td>
                  <td className="px-2 py-2">
                    <KindBadge kind={r.kind} />
                  </td>
                  <td className="px-2 py-2" style={{ color: BRAND.midnight }}>
                    {r.normalized.project_name || <span style={{ color: BRAND.slate }}>—</span>}
                  </td>
                  <td className="px-2 py-2" style={{ color: BRAND.steel }}>
                    {r.normalized.address || <span style={{ color: BRAND.slate }}>—</span>}
                  </td>
                  <td className="px-2 py-2" style={{ color: BRAND.steel }}>
                    {r.normalized.phase_label || '—'}
                  </td>
                  <td className="px-2 py-2 text-right" style={{ color: BRAND.steel }}>
                    {r.normalized.total_housing_units ?? '—'}
                  </td>
                  <td className="px-2 py-2 text-xs" style={{ color: BRAND.steel }}>
                    {r.geocode?.status === 'success' && '✓'}
                    {r.geocode?.status === 'failed' && (
                      <span style={{ color: BRAND.terracotta }}>✗ {r.geocode.error}</span>
                    )}
                    {r.geocode?.status === 'pending' && '…'}
                    {!r.geocode && r.kind === 'NEW' && '—'}
                  </td>
                  <td className="px-2 py-2 text-xs" style={{ color: BRAND.steel }}>
                    {r.kind === 'UPDATE' && r.changedFields.length > 0 && (
                      <details>
                        <summary className="cursor-pointer">
                          {r.changedFields.length} changed
                        </summary>
                        <ul className="mt-1 ml-2 space-y-0.5">
                          {r.changedFields.map((f) => (
                            <li key={f}>
                              <span className="font-mono">{f}</span>:{' '}
                              <span style={{ color: BRAND.terracotta }}>
                                {JSON.stringify((r.existing as unknown as Record<string, unknown>)?.[f] ?? null)}
                              </span>{' '}
                              →{' '}
                              <span style={{ color: '#22c55e' }}>
                                {JSON.stringify((r.normalized as unknown as Record<string, unknown>)[f] ?? null)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between">
        <button
          type="button"
          onClick={props.onBack}
          className="px-4 py-2 rounded border text-sm"
          style={{ borderColor: BRAND.slate, color: BRAND.steel }}
        >
          Back
        </button>
        <button
          type="button"
          onClick={props.onSubmit}
          disabled={props.importing || counts.selected === 0}
          className="px-5 py-2 rounded text-white text-sm font-semibold disabled:opacity-40"
          style={{ backgroundColor: BRAND.midnight }}
        >
          {props.importing ? 'Importing…' : `Import ${counts.selected} rows`}
        </button>
      </div>
    </div>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="px-2 py-1 rounded text-xs font-semibold"
      style={{ backgroundColor: color, color: '#FFFFFF' }}
    >
      {label}
    </span>
  );
}

function KindBadge({ kind }: { kind: PreviewRow['kind'] }) {
  const map: Record<PreviewRow['kind'], { label: string; color: string }> = {
    NEW: { label: 'NEW', color: '#22c55e' },
    UPDATE: { label: 'UPDATE', color: BRAND.steel },
    UNCHANGED: { label: 'unchanged', color: BRAND.slate },
    SKIP_FOOTER: { label: 'footer', color: BRAND.slate },
  };
  const { label, color } = map[kind];
  return (
    <span
      className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
      style={{ backgroundColor: color, color: '#FFFFFF' }}
    >
      {label}
    </span>
  );
}

// ---------- Step 5: Result ----------

function ResultStep({ result, onAnother }: { result: ImportResult; onAnother: () => void }) {
  return (
    <div className="space-y-4">
      <div className="text-center py-6">
        <div className="text-3xl mb-2" style={{ color: BRAND.midnight }}>
          ✓
        </div>
        <h2 className="text-xl font-bold" style={{ color: BRAND.midnight }}>
          Import complete
        </h2>
        <p className="text-sm mt-1" style={{ color: BRAND.steel }}>
          Inserted {result.inserted} • Updated {result.updated} • Skipped {result.skipped}
          {result.errors.length > 0 && ` • ${result.errors.length} errors`}
        </p>
      </div>

      {result.errors.length > 0 && (
        <div className="border rounded p-3" style={{ borderColor: BRAND.terracotta }}>
          <div className="font-semibold mb-2" style={{ color: BRAND.terracotta }}>
            Errors
          </div>
          <ul className="text-xs space-y-1" style={{ color: BRAND.midnight }}>
            {result.errors.map((e, i) => (
              <li key={i}>
                Row {e.row}: {e.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-center">
        <button
          type="button"
          onClick={onAnother}
          className="px-5 py-2 rounded text-white text-sm font-semibold"
          style={{ backgroundColor: BRAND.midnight }}
        >
          Import another file
        </button>
      </div>
    </div>
  );
}
