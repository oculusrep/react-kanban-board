# Comp Database — Lease Field Matrix (mark the checkboxes)

**How to use:** put an `x` in a cell to SHOW that field when the given lease type is selected in the
Add/Edit Lease card; leave it blank to hide it. Edit and save this file, then tell me it's ready and
I'll wire the lease form to match exactly (`LEASE_TYPE_FIELDS` in `src/lib/compTypes.ts`).

Values are pre-filled with my best guess — change whatever's wrong.

Lease types: **Ground Lease · BTS (NNN) · BTS (NN) · Multi-Tenant**

| Field | Ground Lease | BTS (NNN) | BTS (NN) | Multi-Tenant |
|-------|:---:|:---:|:---:|:---:|
| Tenant Name | x | x | x | x |
| Brand (known chain) | x | x | x | x |
| Suite |  |  |  | x |
| Tenant SF |  | x | x | x |
| Base Rent (Annual) | x | x | x | x |
| NNN PSF |  | x | x | x |
| TI (Annual) |  | x | x | x |
| Free Rent (months) |  | x | x | x |
| Lease Term (years) | x | x | x | x |
| Rent Escalation (%) | x | x | x | x |
| Rent Bumps (Annual / Every 5 Years / Other) | x | x | x | x |
| Option Periods | x | x | x | x |
| Commencement Date | x | x | x | x |
| Expiration Date | x | x | x | x |
| Occupancy | x | x | x | x |
| Reported Tenant Sales (annual) | x | x | x | x |
| Source | x | x | x | x |
| Confidence | x | x | x | x |

## Open questions to confirm while you're here
1. **NNN** — kept as **PSF** here. Want it as **Annual $** instead (to match Base Rent / TI)? Mark: `[ ] keep PSF  [ ] make Annual`
2. **BTS (NN) vs BTS (NNN)** — currently identical field sets. Should NN differ (e.g. drop TI, or add a "landlord responsibilities" note)? ______
3. Any field missing from the list above? Add a row.
