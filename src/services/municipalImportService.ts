import Papa from 'papaparse';
import { supabase } from '../lib/supabaseClient';
import { geocodingService, type GeocodeResult } from './geocodingService';

// ---------- Types ----------

export const TARGET_FIELDS = [
  'address',
  'parcel_numbers',
  'project_name',
  'single_family_lots',
  'townhouse_units',
  'duplex_units',
  'apt_units',
  'cottage_units',
  'total_housing_units',
  'zoning',
  'zoning_approval_date',
  'notes',
  'raw_stage_column',
  'ignore',
] as const;
export type TargetField = (typeof TARGET_FIELDS)[number];

export type ColumnMapping = Record<string, TargetField>;

export interface StageMappingDraft {
  source_column_name: string;
  project_stage_id: string | null;
  new_stage_name?: string;
  completion_values: string[];
  date_column: boolean;
  priority: number;
}

export interface ProjectStage {
  id: string;
  name: string;
  sort_order: number;
  color: string | null;
}

export interface Municipality {
  id: string;
  name: string;
  state: string;
  display_color: string | null;
  default_visible: boolean;
}

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

export interface NormalizedProject {
  source_row_number: number;
  address: string;
  project_name: string;
  phase_label: string;
  parcel_numbers: string[];
  single_family_lots: number | null;
  townhouse_units: number | null;
  duplex_units: number | null;
  apt_units: number | null;
  cottage_units: number | null;
  total_housing_units: number | null;
  zoning: string | null;
  zoning_approval_date: string | null;
  notes: string | null;
  raw_stages: Record<string, string>;
}

export interface ExistingProject extends NormalizedProject {
  id: string;
  status_override_id: string | null;
  centroid_set: boolean;
}

export type RowDiffKind = 'NEW' | 'UPDATE' | 'UNCHANGED' | 'SKIP_FOOTER';

export interface PreviewRow {
  kind: RowDiffKind;
  normalized: NormalizedProject;
  existing: ExistingProject | null;
  changedFields: string[];
  selected: boolean; // user toggles whether to apply this row
  geocode?: {
    status: 'pending' | 'success' | 'failed';
    lat?: number;
    lng?: number;
    formatted?: string;
    error?: string;
  };
}

// ---------- CSV parsing + hashing ----------

export function parseCsv(file: File): Promise<ParsedCsv> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim(),
      complete: (results) => {
        const PAPAPARSE_FALLBACK = /^_\d+$/;
        const rawHeaders = (results.meta.fields ?? []).filter(
          // Drop truly-empty header names AND papaparse fallback names ("_1", "_2", …)
          // which are auto-generated for trailing commas or duplicate empty header cells.
          // Those columns sometimes contain garbage (leftover spreadsheet calc cells like
          // 94, 73, #REF!) but they are not real data — drop them outright.
          (h) => h && h.length > 0 && !PAPAPARSE_FALLBACK.test(h)
        );
        const rawRows = (results.data ?? []).map((r) => {
          const cleaned: Record<string, string> = {};
          for (const h of rawHeaders) cleaned[h] = (r[h] ?? '').toString().trim();
          return cleaned;
        });
        // Also drop columns whose values are blank in every row.
        const headers = rawHeaders.filter((h) => rawRows.some((r) => r[h] !== ''));
        const rows = rawRows.map((r) => {
          const out: Record<string, string> = {};
          for (const h of headers) out[h] = r[h];
          return out;
        });
        resolve({ headers, rows });
      },
      error: (err) => reject(err),
    });
  });
}

