#!/usr/bin/env python3
"""Template completeness test — every template paragraph must be accounted for.

Mike's rule: assign EVERY paragraph of the template to exactly one category; anything unassigned is
a gap BY CONSTRUCTION. This is the permanent completeness test AND the template-transition detector.

The authoritative input is `LOI_sweep_manifest.json` (Mike's 236-paragraph sweep). Its schema:

    { "template": "<name>.docx",
      "template_paragraphs": <int N>,
      "assignments": { "<para index 0..N-1>": { "category": <cat>, "clause": <key?>, "note": ..., "text_head": ... } } }

Categories (one per paragraph):
  primary       — a coded position's body.                          ref: clause
  addon         — an add-on modifier body (coded or uncoded).       ref: clause
  instruction   — bracketed instruction, stripped at assembly.      (no ref)
  letter_shell  — date/addressee/RE/salutation/opening/closing frame. ref: clause (letter_shell)
  blocked       — deliberately deferred in this deal type
                  (R0/R1 rent schedule, LCW primaries).             ref: clause (may be un-modeled, e.g. rent)
  empty         — blank paragraph.                                  (auto)

Three assertions (Mike's):
  (1) every NON-EMPTY paragraph carries a category — and, stronger, EVERY paragraph index 0..N-1 has
      an assignment with a valid category (so nothing can be silently dropped);
  (2) every `primary`/`addon` paragraph maps to a LOADED canonical body — its `clause` is a loaded
      clause carrying >=1 canonical body in the seed tranches;
  (3) NOTHING is unassigned — a missing index or an `unassigned`/invalid category is a gap and FAILS.

Granularity note: the manifest carries only `clause` per paragraph (no brace_code/segment_key), so
assertion (2) is checked at CLAUSE level — "this clause is loaded and has >=1 canonical body," not
per-paragraph body identity. That is the finest check the manifest supports.

Deferred clauses: a clause explicitly marked `_blocked` in the tranches (its base is deferred, e.g.
`landlord_work` pending the LCW rent-schedule column-insert contract) is a tracked deferral, exactly
as the loader treats `_blocked`. `primary`/`addon` paragraphs on such a clause are reported in a
DEFERRED bucket — visible and counted, NOT a silent pass and NOT a false failure. When the clause
unblocks and loads its bodies, those paragraphs move to covered automatically; if it never loads, the
DEFERRED count keeps the gap in view.

Transition detector: if the template .docx is available (passed explicitly, or auto-discovered under
templates/), the harness also asserts the docx paragraph count equals `template_paragraphs` and that
each non-empty paragraph's text starts with the manifest's recorded `text_head`. A new/moved/edited
paragraph in a future Starbucks drop breaks that match and fails the harness.

Usage:
  python3 completeness_test.py <manifest.json> [template.docx]   # run the test
  python3 completeness_test.py --draft <template.docx>           # emit a starter manifest to refine
"""
import sys, json, glob, os
import docx

CATS = {"primary", "addon", "instruction", "letter_shell", "blocked", "empty"}
CONTENT = {"primary", "addon"}                       # categories that must map to a loaded body
SEED_DIR = os.path.dirname(os.path.abspath(__file__))


def seed_inventory():
    """Read the loaded library out of the seed tranches.

    Returns:
      loaded_clauses  — clause_keys present and NOT `_blocked`.
      deferred_clauses — clause_keys present AND `_blocked` (base deferred; bodies not loaded yet).
      clause_has_body — {clause_key: bool} whether the clause carries >=1 reachable canonical body
                        (position -> position_bodies -> a declared canonical_body ref).
    """
    loaded_clauses, deferred_clauses = set(), set()
    body_refs = {}     # clause_key -> set of canonical_body refs reached via positions
    declared = set()   # every canonical_body ref declared anywhere
    for f in glob.glob(os.path.join(SEED_DIR, "loi_seed_tranche*.json")):
        d = json.load(open(f))
        for b in d.get("canonical_bodies", []):
            if b.get("ref"):
                declared.add(b["ref"])
        for c in d.get("clauses", []):
            ck = c.get("clause_key")
            if not ck:
                continue
            if c.get("_blocked"):
                deferred_clauses.add(ck)
                continue
            loaded_clauses.add(ck)
            refs = body_refs.setdefault(ck, set())
            for v in c.get("variants", []):
                for p in v.get("positions", []):
                    for pb in p.get("position_bodies", []) or []:
                        r = pb.get("canonical_body_ref")
                        if r:
                            refs.add(r)
    # a clause "has a loaded body" iff it reaches >=1 canonical body ref that was actually declared
    clause_has_body = {ck: bool(refs & declared) for ck, refs in body_refs.items()}
    # a clause deferred-only (blocked in every tranche, never loaded) stays out of loaded_clauses
    deferred_clauses -= loaded_clauses
    return loaded_clauses, deferred_clauses, clause_has_body


def find_template(manifest):
    """Best-effort locate the template .docx for the transition-detector cross-check."""
    cands = sorted(glob.glob(os.path.join(SEED_DIR, "templates", "*.docx")))
    return cands[0] if len(cands) == 1 else None


