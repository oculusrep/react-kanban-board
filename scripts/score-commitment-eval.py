#!/usr/bin/env python3
"""Score the live commitment rows against Mike's 2026-10-10 rating.

docs/commitment_eval.json is the regression set. A conversation rated `pitch` or
`done` must hold NO ball='me' row; a conversation rated `open_me` MUST hold one.

    python3 scripts/score-commitment-eval.py [--verbose]

THE GATE IS "NO WORSE THAN BASELINE", not "perfect". Baseline was measured on
2026-10-13 and lives in the fixture's _baseline block: 1 pitch present, 5
done-but-present, 1 open-me missing. Exit status is 1 if ANY of the three gets
worse, so this can gate a deploy.

Two rows are recorded as known misses in the fixture (#22, #4) with the reason.
A known miss still counts in the totals -- it is held at the baseline, not
excused -- so a change that fixes one lowers the number and a change that breaks
another raises it. Recall is the one that matters most: a commitment the owner
confirmed is real and open going missing means the tool lies by omission.

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

    base = spec.get("_baseline", {})
    b_pitch = base.get("pitches_present", 0)
    b_done = base.get("done_but_present", 0)
    b_open = base.get("open_me_missing", 0)
    regressions = []
    if len(pitch_present) > b_pitch: regressions.append(f"pitches present {len(pitch_present)} > baseline {b_pitch}")
    if len(done_present) > b_done: regressions.append(f"done-but-present {len(done_present)} > baseline {b_done}")
    if len(open_missing) > b_open: regressions.append(f"open-me missing {len(open_missing)} > baseline {b_open}")

    def mark(got: int, base_n: int) -> str:
        if got > base_n: return "  WORSE THAN BASELINE"
        if got < base_n: return "  better than baseline"
        return "  at baseline"

    print(f"pitches present:   {len(pitch_present)}/{n_pitch}{mark(len(pitch_present), b_pitch)}" + (f"  rows {pitch_present}" if pitch_present else ""))
    print(f"done-but-present:  {len(done_present)}/{n_done}{mark(len(done_present), b_done)}" + (f"  rows {done_present}" if done_present else ""))
    print(f"open-me missing:   {len(open_missing)}/{n_open}{mark(len(open_missing), b_open)}" + (f"  rows {open_missing}" if open_missing else ""))

    if verbose:
        by = {r["rn"]: r for r in rows}
        print()
        for rn in sorted(seen):
            e, h = seen[rn]
            ok = (e == "open_me") == h
            print(f"  #{rn:>2} {e:<8} has_me={'Y' if h else 'N'} {'ok ' if ok else 'MISS'} {by[rn]['what']}")

    if regressions:
        print()
        for r in regressions:
            print(f"BLOCKS SHIP: {r}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
