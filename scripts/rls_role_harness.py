"""Per-role RLS harness.

Usage:
    set -a && . ./.env && set +a
    python3 scripts/rls_role_harness.py supabase/migrations/<file>.sql /tmp/out

Proves what each role can read AND write before vs after a migration, without
applying anything. Written for the portal-authz hotfix (docs/PORTAL_AUTHZ_HOTFIX.md)
and kept for feature/portal-field-control, which changes the same policies.

Row counts alone hide write regressions — hence the write probes.

One transaction, always ROLLED BACK:
  setup (pick real users; simulate broker_lite on a borrowed unmapped login)
  -> BEFORE: row counts + write probes for every role
  -> apply the migration file
  -> AFTER: same
  -> ROLLBACK

Writes are no-op UPDATEs (SET col = col) wrapped in savepoints, so the count is
"rows this role is allowed to modify", and nothing persists.
"""
import csv, io, os, subprocess, sys

DB = os.environ["DATABASE_URL"]
MIGRATION = sys.argv[1]
OUT = sys.argv[2]

ROLES = ["admin", "broker_full", "broker_lite", "va", "coach", "portal"]
INTERNAL = {"admin", "broker_full", "broker_lite", "va"}

# Write probes: a no-op update on a real column. (table, column)
WRITE_PROBES = [
    ("deal", "deal_name"), ("contact", "first_name"), ("property", "property_name"),
    ("site_submit", "site_submit_name"), ("client", "client_name"), ("payment", "id"),
    ("commission_split", "id"), ("critical_date", "id"), ("property_unit", "id"),
    ("assignment", "id"), ("deal_contact", "id"), ("note", "id"),
]


def q(sql):
    r = subprocess.run(["psql", DB, "-At", "-c", sql], capture_output=True, text=True, timeout=120)
    if r.returncode:
        sys.exit(r.stderr)
    return [l for l in r.stdout.splitlines() if l]


tables = q("""
  select distinct tablename from pg_policies where schemaname='public'
    and (coalesce(qual,'')||coalesce(with_check,'')) ~
        '(get_user_role|can_manage_operations|has_full_access|is_admin|is_assistant|is_broker)\\('
  union select unnest(array['site_submit_comment','site_submit_activity','deal_synopsis',
    'portal_email_send','hunter_outreach_draft','property_activity','prospecting_activity',
    'thread_message','portal_activity_log'])
  order by 1""")
count_sql = " union all ".join(
    f"select '{t}' as t, count(*) as n from public.\"{t}\"" for t in tables)


def role_block(phase, role):
    probes = []
    for tbl, col in WRITE_PROBES:
        probes.append(f"""
SAVEPOINT w;
\\o {OUT}/{phase}_{role}_w_{tbl}.txt
WITH u AS (UPDATE public."{tbl}" SET "{col}" = "{col}" RETURNING 1) SELECT count(*) FROM u;
\\o
ROLLBACK TO SAVEPOINT w;""")
    return f"""
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', :'{role}_uid', 'role','authenticated')::text, true) \\gset ig_
\\pset format csv
\\o {OUT}/{phase}_{role}.csv
{count_sql};
\\o
\\pset format aligned
{''.join(probes)}
RESET ROLE;
"""


script = f"""
\\set ON_ERROR_STOP on
BEGIN;
\\set QUIET on
select auth_user_id as uid from public."user" where ovis_role='admin' and auth_user_id is not null limit 1 \\gset admin_
select auth_user_id as uid from public."user" where ovis_role='broker_full' and auth_user_id is not null limit 1 \\gset broker_full_
select auth_user_id as uid from public."user" where ovis_role='va' and auth_user_id is not null limit 1 \\gset va_
select auth_user_id as uid from public."user" where ovis_role='coach' and auth_user_id is not null limit 1 \\gset coach_
select c.portal_auth_user_id as uid from public.contact c where c.portal_auth_user_id is not null limit 1 \\gset portal_
-- broker_lite: no such login exists, so borrow the one auth login that has neither
-- a user row nor a portal contact, and give it a broker_lite user row. Rolled back.
select a.id as uid from auth.users a
  where not exists (select 1 from public."user" u where u.auth_user_id=a.id)
    and not exists (select 1 from public.contact c where c.portal_auth_user_id=a.id) limit 1 \\gset broker_lite_
insert into public."user" (auth_user_id, ovis_role) values (:'broker_lite_uid', 'broker_lite');
\\set ON_ERROR_STOP off
{''.join(role_block('before', r) for r in ROLES)}
\\set ON_ERROR_STOP on
\\o /dev/null
\\i {MIGRATION}
\\o
\\set ON_ERROR_STOP off
{''.join(role_block('after', r) for r in ROLES)}
ROLLBACK;
"""
os.makedirs(OUT, exist_ok=True)
with open(f"{OUT}/harness.sql", "w") as f:
    f.write(script)
r = subprocess.run(["psql", DB, "-q", "-f", f"{OUT}/harness.sql"], capture_output=True, text=True, timeout=600)
errors = [l for l in r.stderr.splitlines() if "ERROR" in l]
if errors:
    print("psql errors:\n" + "\n".join(errors[:10]))


def load(phase, role):
    with open(f"{OUT}/{phase}_{role}.csv") as f:
        return {row["t"]: int(row["n"]) for row in csv.DictReader(f)}


def wload(phase, role, tbl):
    try:
        lines = [l.strip() for l in open(f"{OUT}/{phase}_{role}_w_{tbl}.txt") if l.strip().isdigit()]
        return int(lines[0]) if lines else None
    except FileNotFoundError:
        return None


before = {r: load("before", r) for r in ROLES}
after = {r: load("after", r) for r in ROLES}

# --- READ matrix -----------------------------------------------------------
print(f"READ ACCESS — {len(tables)} tables, rows visible (before → after)\n")
hdr = f"{'table':32}" + "".join(f"{r:>18}" for r in ROLES)
print(hdr); print("-" * len(hdr))
internal_losses = []
for t in tables:
    cells = []
    for r in ROLES:
        b, a = before[r].get(t), after[r].get(t)
        cells.append(f"{b}" if b == a else f"{b}→{a}")
        if r in INTERNAL and b is not None and a is not None and a < b:
            internal_losses.append((r, t, b, a))
    print(f"{t:32}" + "".join(f"{c:>18}" for c in cells))

# --- WRITE probes ----------------------------------------------------------
print(f"\nWRITE ACCESS — rows each role may UPDATE (before → after)\n")
print(f"{'table':32}" + "".join(f"{r:>18}" for r in ROLES)); print("-" * len(hdr))
write_losses = []
for tbl, _ in WRITE_PROBES:
    cells = []
    for r in ROLES:
        b, a = wload("before", r, tbl), wload("after", r, tbl)
        cells.append(f"{b}" if b == a else f"{b}→{a}")
        if r in INTERNAL and b and (a or 0) < b:
            write_losses.append((r, tbl, b, a))
    print(f"{tbl:32}" + "".join(f"{c:>18}" for c in cells))

print("\nINTERNAL READ LOSSES:", internal_losses or "none")
print("INTERNAL WRITE LOSSES:", write_losses or "none")
