/**
 * Cash flow data loader — shared by the Cash tab (browser) and ovis-mcp get_cash_position (Deno).
 * No package imports: callers pass their own supabase client.
 */

/** Stage IDs used by the cash tab (same values as CashflowDashboard). */
export const STAGE = {
  lost: "0e318cd6-a738-400a-98af-741479585057",
  closedPaid: "afa9a62e-9821-4c60-9db3-c0d51d009208",
} as const;

export interface BalanceRow {
  qb_account_id: string;
  name: string;
  fully_qualified_name: string | null;
  account_type: string;
  current_balance: number;
  fetched_at: string;
}

export interface ScheduledPayment {
  id: string;
  name: string;
  kind: "bill" | "draw";
  day_of_month: number | null;
  scheduled_date: string | null;
  amount: number | null;
  qb_account_id: string | null;
  /** QBO payee names an occurrence may match (dedupe against entered QBO transactions). */
  qb_payee_names: string[] | null;
  /** Every N weeks from scheduled_date (anchor) — v1.6. */
  every_n_weeks: number | null;
  end_date: string | null;
  /** Stop once this QBO liability account is paid off (last payment = remainder). */
  payoff_qb_account_id: string | null;
  /** Draw is an advance against this broker's future splits. */
  advance_broker_id: string | null;
  active: boolean;
  notes: string | null;
}

/** A QBO bank-register line (GeneralLedger), captured with the balance snapshot. */
export interface BankTxnRow {
  qb_account_id: string;
  txn_date: string;
  txn_type: string | null;
  qb_txn_id: string | null;
  payee: string | null;
  memo: string | null;
  /** Signed: − out of the bank, + in. */
  amount: number;
}

export interface DealLite {
  id: string;
  deal_name: string | null;
  stage_id: string | null;
  probability: number | null;
  fee: number | null;
  gci: number | null;
  client: { client_name: string | null } | null;
  referral_payee: { client_name: string | null } | null;
}

export interface PaymentRow {
  id: string;
  deal_id: string | null;
  payment_name: string | null;
  payment_amount: number | null;
  referral_fee_usd: number | null;
  referral_fee_paid: boolean | null;
  agci: number | null;
  payment_date_estimated: string | null;
  payment_received: boolean | null;
  payment_received_date: string | null;
  referral_fee_planned_pay_date: string | null;
  /** Written off (won't be collected): excluded from calendar, projection, past-due and needs-attention. */
  write_off_reason: string | null;
  written_off_at: string | null;
  qb_invoice_id: string | null;
  qb_invoice_number: string | null;
  deal: DealLite | null;
}

export interface SplitRow {
  id: string;
  payment_id: string;
  broker_id: string;
  split_broker_total: number | null;
  paid: boolean | null;
  planned_pay_date: string | null;
}

export interface SplitBillRow {
  id: string;
  payment_split_id: string;
  qb_entity_id: string;
  amount: number | null;
  transaction_date: string | null;
  qb_open_balance: number | null;
  qb_balance_checked_at: string | null;
  exclude_from_calendar: boolean;
  exclude_reason: string | null;
}

export interface CreditFacility {
  id: string;
  name: string;
  qb_account_id: string | null;
  credit_limit: number | null;
  available: number;
  apr: number | null;
  active: boolean;
  notes: string | null;
  updated_at: string | null;
}

export interface CashData {
  balances: BalanceRow[];
  balancesFetchedAt: string | null;
  /** Bank-register lines from the same QBO refresh as `balances` (empty if none yet). */
  bankTxns: BankTxnRow[];
  scheduled: ScheduledPayment[];
  payments: PaymentRow[];
  splits: SplitRow[];
  splitBills: SplitBillRow[];
  /** payment_split rows referenced by split Bills (may be on received payments outside `payments`). */
  billSplits: Map<string, SplitRow & { payment_id: string }>;
  openDeals: DealLite[];
  /** deal_id → broker names on its commission_split. */
  dealTeam: Map<string, string[]>;
  brokerNames: Map<string, string>;
  credit: CreditFacility[];
  /** app_settings.cash_cushion_usd (0 if unset). */
  cushion: number;
  /** app_settings.tax_reserve_pct (placeholder; null if unset). */
  taxReservePct: number | null;
  /** broker_id → QBO draw/advance account id (journal_entry commission mappings). */
  advanceAccounts: Map<string, string>;
}