export async function computeFileSha256(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ---------- Fuzzy column matching ----------

const FUZZY_PATTERNS: Array<{ field: Exclude<TargetField, 'raw_stage_column' | 'ignore'>; patterns: RegExp[] }> = [
  { field: 'address', patterns: [/^address$/i, /\bstreet\s*address\b/i, /\bsite\s*address\b/i] },
  { field: 'parcel_numbers', patterns: [/^parcel/i, /\bparcel\s*(no|number|#|numbers)\b/i, /\btax\s*parcel\b/i] },
  { field: 'project_name', patterns: [/^project\s*name$/i, /\bproject$/i, /\bsubdivision\b/i, /\bdevelopment\s*name\b/i] },
  { field: 'single_family_lots', patterns: [/single\s*family/i, /\bsfr\b/i, /\bsfd\b/i] },
  { field: 'townhouse_units', patterns: [/townhouse/i, /townhome/i, /\btownhouses?\b/i] },
  { field: 'duplex_units', patterns: [/duplex/i] },
  { field: 'apt_units', patterns: [/^apts?\b/i, /apartment/i, /multifamily/i, /multi-family/i] },
  { field: 'cottage_units', patterns: [/cottage/i] },
  { field: 'total_housing_units', patterns: [/total.*units?/i, /total.*housing/i, /\btotal\s+residential\b/i] },
  { field: 'zoning_approval_date', patterns: [/zoning.*date/i, /rezone.*date/i, /\bapproval\s*date\b/i] },
  { field: 'zoning', patterns: [/^zoning$/i, /\bzone$/i] },
  { field: 'notes', patterns: [/^notes?$/i, /comments?/i, /remarks/i] },
];

export function fuzzyMatchHeader(header: string): TargetField | null {
  for (const { field, patterns } of FUZZY_PATTERNS) {
    if (patterns.some((p) => p.test(header))) return field;
  }
  return null;
}

export function autoMapColumns(
  headers: string[],
  previousMapping?: ColumnMapping
): ColumnMapping {
  const mapping: ColumnMapping = {};
  const claimedFields = new Set<TargetField>();

  for (const h of headers) {
    if (previousMapping && previousMapping[h]) {
      mapping[h] = previousMapping[h];
      if (mapping[h] !== 'raw_stage_column' && mapping[h] !== 'ignore') claimedFields.add(mapping[h]);
      continue;
    }
    const guess = fuzzyMatchHeader(h);
    if (guess && !claimedFields.has(guess)) {
      mapping[h] = guess;
      claimedFields.add(guess);
    } else {
      // Heuristic: short workflow-y columns (≤25 chars, no digits) default to raw_stage_column.
      // Everything else defaults to ignore so the user explicitly opts in.
      mapping[h] = h.length <= 30 ? 'raw_stage_column' : 'ignore';
    }
  }
  return mapping;
}

// ---------- Row normalization ----------

const PHASE_REGEX = /\bPhase\s+([IVXLC]+|\d+)\b/i;

export function extractPhaseLabel(notes: string | null | undefined): string {
  if (!notes) return '';
  const m = notes.match(PHASE_REGEX);
  return m ? `Phase ${m[1].toUpperCase()}` : '';
}

export function parseUnitNumber(value: string | null | undefined): number | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '-' || trimmed.startsWith('#')) return null;
  const cleaned = trimmed.replace(/,/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parseImportDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Already ISO?
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  // M/D/YYYY or MM/DD/YYYY
  const m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let [, mm, dd, yyyy] = m;
    if (yyyy.length === 2) yyyy = (Number(yyyy) > 50 ? '19' : '20') + yyyy;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  // Year-only ("2004")
  if (/^\d{4}$/.test(trimmed)) return `${trimmed}-01-01`;
  // Fallback to Date.parse
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return null;
}

export function parseParcels(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,;\n]/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export function isFooterRow(normalized: NormalizedProject): boolean {
  return normalized.project_name.trim() === '' && normalized.address.trim() === '';
}

export function normalizeRow(
  row: Record<string, string>,
  columnMapping: ColumnMapping,
  rowNumber: number
): NormalizedProject {
  const byField: Partial<Record<TargetField, string>> = {};
  const rawStages: Record<string, string> = {};

  for (const [sourceCol, target] of Object.entries(columnMapping)) {
    const val = row[sourceCol] ?? '';
    if (target === 'raw_stage_column') {
      rawStages[sourceCol] = val;
    } else if (target !== 'ignore') {
      byField[target] = val;
    }
  }

  const notes = byField.notes ?? null;
  return {
    source_row_number: rowNumber,
    address: (byField.address ?? '').trim(),
    project_name: (byField.project_name ?? '').trim(),
    phase_label: extractPhaseLabel(notes),
    parcel_numbers: parseParcels(byField.parcel_numbers),
    single_family_lots: parseUnitNumber(byField.single_family_lots),
    townhouse_units: parseUnitNumber(byField.townhouse_units),
    duplex_units: parseUnitNumber(byField.duplex_units),
    apt_units: parseUnitNumber(byField.apt_units),
    cottage_units: parseUnitNumber(byField.cottage_units),
    total_housing_units: parseUnitNumber(byField.total_housing_units),
    zoning: byField.zoning?.trim() || null,
    zoning_approval_date: parseImportDate(byField.zoning_approval_date),
    notes: notes?.trim() || null,
    raw_stages: rawStages,
  };
}

// ---------- Status computation ----------

const NON_COMPLETION_VALUES = new Set(['', 'no', 'n/a', 'not applicable', 'in progress', 'tbd']);

export interface StageMappingForCompute {
  source_column_name: string;
  project_stage_id: string;
  completion_values: string[];
  date_column: boolean;
  priority: number;
}

export function computeStatusStageId(
  rawStages: Record<string, string>,
  mappings: StageMappingForCompute[]
): string | null {
  let bestStage: { stage_id: string; priority: number } | null = null;

  for (const m of mappings) {
    const raw = (rawStages[m.source_column_name] ?? '').trim();
    if (!raw) continue;
    let complete = false;
    if (m.date_column) {
      complete = parseImportDate(raw) !== null;
    } else if (m.completion_values.length > 0) {
      complete = m.completion_values.some((v) => v.toLowerCase() === raw.toLowerCase());
    } else {
      complete = !NON_COMPLETION_VALUES.has(raw.toLowerCase());
    }
    if (complete && (bestStage === null || m.priority > bestStage.priority)) {
      bestStage = { stage_id: m.project_stage_id, priority: m.priority };
    }
  }
  return bestStage?.stage_id ?? null;
}

// ---------- Dedup ----------

export function dedupeKey(p: { address: string; project_name: string; phase_label: string }): string {
  return [p.address, p.project_name, p.phase_label].map((s) => s.trim().toLowerCase()).join('||');
}

export async function fetchExistingProjects(
  municipalityId: string
): Promise<Map<string, ExistingProject>> {
  const PAGE = 1000;
  const out = new Map<string, ExistingProject>();
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('municipal_project')
      .select(
        'id, address, project_name, phase_label, parcel_numbers, single_family_lots, townhouse_units, duplex_units, apt_units, cottage_units, total_housing_units, zoning, zoning_approval_date, notes, raw_stages, status_override_id, centroid'
      )
      .eq('municipality_id', municipalityId)
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    for (const row of data ?? []) {
      const existing: ExistingProject = {
        id: row.id,
        source_row_number: 0,
        address: row.address ?? '',
        project_name: row.project_name ?? '',
        phase_label: row.phase_label ?? '',
        parcel_numbers: (row.parcel_numbers as string[] | null) ?? [],
        single_family_lots: row.single_family_lots,
        townhouse_units: row.townhouse_units,
        duplex_units: row.duplex_units,
        apt_units: row.apt_units,
        cottage_units: row.cottage_units,
        total_housing_units: row.total_housing_units,
        zoning: row.zoning,
        zoning_approval_date: row.zoning_approval_date,
        notes: row.notes,
        raw_stages: (row.raw_stages as Record<string, string> | null) ?? {},
        status_override_id: row.status_override_id,
        centroid_set: row.centroid != null,
      };
      out.set(dedupeKey(existing), existing);
    }
    if (!data || data.length < PAGE) break;
    offset += PAGE;
  }
  return out;
}

const DIFF_FIELDS: Array<keyof NormalizedProject> = [
  'address',
  'project_name',
  'phase_label',
  'parcel_numbers',
  'single_family_lots',
  'townhouse_units',
  'duplex_units',
  'apt_units',
  'cottage_units',
  'total_housing_units',
  'zoning',
  'zoning_approval_date',
  'notes',
  'raw_stages',
];

export function diffRow(
  next: NormalizedProject,
  prev: ExistingProject
): string[] {
  const changed: string[] = [];
  for (const f of DIFF_FIELDS) {
    const a = JSON.stringify(next[f] ?? null);
    const b = JSON.stringify(prev[f] ?? null);
    if (a !== b) changed.push(f);
  }
  return changed;
}

// ---------- Geocoding ----------

export interface GeocodeOutcome {
  ok: boolean;
  lat?: number;
  lng?: number;
  formatted?: string;
  error?: string;
}

const GEOCODE_CACHE = new Map<string, GeocodeOutcome>();

export async function geocodeAddressForImport(
  address: string,
  municipality: { name: string; state: string }
): Promise<GeocodeOutcome> {
  const trimmed = address.trim();
  if (!trimmed) return { ok: false, error: 'Empty address' };

  // Append municipality + state if address doesn't already include them
  const lower = trimmed.toLowerCase();
  const needsMuni = !lower.includes(municipality.name.toLowerCase());
  const needsState = !lower.includes(`, ${municipality.state.toLowerCase()}`);
  const fullAddress =
    trimmed +
    (needsMuni ? `, ${municipality.name}` : '') +
    (needsState ? `, ${municipality.state}` : '');

  const cached = GEOCODE_CACHE.get(fullAddress);
  if (cached) return cached;

  const result = await geocodingService.geocodeAddress(fullAddress);
  let outcome: GeocodeOutcome;
  if ('error' in result) {
    outcome = { ok: false, error: result.error };
  } else {
    const r = result as GeocodeResult;
    outcome = { ok: true, lat: r.latitude, lng: r.longitude, formatted: r.formatted_address };
  }
  GEOCODE_CACHE.set(fullAddress, outcome);
  return outcome;
}

// ---------- Import orchestration ----------

export interface ImportInput {
  municipalityId: string;
  municipality: { name: string; state: string };
  fileName: string;
  fileSha256: string;
  uploadedBy: string | null;
  columnMapping: ColumnMapping;
  stageMappings: StageMappingForCompute[];
  rows: PreviewRow[]; // already normalized + (optionally) geocoded
}

export interface ImportResult {
  importId: string;
  inserted: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; error: string }>;
}

export async function runImport(input: ImportInput): Promise<ImportResult> {
  const { municipalityId, fileName, fileSha256, uploadedBy, columnMapping, rows } = input;

  // 1) Create the audit log row up front so we have its id to stamp on projects.
  const { data: importRow, error: importErr } = await supabase
    .from('municipal_import')
    .insert({
      municipality_id: municipalityId,
      file_name: fileName,
      file_sha256: fileSha256,
      uploaded_by: uploadedBy,
      column_mapping: columnMapping,
      status: 'pending',
      row_count: rows.length,
    })
    .select('id')
    .single();
  if (importErr || !importRow) throw importErr ?? new Error('Failed to create import row');
  const importId = importRow.id as string;

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const errors: Array<{ row: number; error: string }> = [];

  for (const r of rows) {
    if (!r.selected || r.kind === 'SKIP_FOOTER' || r.kind === 'UNCHANGED') {
      skipped++;
      continue;
    }

    const status_stage_id = computeStatusStageId(r.normalized.raw_stages, input.stageMappings);
    const centroid =
      r.geocode?.status === 'success' && r.geocode.lat != null && r.geocode.lng != null
        ? `SRID=4326;POINT(${r.geocode.lng} ${r.geocode.lat})`
        : null;

    const payload = {
      municipality_id: municipalityId,
      address: r.normalized.address,
      project_name: r.normalized.project_name,
      phase_label: r.normalized.phase_label,
      parcel_numbers: r.normalized.parcel_numbers,
      single_family_lots: r.normalized.single_family_lots,
      townhouse_units: r.normalized.townhouse_units,
      duplex_units: r.normalized.duplex_units,
      apt_units: r.normalized.apt_units,
      cottage_units: r.normalized.cottage_units,
      total_housing_units: r.normalized.total_housing_units,
      zoning: r.normalized.zoning,
      zoning_approval_date: r.normalized.zoning_approval_date,
      notes: r.normalized.notes,
      raw_stages: r.normalized.raw_stages,
      status_stage_id,
      geocoded_address: r.geocode?.formatted ?? null,
      centroid,
      source_import_id: importId,
      source_row_number: r.normalized.source_row_number,
    };

    try {
      if (r.kind === 'NEW') {
        const { error } = await supabase.from('municipal_project').insert(payload);
        if (error) throw error;
        inserted++;
      } else if (r.kind === 'UPDATE' && r.existing) {
        // Don't overwrite centroid if existing already has one (preserves drawn polygons in Phase 3).
        const updatePayload: Record<string, unknown> = { ...payload };
        if (r.existing.centroid_set) delete updatePayload.centroid;
        const { error } = await supabase
          .from('municipal_project')
          .update(updatePayload)
          .eq('id', r.existing.id);
        if (error) throw error;
        updated++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ row: r.normalized.source_row_number, error: msg });
    }
  }

  // 2) Finalize the audit log row.
  const status = errors.length === 0 ? 'success' : inserted + updated > 0 ? 'partial' : 'failed';
  await supabase
    .from('municipal_import')
    .update({
      status,
      inserted_count: inserted,
      updated_count: updated,
      skipped_count: skipped,
      error_log: errors,
    })
    .eq('id', importId);

  return { importId, inserted, updated, skipped, errors };
}

