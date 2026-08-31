#!/usr/bin/env python3
"""LOI rent engine — REFERENCE implementation (to be ported to the OVIS TypeScript engine).

Bidirectional by design (terms <-> rows share one arithmetic core), because the landlord-counter
fitter is the same math run backward. OVIS computes; the assembler renders finished rows and does
no math. No rendered row is ever the source of truth — everything derives from terms.

Business rules (see docs/STARBUCKS_LOI_TOOL_DECISIONS.md):
  - freestanding (NN/NNN): escalate on ANNUAL rent (no $/SF column).
  - end-cap drive-thru: escalate on rent per SF; final period DROPS the $/SF column and reverts to a
    fixed annual rent — a PROTECTIVE rule so a later sqft remeasurement can't retrigger a recalc.
  - escalation pattern (rate, period) is a per-deal input.
  - ROUNDING must match Mike's Excel exactly; the convention is a parameter, discovered by
    reproducing Powder Springs, NOT assumed. Until confirmed, RoundingConfig is the knob to sweep.
"""
from dataclasses import dataclass, field
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional


def _round(x: Decimal, dp: Optional[int]) -> Decimal:
    if dp is None:
        return x
    return x.quantize(Decimal(1).scaleb(-dp), rounding=ROUND_HALF_UP)


@dataclass
class RoundingConfig:
    # 'psf_first' : psf = round(psf, psf_dp); annual = round(psf * sqft, annual_dp)
    # 'annual_first': psf shown = round(psf_exact, psf_dp); annual = round(psf_exact * sqft, annual_dp)
    stage: str = "psf_first"
    psf_dp: Optional[int] = 2       # $/SF decimal places
    annual_dp: Optional[int] = 2    # annual $ decimal places (0 = whole dollars) — DISCOVER from Powder Springs


@dataclass
class Terms:
    measurement_basis: str          # 'annual' (freestanding) | 'per_sqft' (end-cap DT)
    base: Decimal                   # year-1 value: $/SF if per_sqft, else annual $
    escalation_rate: Decimal        # e.g. Decimal('0.10')
    escalation_period_years: int    # e.g. 5
    term_length_years: int          # e.g. 20
    sqft: Optional[int] = None      # required for per_sqft
    # For irregular (no-regular-fit) schedules, explicit per-period base values override the pattern:
    explicit_period_values: Optional[list] = None  # list of Decimal (per-period value in basis units)


@dataclass
class PeriodRow:
    period_no: int
    start_year: int
    end_year: int
    psf: Optional[Decimal]          # None on the final period of a per_sqft schedule (column dropped)
    annual_rent: Decimal


