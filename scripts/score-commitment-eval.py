#!/usr/bin/env python3
"""Score the live commitment rows against Mike's 2026-10-10 rating.

docs/commitment_eval.json is the regression set. A conversation rated `pitch` or
`done` must hold NO ball='me' row; a conversation rated `open_me` MUST hold one.

    python3 scripts/score-commitment-eval.py [--verbose]

OPEN-ME MISSING MUST BE 0 FOR ANY CHANGE TO SHIP. That is the line that protects
recall: every other number can be argued about, but a commitment the owner
confirmed is real and open going missing means the change made the tool lie by
omission. Exit status is 1 when it is non-zero, so this can gate a deploy.

Matching is by conversation, not row id: a key matches gmail_thread_id OR any
member of conversation_thread_ids, because conversations merge thread_ids and a
retired-and-reinserted row gets a new id.
"""
import json, os, pathlib, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
EVAL = ROOT / "docs" / "commitment_eval.json"


def database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if url:
        return url
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("DATABASE_URL not set and not found in .env")


def main() -> int:
    verbose = "--verbose" in sys.argv
    spec = json.loads(EVAL.read_text())
    owner = spec["owner"]
    rows = spec["rows"]

    values = ",".join(
        "(%d,'%s','%s')" % (r["rn"], r["conversation_key"], r["expected"]) for r in rows
    )
    sql = f"""
    with ev(rn, ck, expected) as (values {values}),
    mine as (
      select c.* from commitment c
      join gmail_connection g on g.id = c.gmail_connection_id
      where g.google_email = '{owner}'
    )
    select ev.rn, ev.expected,
           exists(select 1 from mine m
                  where (m.gmail_thread_id = ev.ck or ev.ck = any(m.conversation_thread_ids))
                    and m.ball = 'me') as has_me
    from ev order by ev.rn;
    """
    out = subprocess.run(
        ["psql", database_url(), "-X", "-t", "-A", "-F", "\t", "-c", sql],
        capture_output=True, text=True,
    )
    if out.returncode != 0:
        sys.exit(f"psql failed: {out.stderr.strip()[:400]}")

    seen = {}
    for line in out.stdout.strip().splitlines():
        rn, expected, has_me = line.split("\t")
        seen[int(rn)] = (expected, has_me == "t")
    if len(seen) != len(rows):
        sys.exit(f"expected {len(rows)} eval rows back, got {len(seen)}")

    pitch_present = [rn for rn, (e, h) in seen.items() if e == "pitch" and h]
    done_present = [rn for rn, (e, h) in seen.items() if e == "done" and h]
    open_missing = [rn for rn, (e, h) in seen.items() if e == "open_me" and not h]

    n_pitch = sum(1 for e, _ in seen.values() if e == "pitch")
    n_done = sum(1 for e, _ in seen.values() if e == "done")
    n_open = sum(1 for e, _ in seen.values() if e == "open_me")

    print(f"pitches present:   {len(pitch_present)}/{n_pitch}" + (f"  rows {pitch_present}" if pitch_present else ""))
    print(f"done-but-present:  {len(done_present)}/{n_done}" + (f"  rows {done_present}" if done_present else ""))
    print(f"open-me missing:   {len(open_missing)}/{n_open}" + (f"  rows {open_missing}  <-- BLOCKS SHIP" if open_missing else "  OK"))

    if verbose:
        by = {r["rn"]: r for r in rows}
        print()
        for rn in sorted(seen):
            e, h = seen[rn]
            ok = (e == "open_me") == h
            print(f"  #{rn:>2} {e:<8} has_me={'Y' if h else 'N'} {'ok ' if ok else 'MISS'} {by[rn]['what']}")

    return 1 if open_missing else 0


if __name__ == "__main__":
    sys.exit(main())