// ---------- Lookups + mapping persistence ----------

export async function loadMunicipalities(): Promise<Municipality[]> {
  const { data, error } = await supabase
    .from('municipality')
    .select('id, name, state, display_color, default_visible')
    .order('name');
  if (error) throw error;
  return (data ?? []) as Municipality[];
}

export async function createMunicipality(name: string, state: string): Promise<Municipality> {
  const { data, error } = await supabase
    .from('municipality')
    .insert({ name: name.trim(), state: state.trim().toUpperCase() })
    .select('id, name, state, display_color, default_visible')
    .single();
  if (error) throw error;
  return data as Municipality;
}

export async function loadProjectStages(): Promise<ProjectStage[]> {
  const { data, error } = await supabase
    .from('project_stage')
    .select('id, name, sort_order, color')
    .order('sort_order');
  if (error) throw error;
  return (data ?? []) as ProjectStage[];
}

export async function createProjectStage(name: string): Promise<ProjectStage> {
  const { data: existing } = await supabase
    .from('project_stage')
    .select('id, name, sort_order, color')
    .ilike('name', name.trim())
    .maybeSingle();
  if (existing) return existing as ProjectStage;
  // Sort order = current max + 10
  const { data: maxRow } = await supabase
    .from('project_stage')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSort = (maxRow?.sort_order ?? 0) + 10;
  const { data, error } = await supabase
    .from('project_stage')
    .insert({ name: name.trim(), sort_order: nextSort })
    .select('id, name, sort_order, color')
    .single();
  if (error) throw error;
  return data as ProjectStage;
}

