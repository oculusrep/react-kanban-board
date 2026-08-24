# Comp Database — Lease Field Matrix (FINAL — implemented)

Confirmed by Mike 2026-08-24 and wired into `LEASE_TYPE_FIELDS` (`src/lib/compTypes.ts`) + the
Add/Edit Lease card. `x` = field shown for that lease type.

Lease types: **Ground Lease · BTS (NNN) · BTS (NN) · Multi-Tenant**

| Field | Ground Lease | BTS (NNN) | BTS (NN) | Multi-Tenant |
|-------|:---:|:---:|:---:|:---:|
| Suite |  |  |  | x |
| Tenant SF |  | x | x | x |
| Base Rent (Annual)¹ | x | x | x | x |
| NNN PSF |  |  | x | x |
| TI (Annual) | x | x | x | x |

¹ Labeled **Annual Ground Rent** for Ground Lease.

**Always shown (not gated):** Tenant Name, Brand, Lease Type, Occupancy, Lease Term (years),
Rent Escalation (%), Rent Bumps (Annual / Every 5 Years / Other), Option Periods,
Commencement Date, Expiration Date, Reported Tenant Sales, Source, Confidence.

**Removed:** Free Rent (not needed).

## Decisions
1. **NNN** captured as **PSF** (conventional quoting). `base_rent_psf` is auto-derived from
   Annual Base Rent ÷ Tenant SF for comparisons.
2. **BTS (NN) vs BTS (NNN)** intentionally differ: BTS (NN) shows **NNN PSF**, BTS (NNN) does not
   (in a true triple-net BTS the tenant pays NNN directly, so it isn't captured as a comp value).
