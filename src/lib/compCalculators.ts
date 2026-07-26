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
