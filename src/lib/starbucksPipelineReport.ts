// Starbucks Pipeline Report — types, writes and the Excel export.
// The report lists every board card (decisions §2.27) in the four Starbucks
// stages, in a hand-ranked order ("which deal we think is next"). Its editable
// fields live in starbucks_pipeline_report_row, keyed like the board: by
// site_submit when the card has one, else by deal.

import { supabase } from './supabaseClient';
import { exportToExcel, ExcelColumn, getLogoBase64 } from './excelExport';
import { upsertBoardState } from './boardWrites';
import { BallInCourt, BlockedOn, BoardStage, BOARD_STAGES, Heat, IMPLIED_COURT } from './starbucksBoard';

export type ReportField = 'package_status' | 'notes';

export interface ReportRow {
  id: string;                  // card key (site_submit id, or deal id when none)
  siteSubmitId: string | null;
  dealId: string | null;
  name: string;                // deal name → site submit name → property name
  city: string | null;
  stageLabel: BoardStage;
  clientId: string | null;
  accountToken: string;        // short account label ("SBUX", "JW") for the All view
  accountName: string;         // filter label ("Starbucks", "Coastal GA")
  parked: boolean;
  mapUrl: string | null;
  sortOrder: number | null;    // null = never ranked
  // Board state (deal_activity_state) — Status detail, Court and the clock.
  ballInCourt: BallInCourt | null;
  ballInCourtParty: string | null;
  ballInCourtSince: string | null; // ISO — when the current court started
  blockedOn: BlockedOn | null;
  needsPricing: boolean;
  needsSitePlan: boolean;
  days: number;                // whole days since ball_in_court_since (Eastern)
  heat: Heat;                  // board heat — same warm/hot thresholds as the tiles
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

// ---- Status + court from board state -------------------------------------
// Status is the stage; Pre-Submittal adds what we're waiting on (the blocker).
// Court is its own column on every stage. Both edit deal_activity_state with
// the same fields the board's classify controls write, so the deal board
// reflects the change (and the history trigger posts it to the chat).

export type PreStatus = 'll_both' | 'll_pricing' | 'll_site_plan' | 'll' | 'site_control' | 'ready' | 'unset';

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

export type StatusKind = 'pre' | 'stage';
export function statusKind(r: Pick<ReportRow, 'stageLabel'>): StatusKind {
  return r.stageLabel === 'Pre-Submittal' ? 'pre' : 'stage';
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

// Status text (report filter + Excel): "Pre-Submittal – Waiting on LL Pricing",
// "At Lease/PSA". An unset detail is left off — an internal gap, not a status.
export function statusText(r: ReportRow): string {
  if (statusKind(r) === 'pre') {
    const v = preStatusOf(r);
    if (v !== 'unset') return `${r.stageLabel} – ${PRE_STATUS_LABEL[v]}`;
  }
  return r.stageLabel;
}

export type CourtValue = 'us' | 'them' | 'unset';
export function courtOf(r: Pick<ReportRow, 'ballInCourt'>): CourtValue {
  return r.ballInCourt === 'us' ? 'us' : r.ballInCourt === 'them' ? 'them' : 'unset';
}
export const COURT_LABEL: Record<CourtValue, string> = { us: 'Us', them: 'Them', unset: 'Not set' };

// A Pre-Submittal status pick: same patch ClassifyControls saves. It's a touch,
// so the clock restarts now. Changing who owes clears a stale party label.
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
  await upsertBoardState(r, {
    ball_in_court: next.court,
    ball_in_court_party: next.court === r.ballInCourt ? r.ballInCourtParty : null,
    ball_in_court_since: new Date().toISOString(),
    seeded_fallback: false,
    blocked_on: next.blockedOn,
    needs_pricing: next.blockedOn === 'awaiting_ll' ? next.pricing : false,
    needs_site_plan: next.blockedOn === 'awaiting_ll' ? next.sitePlan : false,
  });
}

// Court edit: who owes, the optional party, and WHEN the court started. A start
// date of today stamps now (as the board does); an earlier date is that day's
// local midnight — what daysSince() measures from. Blockers are left alone.
export async function saveCourt(
  r: ReportRow,
  next: { court: CourtValue; party: string; since: string /* YYYY-MM-DD local */ }
): Promise<void> {
  await upsertBoardState(r, {
    ball_in_court: next.court === 'unset' ? null : next.court,
    ball_in_court_party: next.party.trim() || null,
    ball_in_court_since: next.since === localDateStamp()
      ? new Date().toISOString()
      : new Date(`${next.since}T00:00:00`).toISOString(),
    seeded_fallback: false,
  });
}

// Days in court: who owes + how long, on the board's own clock. Null when there
// is no clock to read — no history yet, or court not set.
export function courtClock(r: Pick<ReportRow, 'ballInCourt' | 'days' | 'heat'>): { who: string; days: number } | null {
  if (r.heat === 'no_history' || !r.ballInCourt || r.ballInCourt === 'none') return null;
  return { who: r.ballInCourt === 'us' ? 'Us' : 'Them', days: r.days };
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

export function localDateStamp(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shortDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

// Exports exactly the rows shown, in the order shown.
export async function exportPipelineReport(
  rows: ReportRow[],
  opts: { title: string; showAccount: boolean; filterNote?: string }
): Promise<void> {
  const columns: ExcelColumn[] = [
    { header: '#', key: 'rank', width: 6, style: { alignment: { horizontal: 'center' } } },
    ...(opts.showAccount ? [{ header: 'Account', key: 'account', width: 14 }] : []),
    { header: 'Deal / Site Submit', key: 'name', width: 36 },
    { header: 'City', key: 'city', width: 16 },
    { header: 'Status', key: 'status', width: 40 },
    { header: 'Court', key: 'court', width: 16 },
    { header: 'Court Since', key: 'since', width: 13, style: { alignment: { horizontal: 'center' } } },
    { header: 'Days in Court', key: 'days', width: 13, style: { alignment: { horizontal: 'center' } } },
    { header: 'Package Status', key: 'package_status', width: 18 },
    { header: 'Notes', key: 'notes', width: 55 },
    { header: 'Map', key: 'map', width: 12, isHyperlink: true, hyperlinkText: 'View Map', style: { alignment: { horizontal: 'center' } } },
  ];
  const data = rows.map((r, i) => {
    const clock = courtClock(r);
    return {
      rank: i + 1,
      account: r.accountName,
      name: r.name,
      city: r.city ?? '',
      status: statusText(r),
      court: clock ? `${clock.who}${r.ballInCourtParty ? ` (${r.ballInCourtParty})` : ''}` : '',
      // M/D/YYYY text, not an ISO string — exportToExcel would turn ISO into a UTC date
      since: clock ? shortDate(r.ballInCourtSince) : '',
      days: clock?.days ?? '',
      package_status: r.packageStatus,
      notes: r.notes,
      map: r.mapUrl ?? '',
    };
  });
  const logoBase64 = await getLogoBase64();
  const safeName = opts.title.replace(/[^a-zA-Z0-9]+/g, '_');
  await exportToExcel({
    filename: `${safeName}_${localDateStamp()}.xlsx`,
    sheetName: 'Pipeline',
    columns,
    data,
    title: opts.title,
    subtitle: opts.filterNote
      ? `Ordered by expected next to move — ${opts.filterNote}`
      : 'Pre-Submittal · Submitted-Reviewing · Negotiating LOI · At Lease/PSA — ordered by expected next to move',
    logoBase64: logoBase64 || undefined,
    landscape: true,
  });
}
