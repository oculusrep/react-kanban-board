// Comp Database — pure calculator helpers (Phase 1)
//
// Shared by the comp sidebar UI and (later) the AI research agent so both derive values the same way.
// CONVENTION: cap rate, escalation, and occupancy are expressed as PERCENT (6.25 = 6.25%),
// matching the comp_property / sale_comp / lease_comp column semantics in
// supabase/migrations/20260725180000_comp_database_phase1.sql.
//
// Every function tolerates null/undefined/zero-divisor inputs and returns null rather than NaN,
// so callers can render "—" for incomplete comps without guarding each call.

type Num = number | null | undefined;

const isPos = (v: Num): v is number => typeof v === 'number' && isFinite(v) && v > 0;
const isNum = (v: Num): v is number => typeof v === 'number' && isFinite(v);

// ---------------------------------------------------------------------------
// Sale economics — cap rate <-> NOI <-> price (any two derive the third)
// ---------------------------------------------------------------------------

/** Cap rate (%) = NOI / price * 100 */
export function capRateFromNoiPrice(noi: Num, price: Num): number | null {
  if (!isNum(noi) || !isPos(price)) return null;
  return (noi / price) * 100;
}

/** NOI = price * capRate% / 100 */
export function noiFromCapRatePrice(capRatePct: Num, price: Num): number | null {
  if (!isPos(capRatePct) || !isNum(price)) return null;
  return price * (capRatePct / 100);
}

/** Price = NOI / (capRate% / 100) */
export function priceFromCapRateNoi(capRatePct: Num, noi: Num): number | null {
  if (!isPos(capRatePct) || !isNum(noi)) return null;
  return noi / (capRatePct / 100);
}

// ---------------------------------------------------------------------------
// Per-square-foot metrics
// ---------------------------------------------------------------------------

/** Price per SF = price / building SF */
export function pricePsf(price: Num, buildingSqft: Num): number | null {
  if (!isNum(price) || !isPos(buildingSqft)) return null;
  return price / buildingSqft;
}

/** Annual rent per SF = annual rent / SF */
export function rentPsf(annualRent: Num, sqft: Num): number | null {
  if (!isNum(annualRent) || !isPos(sqft)) return null;
  return annualRent / sqft;
}

/** Annual rent = rent PSF * SF */
export function annualRentFromPsf(psf: Num, sqft: Num): number | null {
  if (!isNum(psf) || !isPos(sqft)) return null;
  return psf * sqft;
}

/** All-in (gross) rent PSF = base rent PSF + NNN PSF (either side optional) */
export function allInRentPsf(baseRentPsf: Num, nnnPsf: Num): number | null {
  const b = isNum(baseRentPsf) ? baseRentPsf : 0;
  const n = isNum(nnnPsf) ? nnnPsf : 0;
  if (!isNum(baseRentPsf) && !isNum(nnnPsf)) return null;
  return b + n;
}

/** Sales per SF = reported annual tenant sales / SF */
export function salesPsf(annualSales: Num, sqft: Num): number | null {
  if (!isNum(annualSales) || !isPos(sqft)) return null;
  return annualSales / sqft;
}

/** Gross Rent Multiplier = price / gross annual income */
export function grm(price: Num, grossAnnualIncome: Num): number | null {
  if (!isNum(price) || !isPos(grossAnnualIncome)) return null;
  return price / grossAnnualIncome;
}

// ---------------------------------------------------------------------------
// Lease term
// ---------------------------------------------------------------------------

/**
 * Whole months remaining until a lease expires, relative to `asOf` (default: today, local).
 * Returns 0 for already-expired leases, null if no expiration date.
 */
export function monthsRemaining(expirationDate: string | null | undefined, asOf?: Date): number | null {
  if (!expirationDate) return null;
  const exp = new Date(expirationDate + (expirationDate.length === 10 ? 'T00:00:00' : ''));
  if (isNaN(exp.getTime())) return null;
  const from = asOf ?? new Date();
  const months =
    (exp.getFullYear() - from.getFullYear()) * 12 +
    (exp.getMonth() - from.getMonth()) +
    (exp.getDate() >= from.getDate() ? 0 : -1);
  return Math.max(0, months);
}

/**
 * Straight-line effective annual rent PSF over the lease term, net of free rent and accounting for
 * annual compounding escalations. Free rent is assumed to abate the first `freeRentMonths` months.
 *
 * Effective PSF = (total collected rent PSF over term) / termMonths * 12
 */
