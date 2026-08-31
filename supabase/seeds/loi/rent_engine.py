#!/usr/bin/env python3
"""LOI rent engine — REFERENCE implementation (to be ported to the OVIS TypeScript engine).

Bidirectional by design (terms <-> rows share one arithmetic core), because the landlord-counter
fitter is the same math run backward. OVIS computes; the assembler renders finished rows and does
no math. No rendered row is ever the source of truth — everything derives from terms.

ROUNDING CONVENTION (derived from Powder Springs; reproduces all 8 rows byte-exact — an ASSERTION,
not a config default):
  - Escalations compound on UNROUNDED $/SF. Never re-escalate from a rounded value.
  - Displayed $/SF is rounded to 2dp for display only.
  - Yearly = UNROUNDED $/SF x square footage, then rounded to cents.
  - Monthly = yearly / 12, rounded to cents.

Business rules:
  - freestanding (NN/NNN): escalate on ANNUAL rent (no $/SF column).
  - end-cap drive-thru: escalate on rent per SF; $/SF shown for every period.
  - escalation pattern (rate, period) is a per-deal input.

OPEN ITEM (do NOT build until Mike confirms): the "final period drops $/SF and reverts to annual
rent" rule. Powder Springs carries $/SF through ALL periods, so this is NOT a schedule-generation
rule. It most likely means the FINAL VERSION of the LOI before execution strips the per-SF BASIS so
the executed lease can't recompute rent from a remeasured square footage — a document-lifecycle rule,
not a row rule. Left unimplemented pending confirmation.
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
    psf_dp: int = 2       # $/SF display decimals
    annual_dp: int = 2    # yearly $ decimals (cents)
    monthly_dp: int = 2   # monthly $ decimals (cents)


@dataclass
class Terms:
    measurement_basis: str          # 'annual' (freestanding) | 'per_sqft' (end-cap DT)
    base: Decimal                   # year-1 value: $/SF if per_sqft, else annual $
    escalation_rate: Decimal        # e.g. Decimal('0.10')
    escalation_period_years: int    # e.g. 5
    term_length_years: int          # total incl. options, e.g. 40
    sqft: Optional[int] = None      # required for per_sqft
    explicit_period_values: Optional[list] = None  # per-period base values (irregular schedules)


@dataclass
class PeriodRow:
    period_no: int
    start_year: int
    end_year: int
    psf: Optional[Decimal]          # None only for freestanding (annual basis)
    yearly: Decimal
    monthly: Decimal


def compute_schedule(t: Terms, rc: RoundingConfig = RoundingConfig()) -> list:
    n_periods = -(-t.term_length_years // t.escalation_period_years)  # ceil
    rows = []
    for p in range(n_periods):
        start_year = p * t.escalation_period_years + 1
        end_year = min((p + 1) * t.escalation_period_years, t.term_length_years)

        if t.explicit_period_values is not None:
            value = Decimal(t.explicit_period_values[p])
        else:
            value = t.base * (Decimal(1) + t.escalation_rate) ** p   # UNROUNDED compounding

        if t.measurement_basis == "per_sqft":
            assert t.sqft is not None, "per_sqft schedule needs sqft"
            psf_shown = _round(value, rc.psf_dp)                       # display only
            yearly = _round(value * t.sqft, rc.annual_dp)             # from UNROUNDED $/SF
            monthly = _round(yearly / 12, rc.monthly_dp)
            rows.append(PeriodRow(p, start_year, end_year, psf_shown, yearly, monthly))
        else:  # annual basis (freestanding) — no $/SF column
            yearly = _round(value, rc.annual_dp)
            monthly = _round(yearly / 12, rc.monthly_dp)
            rows.append(PeriodRow(p, start_year, end_year, None, yearly, monthly))
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
    return row.psf if (basis == "per_sqft" and row.psf is not None) else row.yearly


def fit_terms(rows: list, measurement_basis: str, sqft: Optional[int] = None,
              rc: RoundingConfig = RoundingConfig(), tol: Decimal = Decimal("0.01")) -> FitResult:
    if len(rows) < 2:
        return FitResult("no_regular_fit", None, note="need >= 2 periods to infer a pattern")

    period_years = rows[0].end_year - rows[0].start_year + 1
    base = _basis_value(rows[0], measurement_basis)

    def exceptions_for(rate):
        cand = Terms(measurement_basis, base, rate, period_years, rows[-1].end_year, sqft, None)
        rec = compute_schedule(cand, rc)
        exc = []
        for got, exp in zip(rows, rec):
            if abs(got.yearly - exp.yearly) > tol:
                exc.append({"period_no": got.period_no, "expected": str(exp.yearly),
                            "actual": str(got.yearly), "delta": str(got.yearly - exp.yearly)})
        return cand, exc

    # Candidate rates from every adjacent yearly ratio; keep the one reproducing the MOST rows, so a
    # single fat-fingered cell (which corrupts two adjacent ratios) can't hide the true rate.
    cands = set()
    for i in range(len(rows) - 1):
        a, b = rows[i].yearly, rows[i + 1].yearly
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
    if n_match >= len(rows) - max(1, len(rows) // 3) and n_match >= 2:
        return FitResult("fit_with_exceptions", best_cand, best_exc,
                         "consistent pattern except flagged periods — likely landlord arithmetic error")
    explicit = [_basis_value(r, measurement_basis) for r in rows]
    irregular = Terms(measurement_basis, base, Decimal(0), period_years,
                      rows[-1].end_year, sqft, explicit_period_values=explicit)
    return FitResult("no_regular_fit", irregular, best_exc,
                     "irregular by intent — confirm with Mike; periods stored explicitly")


# --------------------------------------------------------------------------------------------------
# Acceptance test: reproduce the Powder Springs schedule byte-exact from its terms.
# --------------------------------------------------------------------------------------------------
if __name__ == "__main__":
    D = Decimal
    PS = Terms("per_sqft", D("60.00"), D("0.10"), 5, 40, sqft=2109)
    rows = compute_schedule(PS)
    # (psf, yearly, monthly) from the sent Powder Springs LOI, table 0
    expected = [
        (D("60.00"),  D("126540.00"), D("10545.00")),
        (D("66.00"),  D("139194.00"), D("11599.50")),
        (D("72.60"),  D("153113.40"), D("12759.45")),
        (D("79.86"),  D("168424.74"), D("14035.40")),
        (D("87.85"),  D("185267.21"), D("15438.93")),
        (D("96.63"),  D("203793.94"), D("16982.83")),
        (D("106.29"), D("224173.33"), D("18681.11")),
        (D("116.92"), D("246590.66"), D("20549.22")),
    ]
    print("Powder Springs (2,109 SF, $60/SF, 10%/5yr, 40yr):")
    ok = True
    for i, (r, (psf, yr, mo)) in enumerate(zip(rows, expected)):
        match = (r.psf == psf and r.yearly == yr and r.monthly == mo)
        ok &= match
        print(f"  P{i} yr{r.start_year}-{r.end_year}: psf={r.psf} yearly={r.yearly} monthly={r.monthly} "
              f"{'OK' if match else f'MISMATCH exp psf={psf} yr={yr} mo={mo}'}")
    assert ok, "Powder Springs rows not byte-exact"
    assert len(rows) == 8, f"expected 8 periods, got {len(rows)}"
    print("ACCEPTANCE: all 8 Powder Springs rows byte-exact.")

    # Backward round-trip + single-error isolation.
    fr = fit_terms(rows, "per_sqft", sqft=2109)
    assert fr.outcome == "clean_fit" and fr.terms.escalation_rate == D("0.10"), fr
    bad = list(rows); bad[4] = PeriodRow(4, 21, 25, D("87.85"), D("185000.00"), D("15416.67"))
    fr2 = fit_terms(bad, "per_sqft", sqft=2109)
    assert fr2.outcome == "fit_with_exceptions" and fr2.exceptions[0]["period_no"] == 4, fr2
    print(f"FIT: clean round-trip OK; injected error isolated to period {fr2.exceptions[0]['period_no']}.")
