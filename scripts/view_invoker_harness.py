"""Does turning on security_invoker break these views for legitimate users?

Usage:
    set -a && . ../react-kanban-board/.env && set +a
    python3 scripts/view_invoker_harness.py /tmp/out [view1,view2,...]

With no view list it tests all ten views from the 2026-09-28 audit.

A view without security_invoker runs with its OWNER's privileges, so base-table
RLS never applies to the caller — an anon SELECT grant on such a view is an
unrestricted read (docs/SUPABASE_ANON_EXPOSURE_AUDIT.md). Turning security_invoker
on is the correct fix, but some of these views may be definer BY DESIGN: an
aggregate like "avg deal speed by client" can need to see rows no single user may
read individually. Flipping it would silently empty the view for real users.

So: measure. One transaction, always ROLLED BACK.
  setup (pick a real login per role)
  -> BEFORE: row count per (role, view)
  -> ALTER VIEW ... SET (security_invoker = on) for every view
  -> AFTER: same counts
  -> ROLLBACK

A view is SAFE to flip only if no internal role loses rows. Errors count as
losses too: security_invoker also requires the caller to hold SELECT on the base
tables, which the email/portal lockdowns revoked in places.
"""
import csv, os, re, subprocess, sys

DB = os.environ["DATABASE_URL"]
OUT = sys.argv[1]

ALL_VIEWS = [
    "portal_user_analytics", "client_velocity_stats", "municipal_project_v",
    "budget_vs_actual_monthly", "document_handoff_history",
    "v_prospecting_stale_targets", "v_prospecting_target",
    "v_prospecting_daily_metrics", "v_prospecting_weekly_metrics", "v_contact_tags",
]
VIEWS = sys.argv[2].split(",") if len(sys.argv) > 2 else ALL_VIEWS
ROLES = ["admin", "broker_full", "broker_lite", "va", "coach", "portal"]
INTERNAL = {"admin", "broker_full", "broker_lite", "va", "coach"}


def role_block(phase, role):
    probes = []
    for v in VIEWS:
        # savepoint per view so a timeout or permission error doesn't abort the run
        probes.append(f"""
SAVEPOINT p;
\\o {OUT}/{phase}_{role}_{v}.txt
SELECT count(*) FROM public."{v}";
\\o
ROLLBACK TO SAVEPOINT p;""")
    return f"""
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', :'{role}_uid', 'role','authenticated')::text, true) \\gset ig_
{''.join(probes)}
RESET ROLE;
"""


flips = "\n".join(
    f'ALTER VIEW public."{v}" SET (security_invoker = on);' for v in VIEWS)

script = f"""
\\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '25s';
\\set QUIET on
select auth_user_id as uid from public."user" where ovis_role='admin' and auth_user_id is not null limit 1 \\gset admin_
select auth_user_id as uid from public."user" where ovis_role='broker_full' and auth_user_id is not null limit 1 \\gset broker_full_
select auth_user_id as uid from public."user" where ovis_role='va' and auth_user_id is not null limit 1 \\gset va_
select auth_user_id as uid from public."user" where ovis_role='coach' and auth_user_id is not null limit 1 \\gset coach_
select c.portal_auth_user_id as uid from public.contact c where c.portal_auth_user_id is not null limit 1 \\gset portal_
select a.id as uid from auth.users a
  where not exists (select 1 from public."user" u where u.auth_user_id=a.id)
    and not exists (select 1 from public.contact c where c.portal_auth_user_id=a.id) limit 1 \\gset broker_lite_
insert into public."user" (auth_user_id, ovis_role) values (:'broker_lite_uid', 'broker_lite');
\\set ON_ERROR_STOP off
{''.join(role_block('before', r) for r in ROLES)}
{flips}
{''.join(role_block('after', r) for r in ROLES)}
ROLLBACK;
"""

os.makedirs(OUT, exist_ok=True)
with open(f"{OUT}/view_harness.sql", "w") as f:
    f.write(script)
r = subprocess.run(["psql", DB, "-q", "-f", f"{OUT}/view_harness.sql"],
                   capture_output=True, text=True, timeout=1800)


def load(phase, role, view):
    """-> int rows, or a short error tag."""
    try:
        txt = open(f"{OUT}/{phase}_{role}_{view}.txt").read()
    except FileNotFoundError:
        return "MISSING"
    m = re.search(r"^\s*(\d+)\s*$", txt, re.M)
    if m:
        return int(m.group(1))
    if "permission denied" in txt:
        return "DENIED"
    if "timeout" in txt or "canceling" in txt:
        return "TIMEOUT"
    return "ERROR"


hdr = f"{'view':30}" + "".join(f"{r:>16}" for r in ROLES)
print("ROWS VISIBLE PER ROLE  (before -> after security_invoker=on)\n")
print(hdr); print("-" * len(hdr))
verdicts = {}
for v in VIEWS:
    cells, safe, reasons = [], True, []
    for role in ROLES:
        b, a = load("before", role, v), load("after", role, v)
        cells.append(str(b) if b == a else f"{b}->{a}")
        if role in INTERNAL:
            lost = (isinstance(b, int) and isinstance(a, int) and a < b) \
                   or (isinstance(b, int) and not isinstance(a, int))
            if lost:
                safe = False
                reasons.append(f"{role} {b}->{a}")
    verdicts[v] = (safe, reasons)
    print(f"{v:30}" + "".join(f"{c:>16}" for c in cells))

print("\nVERDICT\n")
for v, (safe, reasons) in verdicts.items():
    print(f"  {'SAFE TO FLIP ' if safe else 'DO NOT FLIP  '} {v:30} {'' if safe else '(' + '; '.join(reasons) + ')'}")

errs = [l for l in r.stderr.splitlines() if "ERROR" in l and "permission denied" not in l]
if errs:
    print("\npsql errors (first 10):\n" + "\n".join(errs[:10]))