def draft(template):
    """Rough auto-classification to seed a manifest for Mike to refine. Heuristic, not authoritative."""
    import re
    CODE_RE = re.compile(r"\[\{([A-Z0-9]+)[^}]*\}\]|\{([A-Z0-9]+)\b")
    INSTR_RE = re.compile(r"^\s*\[[^{].*\]\s*$")
    texts = [p.text for p in docx.Document(template).paragraphs]
    assignments = {}
    for i, t in enumerate(texts):
        s = t.strip()
        if not s:
            cat = "empty"
        elif INSTR_RE.match(s):
            cat = "instruction"
        elif CODE_RE.search(t):
            cat = "primary"        # carries a code — Mike confirms primary vs addon
        else:
            cat = "unassigned"     # GAP candidate — Mike must assign
        entry = {"category": cat}
        if cat != "empty":
            entry["text_head"] = s[:80]
        assignments[str(i)] = entry
    return {"template": os.path.basename(template), "template_paragraphs": len(texts), "assignments": assignments}


def run(manifest_path, template_path):
    manifest = json.load(open(manifest_path))
    n = manifest.get("template_paragraphs")
    assignments = manifest.get("assignments") or {}
    if not isinstance(n, int):
        print("manifest missing integer 'template_paragraphs'"); sys.exit(2)
    if not isinstance(assignments, dict):
        print("manifest 'assignments' must be a dict keyed by paragraph index"); sys.exit(2)

    loaded_clauses, deferred_clauses, clause_has_body = seed_inventory()

    problems = []    # hard failures (gaps)
    deferred = []    # primary/addon on a deliberately-deferred clause (visible, not a failure)

    # (1)+(3): every paragraph index 0..n-1 present with a valid category
    for i in range(n):
        e = assignments.get(str(i))
        if e is None:
            problems.append(f"para {i}: NO assignment (unassigned gap)")
            continue
        cat = e.get("category")
        if cat not in CATS:
            problems.append(f"para {i}: unassigned/invalid category {cat!r} (gap)")
            continue
        # (2): primary/addon must map to a loaded canonical body (clause level)
        if cat in CONTENT:
            ck = e.get("clause")
            if not ck:
                problems.append(f"para {i}: {cat} has no 'clause' ref")
            elif ck in deferred_clauses:
                deferred.append((i, cat, ck))
            elif ck not in loaded_clauses:
                problems.append(f"para {i}: {cat} references clause {ck!r} not loaded in any tranche")
            elif not clause_has_body.get(ck):
                problems.append(f"para {i}: {cat} references clause {ck!r} which has no loaded canonical body")

    # stray manifest entries beyond the declared paragraph range
    for k in assignments:
        try:
            ki = int(k)
        except (TypeError, ValueError):
            problems.append(f"assignment key {k!r} is not an integer paragraph index")
            continue
        if ki < 0 or ki >= n:
            problems.append(f"assignment key {ki} outside paragraph range 0..{n-1}")

    # transition detector: cross-check against the real template docx if we can find it
    docx_note = "manifest-only (template .docx not provided/found — transition detector SKIPPED)"
    if template_path and os.path.exists(template_path):
        texts = [p.text for p in docx.Document(template_path).paragraphs]
        docx_note = f"cross-checked against {os.path.basename(template_path)} ({len(texts)} paragraphs)"
        if len(texts) != n:
            problems.append(f"template drift: docx has {len(texts)} paragraphs, manifest declares {n}")
        for i in range(min(n, len(texts))):
            e = assignments.get(str(i)) or {}
            head = e.get("text_head")
            if head:
                # text_head is a human-recorded prefix with leading indentation stripped; ignore
                # leading whitespace on both sides so pure indentation isn't flagged as drift.
                actual = texts[i].replace("\r", "").lstrip()
                if not actual.startswith(head.lstrip()):
                    problems.append(f"para {i}: template text drift — docx {actual[:50]!r} does not start with manifest head {head.lstrip()[:50]!r}")

    from collections import Counter
    hist = Counter(e.get("category") for e in assignments.values())
    content_total = hist.get("primary", 0) + hist.get("addon", 0)
    print(f"template: {manifest.get('template')} | paragraphs: {n} | assignments: {len(assignments)}")
    print(f"transition check: {docx_note}")
    print("category histogram:", dict(hist))
    print(f"content paragraphs (primary+addon): {content_total} — covered: {content_total - len(deferred)}, deferred: {len(deferred)}")
    if deferred:
        print("\nDEFERRED (clause base blocked; will cover when it loads):")
        for i, cat, ck in deferred:
            print(f"  - para {i}: {cat} on deferred clause {ck!r}")
    if problems:
        print(f"\nCOMPLETENESS FAILED — {len(problems)} problem(s):")
        for pr in problems[:80]:
            print("  -", pr)
        if len(problems) > 80:
            print(f"  … and {len(problems)-80} more")
        sys.exit(1)
    print("\nCOMPLETENESS PASSED — every paragraph assigned; every primary/addon maps to a loaded "
          "canonical body (or a tracked deferred clause); nothing unassigned.")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:]]
    if not args:
        print("usage: completeness_test.py <manifest.json> [template.docx]   |   --draft <template.docx>")
        sys.exit(2)
    if args[0] == "--draft":
        if len(args) < 2:
            print("usage: completeness_test.py --draft <template.docx>"); sys.exit(2)
        print(json.dumps(draft(args[1]), indent=1, ensure_ascii=False))
    else:
        manifest_path = args[0]
        template_path = args[1] if len(args) > 1 else find_template(manifest_path)
        run(manifest_path, template_path)