def compute_schedule(t: Terms, rc: RoundingConfig = RoundingConfig()) -> list:
    if t.term_length_years % t.escalation_period_years != 0:
        # not fatal, but flag: last period is short. Real deals may need this; keep explicit.
        pass
    n_periods = -(-t.term_length_years // t.escalation_period_years)  # ceil
    rows = []
    for p in range(n_periods):
        start_year = p * t.escalation_period_years + 1
        end_year = min((p + 1) * t.escalation_period_years, t.term_length_years)
        is_final = (p == n_periods - 1)

        if t.explicit_period_values is not None:
            value = Decimal(t.explicit_period_values[p])
        else:
            value = t.base * (Decimal(1) + t.escalation_rate) ** p

        if t.measurement_basis == "per_sqft":
            assert t.sqft is not None, "per_sqft schedule needs sqft"
            if rc.stage == "psf_first":
                psf_r = _round(value, rc.psf_dp)
                annual = _round(psf_r * t.sqft, rc.annual_dp)
                psf_shown = psf_r
            else:  # annual_first
                annual = _round(value * t.sqft, rc.annual_dp)
                psf_shown = _round(value, rc.psf_dp)
            rows.append(PeriodRow(p, start_year, end_year,
                                  None if is_final else psf_shown, annual))
        else:  # annual basis (freestanding)
            annual = _round(value, rc.annual_dp)
            rows.append(PeriodRow(p, start_year, end_year, None, annual))
    return rows


# --------------------------------------------------------------------------------------------------
# Backward: fit terms to a landlord's rows. Same arithmetic run as a hypothesis test.
# --------------------------------------------------------------------------------------------------
@dataclass
class FitResult:
    outcome: str                    # 'clean_fit' | 'fit_with_exceptions' | 'no_regular_fit'
    terms: Optional[Terms]
    exceptions: list = field(default_factory=list)  # [{period_no, expected, actual, delta}]
    note: str = ""


def _basis_value(row: PeriodRow, basis: str) -> Decimal:
    return row.psf if (basis == "per_sqft" and row.psf is not None) else row.annual_rent


def fit_terms(rows: list, measurement_basis: str, sqft: Optional[int] = None,
              rc: RoundingConfig = RoundingConfig(), tol: Decimal = Decimal("0.01")) -> FitResult:
    """Fit (base, rate, period) to the landlord's rows. The final per_sqft row has psf dropped, so
    fit the escalation on the non-final rows, then verify the whole schedule (incl. the final annual).
    """
    if len(rows) < 2:
        return FitResult("no_regular_fit", None, note="need >= 2 periods to infer a pattern")

    period_years = rows[0].end_year - rows[0].start_year + 1
    base = _basis_value(rows[0], measurement_basis)
    if measurement_basis == "per_sqft" and rows[0].psf is None:
        return FitResult("no_regular_fit", None, note="first period missing psf")

    def exceptions_for(rate):
        cand = Terms(measurement_basis, base, rate, period_years, rows[-1].end_year, sqft, None)
        rec = compute_schedule(cand, rc)
        exc = []
        for got, exp in zip(rows, rec):
            if abs(got.annual_rent - exp.annual_rent) > tol:
                exc.append({"period_no": got.period_no, "expected": str(exp.annual_rent),
                            "actual": str(got.annual_rent), "delta": str(got.annual_rent - exp.annual_rent)})
        return cand, exc

    # Candidate rates from every adjacent annual ratio; keep the rate reproducing the MOST rows, so
    # a single fat-fingered cell (which corrupts two adjacent ratios) can't hide the true rate.
    cands = set()
    for i in range(len(rows) - 1):
        a, b = rows[i].annual_rent, rows[i + 1].annual_rent
        if a:
            cands.add(((b / a) - 1).quantize(Decimal("0.0001")))
    best_cand, best_exc = None, None
    for rate in cands:
        cand, exc = exceptions_for(rate)
        if best_exc is None or len(exc) < len(best_exc):
            best_cand, best_exc = cand, exc

    if not best_exc:
        return FitResult("clean_fit", best_cand,
                         note=f"rate={best_cand.escalation_rate}, period={period_years}yr")
    n_match = len(rows) - len(best_exc)
    # Best rate still reproduces most rows -> isolated landlord error(s). Otherwise irregular by intent.
    if n_match >= len(rows) - max(1, len(rows) // 3) and n_match >= 2:
        return FitResult("fit_with_exceptions", best_cand, best_exc,
                         "consistent pattern except flagged periods — likely landlord arithmetic error")
    explicit = [_basis_value(r, measurement_basis) for r in rows]
    irregular = Terms(measurement_basis, base, Decimal(0), period_years,
                      rows[-1].end_year, sqft, explicit_period_values=explicit)
    return FitResult("no_regular_fit", irregular, best_exc,
                     "irregular by intent — confirm with Mike; periods stored explicitly")


# --------------------------------------------------------------------------------------------------
# Self-tests (synthetic). The REAL acceptance test reproduces Powder Springs — pending its terms+rows.
# --------------------------------------------------------------------------------------------------
if __name__ == "__main__":
    D = Decimal
    # End-cap DT: $30/SF yr1, 2200 SF, 10%/5yr, 20yr term.
    t = Terms("per_sqft", D("30.00"), D("0.10"), 5, 20, sqft=2200)
    sched = compute_schedule(t)
    print("end-cap DT schedule:")
    for r in sched:
        print(f"  P{r.period_no} yr{r.start_year}-{r.end_year}: psf={r.psf} annual={r.annual_rent}")
    assert sched[0].annual_rent == D("66000.00")
    assert sched[-1].psf is None, "final period must drop $/SF"

    # Round-trip: fit the schedule we just built -> should be a clean fit recovering 10%/5yr.
    fr = fit_terms(sched, "per_sqft", sqft=2200)
    print("fit:", fr.outcome, fr.note)
    assert fr.outcome == "clean_fit" and fr.terms.escalation_rate == D("0.10")

    # Inject a landlord arithmetic error in period 2 -> fit_with_exceptions naming that period.
    bad = list(sched)
    bad[2] = PeriodRow(2, 11, 15, D("36.00"), D("79200.00"))  # should be 36.30 / 79860
    fr2 = fit_terms(bad, "per_sqft", sqft=2200)
    print("fit(with error):", fr2.outcome, "exceptions=", fr2.exceptions)
    assert fr2.outcome == "fit_with_exceptions" and fr2.exceptions[0]["period_no"] == 2

    # Freestanding: annual basis, no psf column.
    tf = Terms("annual", D("100000"), D("0.10"), 5, 15)
    sf = compute_schedule(tf)
    assert all(r.psf is None for r in sf)
    print("PASS (synthetic). Awaiting Powder Springs terms+rows for the real acceptance test + rounding discovery.")