const PAGE = 1000;

async function fetchAll<T>(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: any }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

async function inChunks<T>(
  ids: string[],
  run: (chunk: string[]) => Promise<T[]>,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 200)
    out.push(...(await run(ids.slice(i, i + 200))));
  return out;
}

const DEAL_SELECT =
  "id, deal_name, stage_id, probability, fee, gci, client:client_id (client_name), referral_payee:referral_payee_client_id (client_name)";

/** Any supabase-js client (browser or Deno). Kept structural so this file has no package import. */
// deno-lint-ignore no-explicit-any
type Client = any;

/** Load everything the cash tab needs. Plain function so it can run outside React. */
export async function loadCashData(supabase: Client): Promise<CashData> {
  // Latest QBO balance batch
  const { data: snap, error: snapErr } = await supabase
    .from("qb_balance_snapshot")
    .select(
      "qb_account_id, name, fully_qualified_name, account_type, current_balance, fetched_at",
    )
    .order("fetched_at", { ascending: false })
    .limit(500);
  if (snapErr) throw snapErr;
  const balancesFetchedAt = snap && snap.length > 0 ? snap[0].fetched_at : null;
  const balances = ((snap || []) as BalanceRow[]).filter(
    (r) => r.fetched_at === balancesFetchedAt,
  );

  const { data: sched, error: schedErr } = await supabase
    .from("scheduled_payment")
    .select(
      "id, name, kind, day_of_month, scheduled_date, amount, qb_account_id, qb_payee_names, every_n_weeks, end_date, payoff_qb_account_id, advance_broker_id, active, notes",
    )
    .order("name");
  if (schedErr) throw schedErr;

  // Bank-register lines from the same refresh batch (same fetched_at) — keeps the
  // "today vs. after future entries" split consistent with the balances shown.
  const bankTxns = balancesFetchedAt
    ? await fetchAll<BankTxnRow>(
        (from, to) =>
          supabase
            .from("qb_bank_transaction")
            .select("qb_account_id, txn_date, txn_type, qb_txn_id, payee, memo, amount")
            .eq("fetched_at", balancesFetchedAt)
            .order("txn_date")
            .range(from, to) as any,
      )
    : [];

  const payments = await fetchAll<PaymentRow>(
    (from, to) =>
      supabase
        .from("payment")
        .select(
          `id, deal_id, payment_name, payment_amount, referral_fee_usd, referral_fee_paid, agci,
                   payment_date_estimated, payment_received, payment_received_date, referral_fee_planned_pay_date,
                   write_off_reason, written_off_at, qb_invoice_id, qb_invoice_number,
                   deal:deal_id (${DEAL_SELECT})`,
        )
        .eq("is_active", true)
        .order("id")
        .range(from, to) as any,
  );

  const paymentIds = payments.map((p) => p.id);
  const splits = await inChunks(paymentIds, (chunk) =>
    fetchAll<SplitRow>(
      (from, to) =>
        supabase
          .from("payment_split")
          .select("id, payment_id, broker_id, split_broker_total, paid, planned_pay_date")
          .in("payment_id", chunk)
          .order("id")
          .range(from, to) as any,
    ),
  );

  const splitBills = await fetchAll<SplitBillRow>(
    (from, to) =>
      supabase
        .from("qb_commission_entry")
        .select(
          "id, payment_split_id, qb_entity_id, amount, transaction_date, qb_open_balance, qb_balance_checked_at, exclude_from_calendar, exclude_reason",
        )
        .eq("qb_entity_type", "Bill")
        .eq("status", "created")
        .not("payment_split_id", "is", null)
        .order("id")
        .range(from, to) as any,
  );
  const billSplitIds = [...new Set(splitBills.map((b) => b.payment_split_id))];
  const billSplitRows = await inChunks(billSplitIds, async (chunk) => {
    const { data: rows, error: e } = await supabase
      .from("payment_split")
      .select("id, payment_id, broker_id, split_broker_total, paid, planned_pay_date")
      .in("id", chunk);
    if (e) throw e;
    return (rows || []) as SplitRow[];
  });
  const billSplits = new Map(billSplitRows.map((s) => [s.id, s]));

  const openDeals = await fetchAll<DealLite>(
    (from, to) =>
      supabase
        .from("deal")
        .select(DEAL_SELECT)
        .not("stage_id", "in", `(${STAGE.lost},${STAGE.closedPaid})`)
        .order("id")
        .range(from, to) as any,
  );

  const { data: brokers, error: brokerErr } = await supabase
    .from("broker")
    .select("id, name");
  if (brokerErr) throw brokerErr;
  const brokerNames = new Map(
    ((brokers || []) as { id: string; name: string | null }[]).map(
      (b): [string, string] => [b.id, b.name || ""],
    ),
  );

  const dealIds = [
    ...new Set([
      ...openDeals.map((d) => d.id),
      ...payments.map((p) => p.deal_id).filter((x): x is string => !!x),
    ]),
  ];
  const cs = await inChunks(dealIds, (chunk) =>
    fetchAll<{ deal_id: string; broker_id: string | null }>(
      (from, to) =>
        supabase
          .from("commission_split")
          .select("deal_id, broker_id")
          .in("deal_id", chunk)
          .order("id")
          .range(from, to) as any,
    ),
  );
  const dealTeam = new Map<string, string[]>();
  for (const row of cs) {
    if (!row.broker_id) continue;
    const name = brokerNames.get(row.broker_id);
    if (!name) continue;
    const list = dealTeam.get(row.deal_id) || [];
    if (!list.includes(name)) list.push(name);
    dealTeam.set(row.deal_id, list);
  }

  const [{ data: credit, error: creditErr }, { data: settings }, { data: maps }] = await Promise.all([
    supabase
      .from("credit_facility")
      .select("id, name, qb_account_id, credit_limit, available, apr, active, notes, updated_at")
      .order("name"),
    supabase.from("app_settings").select("key, value").in("key", ["cash_cushion_usd", "tax_reserve_pct"]),
    supabase
      .from("qb_commission_mapping")
      .select("broker_id, qb_credit_account_id")
      .eq("payment_method", "journal_entry")
      .eq("is_active", true)
      .not("broker_id", "is", null),
  ]);
  if (creditErr) throw creditErr;
  const setting = (key: string) => {
    const raw = ((settings || []) as { key: string; value: unknown }[]).find((r) => r.key === key)?.value;
    if (raw === undefined || raw === null) return null;
    const n = Number(typeof raw === "string" ? JSON.parse(raw) : raw);
    return Number.isFinite(n) ? n : null;
  };
  const cushion = setting("cash_cushion_usd") || 0;
  const taxReservePct = setting("tax_reserve_pct");
  const advanceAccounts = new Map<string, string>(
    ((maps || []) as { broker_id: string; qb_credit_account_id: string | null }[])
      .filter((m) => m.qb_credit_account_id)
      .map((m): [string, string] => [m.broker_id, m.qb_credit_account_id!]),
  );

  return {
    credit: (credit || []) as CreditFacility[],
    cushion,
    taxReservePct,
    advanceAccounts,
    balances,
    balancesFetchedAt,
    bankTxns,
    scheduled: (sched || []) as ScheduledPayment[],
    payments,
    splits,
    splitBills,
    billSplits,
    openDeals,
    dealTeam,
    brokerNames,
  };
}

