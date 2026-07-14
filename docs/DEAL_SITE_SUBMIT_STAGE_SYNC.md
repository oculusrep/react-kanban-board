# Deal ↔ Site Submit Stage Sync

Two-way sync so a stage change on either a deal or its linked site submit propagates to the other. Runs at the database layer via triggers — no code path can bypass it.

Supersedes [PLAN_2026_04_25_DEAL_SITE_SUBMIT_STAGE_SYNC.md](PLAN_2026_04_25_DEAL_SITE_SUBMIT_STAGE_SYNC.md) (the pre-implementation plan).

## Why

Before this shipped, `deal.stage_id` and `site_submit.submit_stage_id` were only aligned once — at conversion time in [ConvertToDealModal.tsx:262-291](../src/components/ConvertToDealModal.tsx#L262-L291), which wrote deal = "Negotiating LOI" and site_submit = "LOI" and never touched them again. All subsequent edits drifted freely, which was visible on the map (site submit pins are colored by `submit_stage.name` — see [SiteSubmitLayer.tsx:167](../src/components/mapping/layers/SiteSubmitLayer.tsx#L167)) and in Starbucks pipeline reviews where the deal had advanced but the pin still showed the old stage.

## How it works

### Mapping table

`public.deal_submit_stage_map` — one row per equivalence pair. Unique on both FK columns so each stage on either side has at most one counterpart:

| deal_stage | ↔ | submit_stage |
|---|---|---|
| Pre-Submittal | ↔ | Pre-Submittal |
| Submitted-Reviewing | ↔ | Submitted-Reviewing |
| Negotiating LOI | ↔ | LOI |
| At Lease/PSA | ↔ | At Lease/PSA |
| Under Contract / Contingent | ↔ | Under Contract / Contingent |
| Booked | ↔ | Booked |
| Executed Payable | ↔ | Executed Deal |
| Closed Paid | ↔ | Store Open |
| Lost | ↔ | Lost / Killed |

Submit stages **without a mapping** (Monitor, Mike to Review, Not Available, Pass, Protected, Pursuing Ownership, Ready to Submit, Tour, Unassigned Territory, Use Conflict, Use Declined, Closed - Under Construction) belong to phases where no deal exists, or intermediate site-submit-only states. Advancing a site submit into one of these does not touch the deal.

### Triggers

Both live in [supabase/migrations/20260714120000_deal_submit_stage_sync.sql](../supabase/migrations/20260714120000_deal_submit_stage_sync.sql):

- `trigger_sync_deal_stage_to_site_submit` — `AFTER UPDATE OF stage_id ON deal`. If a mapping row exists, updates every site_submit linked via `deal_id`.
- `trigger_sync_site_submit_stage_to_deal` — `AFTER UPDATE OF submit_stage_id ON site_submit`. If a mapping row exists and `deal_id` is non-null, updates the deal.

Loop prevention uses a **value-comparison guard** (`WHERE ... IS DISTINCT FROM`) — same pattern as the existing `sync_loi_date_*` triggers. Once both sides hold the mapped value, the reciprocal trigger's UPDATE matches zero rows and returns.

### Editing the mapping

To add a new pair (e.g. Starbucks adds a new deal stage in the future):

```sql
INSERT INTO public.deal_submit_stage_map (deal_stage_id, submit_stage_id)
SELECT ds.id, ss.id
FROM public.deal_stage   ds,
     public.submit_stage ss
WHERE ds.label = 'New Deal Stage'
  AND ss.name  = 'New Submit Stage';
```

To break an equivalence:

```sql
DELETE FROM public.deal_submit_stage_map
WHERE deal_stage_id = (SELECT id FROM public.deal_stage WHERE label = 'Deal Stage To Unmap');
```

The trigger will no-op for that stage from that point forward. Existing pairs at the unmapped stage are unaffected.

## One-time cleanup for pre-existing drift

The trigger only fires on *future* edits. Records that were already out of sync when the sync shipped need a separate backfill.

Approach: **deal-authoritative, with an exclusion list.** Update each site_submit to match the deal's mapped counterpart, **except** in three cases:

1. Deal is `Lost` but site is at an active stage (site side may capture a more specific rejection like Pass / Use Declined / Use Conflict — don't clobber).
2. Site is `Lost / Killed` but deal is at an active stage (real contradiction — one side is wrong).
3. Site is at an **unmapped** stage — e.g. `Closed - Under Construction`, which sits between `Executed Deal` and `Store Open` on the site side and has no deal-side counterpart. Overwriting would either regress the site or falsely mark it open.

- **Backfill script**: [supabase/deal_submit_stage_backfill.sql](../supabase/deal_submit_stage_backfill.sql). Wrapped in a transaction; prints the row counts before the UPDATE so you can review before committing.
- **Outliers report**: [supabase/deal_submit_stage_outliers.sql](../supabase/deal_submit_stage_outliers.sql). Lists every pair the backfill skipped. Review each row and manually align the stages.

Run order:

```bash
# 1. Apply the migration (creates table + triggers)
supabase db push

# 2. See what the outliers are
psql "$DATABASE_URL" -f supabase/deal_submit_stage_outliers.sql

# 3. Run the backfill (interactive — review counts before COMMIT)
psql "$DATABASE_URL" -f supabase/deal_submit_stage_backfill.sql
```

## Testing after deploy

Quick smoke tests in the UI:

1. Open any Starbucks deal that's linked to a site submit. Change the deal's stage from "Negotiating LOI" to "At Lease/PSA". Reload the site submit sidebar — its stage should be "At Lease/PSA". Reload the map — the pin should re-color.
2. Reverse: on the same site submit, change stage back to "LOI". Reload the deal — its stage should be "Negotiating LOI".
3. Move a site submit to "Monitor" (no mapping row). The deal should stay put — no propagation.

## Known limitations

- **No audit-trail attribution.** The propagated update is written by the trigger itself; if you add `deal_stage_history` / `site_submit_stage_history` tables later (as planned for the portal email alerts feature), the trigger will need extension so the history row is attributed to the user who originally moved the stage rather than "OVIS."
- **No conflict resolution** if both records are updated in the same transaction. In practice the UI always edits one side at a time, so this hasn't been an issue.
- **Multiple site submits per deal** — the trigger will propagate deal-side changes to all of them. Today every deal has ≤1 linked site submit, so this is theoretical.