export async function loadLatestImportForMunicipality(
  municipalityId: string
): Promise<{ column_mapping: ColumnMapping } | null> {
  const { data, error } = await supabase
    .from('municipal_import')
    .select('column_mapping')
    .eq('municipality_id', municipalityId)
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data ? { column_mapping: data.column_mapping as ColumnMapping } : null;
}

export async function loadStageMappings(
  municipalityId: string
): Promise<StageMappingForCompute[]> {
  const { data, error } = await supabase
    .from('municipality_stage_mapping')
    .select('source_column_name, project_stage_id, completion_values, date_column, priority')
    .eq('municipality_id', municipalityId);
  if (error) throw error;
  return (data ?? []) as StageMappingForCompute[];
}

export async function persistStageMappings(
  municipalityId: string,
  drafts: StageMappingDraft[]
): Promise<StageMappingForCompute[]> {
  // Upsert each draft individually (small N: typically <10 stage columns per muni).
  const persisted: StageMappingForCompute[] = [];
  for (const d of drafts) {
    if (!d.project_stage_id) continue;
    const { data, error } = await supabase
      .from('municipality_stage_mapping')
      .upsert(
        {
          municipality_id: municipalityId,
          source_column_name: d.source_column_name,
          project_stage_id: d.project_stage_id,
          completion_values: d.completion_values,
          date_column: d.date_column,
          priority: d.priority,
        },
        { onConflict: 'municipality_id,source_column_name' }
      )
      .select('source_column_name, project_stage_id, completion_values, date_column, priority')
      .single();
    if (error) throw error;
    persisted.push(data as StageMappingForCompute);
  }
  return persisted;
}
