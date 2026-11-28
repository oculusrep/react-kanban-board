# Market Research permissions

Three keys in the User Management permissions matrix (System Administration):

| Key | Gates | Enforced |
|---|---|---|
| `can_view_market_research` | "Market research runs" section on Starbucks site submits; open runs/sweeps in the approval modal read-only | UI only (staged tables are readable to internal users via RLS) |
| `can_run_market_research` | Start research button, cancel run, cancel sweep, skip chunk, re-run gaps. Implies view | `ovis-research-trigger` + `cancel_research_run` / `cancel_sweep` / `skip_sweep_chunk` via `user_has_market_research_run_access()` |
| `can_approve_market_research` | Approve/reject/merge staged findings. Implies view | Approval modal + approval RPCs |

`can_view_market_research` added 2026-10-21 (migration `20261021163710`), granted to the admin
role only. Site Story has its own pair (`can_view_site_story` / `can_run_site_story`) — see
[SITE_STORY_CONTEXT.md](SITE_STORY_CONTEXT.md).
