// Starbucks Pipeline Report — types, writes and the Excel export.
// The report lists every board card (decisions §2.27) in the four Starbucks
// stages, in a hand-ranked order ("which deal we think is next"). Its editable
// fields live in starbucks_pipeline_report_row, keyed like the board: by
// site_submit when the card has one, else by deal.

import { supabase } from './supabaseClient';
import { exportToExcel, ExcelColumn, getLogoBase64 } from './excelExport';
import { upsertBoardState } from './boardWrites';
import { BallInCourt, BlockedOn, BoardStage, BOARD_STAGES, IMPLIED_COURT } from './starbucksBoard';

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
  // Board state (deal_activity_state) — drives Status in Pre-Submittal / LOI.
  ballInCourt: BallInCourt | null;
  ballInCourtParty: string | null;
  blockedOn: BlockedOn | null;
  needsPricing: boolean;
  needsSitePlan: boolean;
  status: string;              // free-text status (stages without a board status)
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

// ---- Status from board state ----------------------------------------------
// Pre-Submittal: what we're waiting on (the blocker). Negotiating LOI: whose
// court it's in. Other stages: the report's free-text status. Editing a board
// status writes deal_activity_state exactly like the board's classify controls,
// so the deal board reflects it (and the change posts to the chat history).

export type PreStatus = 'll_both' | 'll_pricing' | 'll_site_plan' | 'll' | 'site_control' | 'ready' | 'unset';
export type LoiStatus = 'us' | 'them' | 'unset';

export const PRE_STATUS_LABEL: Record<PreStatus, string> = {
  ll_both: 'Waiting on LL Pricing and Site Plan',
  ll_pricing: 'Waiting on LL Pricing',
  ll_site_plan: 'Waiting on LL Site Plan',
  ll: 'Waiting on LL',
  site_control: 'Waiting on Site Control',
  ready: 'Ready to Submit',
  unset: 'Not set',
};
// Offered in the picker ('ll' only appears when it's the current value).
export const PRE_STATUS_OPTIONS: PreStatus[] = ['ll_both', 'll_pricing', 'll_site_plan', 'site_control', 'ready', 'unset'];

export const LOI_STATUS_LABEL: Record<LoiStatus, string> = { us: 'Us', them: 'Them', unset: 'Not set' };
export const LOI_STATUS_OPTIONS: LoiStatus[] = ['us', 'them', 'unset'];

export type StatusKind = 'pre' | 'loi' | 'text';
export function statusKind(r: Pick<ReportRow, 'stageLabel'>): StatusKind {
  if (r.stageLabel === 'Pre-Submittal') return 'pre';
  if (r.stageLabel === 'Negotiating LOI') return 'loi';
  return 'text';
}

export function preStatusOf(r: Pick<ReportRow, 'blockedOn' | 'needsPricing' | 'needsSitePlan' | 'ballInCourt'>): PreStatus {
  if (r.blockedOn === 'awaiting_ll') {
    if (r.needsPricing && r.needsSitePlan) return 'll_both';
    if (r.needsPricing) return 'll_pricing';
    if (r.needsSitePlan) return 'll_site_plan';
    return 'll';
  }
  if (r.blockedOn === 'site_control') return 'site_control';
  return r.ballInCourt ? 'ready' : 'unset';
}

export function loiStatusOf(r: Pick<ReportRow, 'ballInCourt'>): LoiStatus {
  return r.ballInCourt === 'us' ? 'us' : r.ballInCourt === 'them' ? 'them' : 'unset';
}

// The Status text shown on the report and written to Excel. "Not set" exports
// blank — it's an internal gap, not a status for Starbucks.
export function statusText(r: ReportRow, forExport = false): string {
  const kind = statusKind(r);
  if (kind === 'pre') {
    const v = preStatusOf(r);
    return v === 'unset' && forExport ? '' : PRE_STATUS_LABEL[v];
  }
  if (kind === 'loi') {
    const v = loiStatusOf(r);
    if (v === 'unset') return forExport ? '' : LOI_STATUS_LABEL.unset;
    return `Court: ${LOI_STATUS_LABEL[v]}${r.ballInCourtParty ? ` (${r.ballInCourtParty})` : ''}`;
  }
  return r.status;
}

// Same patch shape ClassifyControls saves: a classification is a touch, so the
// clock restarts now. Changing who owes clears a party label that described
// the old side.
function boardPatch(r: ReportRow, next: { court: BallInCourt | null; blockedOn: BlockedOn | null; pricing: boolean; sitePlan: boolean }) {
  return {
    ball_in_court: next.court,
    ball_in_court_party: next.court === r.ballInCourt ? r.ballInCourtParty : null,
    ball_in_court_since: new Date().toISOString(),
    seeded_fallback: false,
    blocked_on: next.blockedOn,
    needs_pricing: next.blockedOn === 'awaiting_ll' ? next.pricing : false,
    needs_site_plan: next.blockedOn === 'awaiting_ll' ? next.sitePlan : false,
  };
}

export async function savePreStatus(r: ReportRow, v: PreStatus): Promise<void> {
  const ll = (pricing: boolean, sitePlan: boolean) =>
    ({ court: IMPLIED_COURT.awaiting_ll, blockedOn: 'awaiting_ll' as const, pricing, sitePlan });
  const next =
    v === 'll_both' ? ll(true, true)
    : v === 'll_pricing' ? ll(true, false)
    : v === 'll_site_plan' ? ll(false, true)
    : v === 'll' ? ll(r.needsPricing, r.needsSitePlan)
    : v === 'site_control' ? { court: IMPLIED_COURT.site_control, blockedOn: 'site_control' as const, pricing: false, sitePlan: false }
    : v === 'ready' ? { court: 'us' as const, blockedOn: null, pricing: false, sitePlan: false }
    : { court: null, blockedOn: null, pricing: false, sitePlan: false };
  await upsertBoardState(r, boardPatch(r, next));
}

export async function saveLoiStatus(r: ReportRow, v: LoiStatus): Promise<void> {
  await upsertBoardState(r, boardPatch(r, {
    court: v === 'unset' ? null : v,
    blockedOn: null, // blockers are Pre-Submittal only
    pricing: false,
    sitePlan: false,
  }));
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
    status: statusText(r, true),
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
