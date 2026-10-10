// Starbucks Pipeline Report — types, writes and the Excel export.
// The report lists every board card (decisions §2.27) in the four Starbucks
// stages, in a hand-ranked order ("which deal we think is next"). Its editable
// fields live in starbucks_pipeline_report_row, keyed like the board: by
// site_submit when the card has one, else by deal.

import { supabase } from './supabaseClient';
import { exportToExcel, ExcelColumn, getLogoBase64 } from './excelExport';
import { BoardStage, BOARD_STAGES } from './starbucksBoard';

export type ReportField = 'status' | 'package_status' | 'notes';

export interface ReportRow {
  id: string;                  // card key (site_submit id, or deal id when none)
  siteSubmitId: string | null;
  dealId: string | null;
  name: string;                // deal name → site submit name → property name
  city: string | null;
  stageLabel: BoardStage;
  parked: boolean;
  mapUrl: string | null;
  sortOrder: number | null;    // null = never ranked
  status: string;
  packageStatus: string;
  notes: string;
}

interface RowKey {
  siteSubmitId: string | null;
  dealId: string | null;
}

function keyOf(r: RowKey): { column: 'site_submit_id' | 'deal_id'; value: string } {
  if (r.siteSubmitId) return { column: 'site_submit_id', value: r.siteSubmitId };
  if (r.dealId) return { column: 'deal_id', value: r.dealId };
  throw new Error('Report row has neither a site submit nor a deal');
}

export function googleMapsUrl(lat: number | null | undefined, lng: number | null | undefined): string | null {
  return lat != null && lng != null ? `https://www.google.com/maps?q=${lat},${lng}` : null;
}

// Rows never ranked fall in after the ranked ones, furthest-along stage first.
export function compareReportRows(a: ReportRow, b: ReportRow): number {
  if (a.sortOrder != null && b.sortOrder != null) return a.sortOrder - b.sortOrder;
  if (a.sortOrder != null) return -1;
  if (b.sortOrder != null) return 1;
  const stage = BOARD_STAGES.indexOf(b.stageLabel) - BOARD_STAGES.indexOf(a.stageLabel);
  return stage !== 0 ? stage : a.name.localeCompare(b.name);
}

export async function saveReportField(r: RowKey, field: ReportField, value: string): Promise<void> {
  const key = keyOf(r);
  const { error } = await supabase
    .from('starbucks_pipeline_report_row')
    .upsert({ [key.column]: key.value, [field]: value.trim() || null }, { onConflict: key.column });
  if (error) throw error;
}

// Persist the whole order as 1..n. Upserts carry only key + sort_order, so the
// text fields of existing rows are untouched.
export async function saveReportOrder(rows: RowKey[]): Promise<void> {
  const bySite: { site_submit_id: string; sort_order: number }[] = [];
  const byDeal: { deal_id: string; sort_order: number }[] = [];
  rows.forEach((r, i) => {
    const key = keyOf(r);
    if (key.column === 'site_submit_id') bySite.push({ site_submit_id: key.value, sort_order: i + 1 });
    else byDeal.push({ deal_id: key.value, sort_order: i + 1 });
  });
  if (bySite.length) {
    const { error } = await supabase
      .from('starbucks_pipeline_report_row')
      .upsert(bySite, { onConflict: 'site_submit_id' });
    if (error) throw error;
  }
  if (byDeal.length) {
    const { error } = await supabase
      .from('starbucks_pipeline_report_row')
      .upsert(byDeal, { onConflict: 'deal_id' });
    if (error) throw error;
  }
}

function localDateStamp(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Exports in exactly the order shown on the report.
export async function exportPipelineReport(rows: ReportRow[], accountName: string): Promise<void> {
  const columns: ExcelColumn[] = [
    { header: '#', key: 'rank', width: 6, style: { alignment: { horizontal: 'center' } } },
    { header: 'Deal / Site Submit', key: 'name', width: 36 },
    { header: 'City', key: 'city', width: 16 },
    { header: 'Stage', key: 'stage', width: 20 },
    { header: 'Status', key: 'status', width: 36 },
    { header: 'Package Status', key: 'package_status', width: 18 },
    { header: 'Notes', key: 'notes', width: 55 },
    { header: 'Map', key: 'map', width: 12, isHyperlink: true, hyperlinkText: 'View Map', style: { alignment: { horizontal: 'center' } } },
  ];
  const data = rows.map((r, i) => ({
    rank: i + 1,
    name: r.name,
    city: r.city ?? '',
    stage: r.stageLabel,
    status: r.status,
    package_status: r.packageStatus,
    notes: r.notes,
    map: r.mapUrl ?? '',
  }));
  const logoBase64 = await getLogoBase64();
  const safeName = accountName.replace(/[^a-zA-Z0-9]+/g, '_');
  await exportToExcel({
    filename: `${safeName}_Pipeline_Report_${localDateStamp()}.xlsx`,
    sheetName: 'Pipeline',
    columns,
    data,
    title: `${accountName} Pipeline Report`,
    subtitle: 'Pre-Submittal · Submitted-Reviewing · Negotiating LOI · At Lease/PSA — ordered by expected next to move',
    logoBase64: logoBase64 || undefined,
    landscape: true,
  });
}