export function effectiveRentPsf(input: {
  baseRentPsf: Num;
  termMonths: Num;
  escalationPct?: Num;
  freeRentMonths?: Num;
}): number | null {
  const { baseRentPsf, termMonths } = input;
  if (!isPos(baseRentPsf) || !isPos(termMonths)) return null;
  const esc = isNum(input.escalationPct) ? input.escalationPct : 0;
  const free = isNum(input.freeRentMonths) && input.freeRentMonths! > 0 ? input.freeRentMonths! : 0;

  let totalPsf = 0;
  for (let month = 0; month < termMonths; month++) {
    if (month < free) continue; // abated
    const yearIndex = Math.floor(month / 12);
    const monthlyPsf = (baseRentPsf / 12) * Math.pow(1 + esc / 100, yearIndex);
    totalPsf += monthlyPsf;
  }
  return (totalPsf / termMonths) * 12;
}

/**
 * Lease expiration date = commencement + term, minus one day (a 10-yr lease starting 2020-01-01
 * expires 2029-12-31). Term given in years; handled in months so fractional years work. Local dates.
 */
export function leaseExpiration(commencementDate: string | null | undefined, termYears: Num): string | null {
  if (!commencementDate || !isPos(termYears)) return null;
  const start = new Date(commencementDate + (commencementDate.length === 10 ? 'T00:00:00' : ''));
  if (isNaN(start.getTime())) return null;
  const months = Math.round(termYears * 12);
  const end = new Date(start);
  end.setMonth(end.getMonth() + months);
  end.setDate(end.getDate() - 1);
  return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Rent schedule projection
// ---------------------------------------------------------------------------

export interface RentPeriod {
  periodStart: string;   // YYYY-MM-DD
  periodEnd: string;     // YYYY-MM-DD (day before the next step / lease end)
  annualRent: number;
  monthlyRent: number;
  increasePct: number | null; // null for the first period, else the % bump applied
  isCurrent: boolean;    // covers `asOf` (today by default)
}

/**
 * Project a lease's rent schedule from its commencement date, starting annual rent, escalation and
 * bump cadence. Increases are only projected when there's a positive escalation AND a known cadence
 * (annual or every 5 years) — otherwise a single flat period is returned. Horizon = lease term
 * (falls back to 20y / 25y when the term is unknown). Uses local dates (Eastern per OVIS convention).
 */
export function buildRentSchedule(input: {
  commencementDate: string | null | undefined;
  annualBaseRent: Num;
  escalationPct?: Num;
  bumpFrequency?: 'annual' | 'every_5_years' | 'other' | null;
  termYears?: Num;
  asOf?: Date;
}): RentPeriod[] | null {
  const { commencementDate } = input;
  if (!commencementDate || !isPos(input.annualBaseRent)) return null;
  const start = new Date(commencementDate + (commencementDate.length === 10 ? 'T00:00:00' : ''));
  if (isNaN(start.getTime())) return null;

  const esc = isNum(input.escalationPct) ? input.escalationPct : 0;
  const bumpEvery = esc > 0 && input.bumpFrequency === 'annual' ? 1
    : esc > 0 && input.bumpFrequency === 'every_5_years' ? 5
    : null; // no defined increase cadence -> one flat period
  const term = isPos(input.termYears) ? input.termYears : (bumpEvery === 5 ? 25 : 20);
  const asOf = input.asOf ?? new Date();

  const addYears = (d: Date, y: number) => { const n = new Date(d); n.setFullYear(n.getFullYear() + y); return n; };
  const addDays = (d: Date, days: number) => { const n = new Date(d); n.setDate(n.getDate() + days); return n; };
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const stepYears = bumpEvery ?? term; // flat lease -> single full-term period
  const periods: RentPeriod[] = [];
  let offset = 0;
  let rent = input.annualBaseRent!;
  let idx = 0;
  while (offset < term && periods.length < 60) {
    const pStart = addYears(start, offset);
    const stepLen = Math.min(stepYears, term - offset);
    const pEndExclusive = addYears(start, offset + stepLen);
    periods.push({
      periodStart: iso(pStart),
      periodEnd: iso(addDays(pEndExclusive, -1)),
      annualRent: Math.round(rent),
      monthlyRent: Math.round(rent / 12),
      increasePct: idx === 0 ? null : esc,
      isCurrent: asOf >= pStart && asOf < pEndExclusive,
    });
    offset += stepYears;
    if (bumpEvery) rent = rent * (1 + esc / 100);
    idx++;
  }
  return periods;
}
