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

# `heading` = emitted structural text belonging to the named clause, carrying NO canonical body.
# Headings are TEMPLATE-OWNED (contract B rule 4): the assembler preserves the template's heading
# run and replaces only the content after it, so no body supplies a heading. The letter template
# fuses headings into the clause paragraph; the addendum has them as separate paragraphs, which is
# why the category exists. Exempt from the body rules, exactly as `letter_shell` is.
# `computed_table` = emitted, but its content comes from the ENGINE at assembly time, not from any
# canonical body. The rent rows (template paras 51-59) are a fixed run of SKELETON paragraphs the
# assembler replaces with computed rows; they exist whether or not R1 is the selected rung, so the
# behaviour belongs to the skeleton, not to a position. Same shape as `heading` one level up: the
# skeleton owns it, no body supplies it, and rules 2 and 4 skip it.
CATS = {"primary", "addon", "instruction", "letter_shell", "heading", "computed_table", "blocked", "empty"}
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
    declared = {}      # ref -> (brace_code, segment_key) for every canonical_body declared anywhere
    superseded = set() # refs a later tranche DELETED (not merely unreferenced)
    for f in sorted(glob.glob(os.path.join(SEED_DIR, "loi_seed_tranche*.json"))):
        d = json.load(open(f))
        for r in (d.get("_supersedes") or {}).get("canonical_bodies", []) or []:
            superseded.add(r)
        for b in d.get("canonical_bodies", []):
            if b.get("ref"):
                declared[b["ref"]] = (b.get("brace_code"), b.get("segment_key"))
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
    # A superseded body was DELETED by a later tranche; it must not satisfy a manifest reference.
    for r in superseded:
        declared.pop(r, None)
    for refs in body_refs.values():
        refs -= superseded

    # a clause "has a loaded body" iff it reaches >=1 canonical body ref that was actually declared
    clause_has_body = {ck: bool(refs & set(declared)) for ck, refs in body_refs.items()}
    # a clause deferred-only (blocked in every tranche, never loaded) stays out of loaded_clauses
    deferred_clauses -= loaded_clauses

    # (clause_key, brace_code, segment_key) reachable through a position — the normal case.
    reachable = {(ck, *declared[r]) for ck, refs in body_refs.items() for r in refs if r in declared}
    # (brace_code, segment_key) declared but reached by NO position: bodies staged for a deal type
    # (CAM1, NNN) or orphaned by a deferred clause (landlord_work's add-ons). They are loaded, so a
    # manifest entry with a null clause_key may legitimately point at one.
    unreachable = {bs for r, bs in declared.items()
                   if not any(r in refs for refs in body_refs.values())}
    return loaded_clauses, deferred_clauses, clause_has_body, reachable, unreachable


def find_template(manifest):
    """Best-effort locate this skeleton's template .docx for the transition-detector cross-check.

    A manifest whose `template` is null has no authoritative source (the addendum skeleton is
    reconstructed from an executed LOI), so nothing is looked up — pointing the detector at the
    document a manifest was derived FROM would be a tautology, not a check.
    """
    named = manifest.get("template")
    if not named:
        return None
    cands = sorted(glob.glob(os.path.join(SEED_DIR, "templates", "*.docx")))
    exact = [c for c in cands if os.path.basename(c) == named]
    if exact:
        return exact[0]
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


def check_manifest(manifest, manifest_path, template_path, inv):
    """Rules 1-3 for ONE skeleton. Returns (problems, claimed, stats)."""
    loaded_clauses, deferred_clauses, clause_has_body, reachable, unreachable = inv
    name = manifest.get("skeleton") or os.path.basename(manifest_path)
    n = manifest.get("template_paragraphs")
    assignments = manifest.get("assignments") or {}
    problems, deferred, per_body, claimed = [], [], [], set()
    n_body_refs = 0

    if not isinstance(n, int):
        return ([f"{name}: manifest missing integer 'template_paragraphs'"], claimed, None)
    if not isinstance(assignments, dict):
        return ([f"{name}: 'assignments' must be a dict keyed by paragraph index"], claimed, None)

    for i in range(n):
        e = assignments.get(str(i))
        if e is None:
            problems.append(f"{name} para {i}: NO assignment (unassigned gap)"); continue
        cat = e.get("category")
        if cat not in CATS:
            problems.append(f"{name} para {i}: unassigned/invalid category {cat!r} (gap)"); continue

        # (2) primary/addon must map to a loaded canonical body — clause level, then exact-body.
        if cat in CONTENT:
            ck = e.get("clause")
            if not ck:
                problems.append(f"{name} para {i}: {cat} has no 'clause' ref")
            elif ck in deferred_clauses:
                deferred.append((i, cat, ck))
            elif ck not in loaded_clauses:
                problems.append(f"{name} para {i}: {cat} references clause {ck!r} not loaded in any tranche")
            elif not clause_has_body.get(ck):
                problems.append(f"{name} para {i}: {cat} references clause {ck!r} which has no loaded canonical body")
            else:
                per_body.append(i)

        # A computed_table must say WHICH table it is and WHAT GATES it. Both rungs of `rent` carry a
        # table — R1's at paras 51-59, R0's at 38-47 — and they are DIFFERENT SHAPES (R1 has a fourth
        # Per Square Foot column). Ungated, both would emit; unnamed, the assembler cannot tell which
        # shape to render. Required now, while R0 is still deferred, so the gap is declared before the
        # thing exists — the same reason loi_deferred_position exists.
        if cat == "computed_table":
            if not e.get("table"):
                problems.append(f"{name} para {i}: computed_table must name its 'table' — the "
                                f"assembler cannot render a shape it cannot identify")
            g = e.get("gated_by")
            if not isinstance(g, dict) or not g.get("selector_field") or not g.get("selector_value"):
                problems.append(f"{name} para {i}: computed_table must carry 'gated_by' "
                                f"{{selector_field, selector_value}} — ungated, every rung's table emits")

        # A heading or a computed table carries no body — that is the whole point of both categories.
        if cat in ("heading", "computed_table") and e.get("bodies"):
            problems.append(f"{name} para {i}: {cat} must not claim a body — it is skeleton-owned "
                            f"and no canonical body supplies its content")

        # (3) exact-body resolution for any category that declares bodies.
        bodies = e.get("bodies")
        if bodies is not None:
            if not isinstance(bodies, list) or not bodies:
                problems.append(f"{name} para {i}: 'bodies' must be a non-empty array")
            else:
                for b in bodies:
                    if not isinstance(b, dict) or not b.get("segment_key"):
                        problems.append(f"{name} para {i}: body entry missing segment_key: {b!r}"); continue
                    bck, bc, sk = b.get("clause_key"), b.get("brace_code"), b["segment_key"]
                    if bck:
                        if (bck, bc, sk) not in reachable:
                            problems.append(f"{name} para {i}: no loaded body {bck}/{bc or '-'}/{sk} "
                                            f"(clause+brace_code+segment_key must all match a loaded body)")
                    elif (bc, sk) not in unreachable:
                        problems.append(f"{name} para {i}: body {bc or '-'}/{sk} has a null clause_key "
                                        f"but is not a declared position-less body")
                    claimed.add((bck, bc, sk))
                    n_body_refs += 1

    for k in assignments:
        try:
            ki = int(k)
        except (TypeError, ValueError):
            problems.append(f"{name}: assignment key {k!r} is not an integer paragraph index"); continue
        if ki < 0 or ki >= n:
            problems.append(f"{name}: assignment key {ki} outside paragraph range 0..{n-1}")

    # ---- transition detector -------------------------------------------------------------------
    det = manifest.get("transition_detector") or {}
    enabled = det.get("enabled", True)
    if not enabled:
        # Disabled is legitimate ONLY while no authoritative source exists. The moment one does, the
        # flag must come off — otherwise "temporarily disabled" quietly becomes permanent.
        docx_note = f"DISABLED for skeleton {name!r} — {det.get('reason','no reason recorded')}"
        if manifest.get("template"):
            problems.append(f"{name}: transition detector is disabled but the manifest names an "
                            f"authoritative template ({manifest['template']!r}) — re-enable it")
        elif template_path and os.path.exists(template_path):
            problems.append(f"{name}: transition detector is disabled but an authoritative template "
                            f"exists at {template_path} — re-enable it")
    elif template_path and os.path.exists(template_path):
        texts = [p.text for p in docx.Document(template_path).paragraphs]
        docx_note = f"cross-checked against {os.path.basename(template_path)} ({len(texts)} paragraphs)"
        if len(texts) != n:
            problems.append(f"{name}: template drift — docx has {len(texts)} paragraphs, manifest declares {n}")
        for i in range(min(n, len(texts))):
            head = (assignments.get(str(i)) or {}).get("text_head")
            if head:
                actual = texts[i].replace("\r", "").lstrip()
                if not actual.startswith(head.lstrip()):
                    problems.append(f"{name} para {i}: template text drift — docx {actual[:50]!r} "
                                    f"does not start with manifest head {head.lstrip()[:50]!r}")
    else:
        docx_note = "manifest-only (template .docx not provided/found — transition detector SKIPPED)"

    from collections import Counter
    hist = Counter(e.get("category") for e in assignments.values())
    stats = {"name": name, "n": n, "assignments": len(assignments), "hist": dict(hist),
             "docx_note": docx_note, "deferred": deferred, "per_body": per_body,
             "n_body_refs": n_body_refs, "provisional": bool(manifest.get("provisional")),
             "with_bodies": sum(1 for e in assignments.values() if e.get("bodies")),
             "body_resolved": sum(1 for i in per_body if (assignments.get(str(i)) or {}).get("bodies"))}
    return (problems, claimed, stats)


def unjoined_registry(manifests):
    """_unjoined_bodies is LIBRARY-WIDE: exactly one manifest may declare it."""
    decls = [(mp, m["_unjoined_bodies"]) for mp, m, _ in manifests if m.get("_unjoined_bodies")]
    if not decls:
        return {}, ["no manifest declares '_unjoined_bodies' (the library-wide unjoined registry)"]
    if len(decls) > 1:
        return {}, [f"'_unjoined_bodies' declared by {len(decls)} manifests "
                    f"({', '.join(os.path.basename(mp) for mp, _ in decls)}) — it is library-wide, "
                    f"exactly one must declare it"]
    doc = decls[0][1]
    if "entries" in doc:
        return {k: v for k, v in doc["entries"].items() if not k.startswith("_")}, []
    # legacy shape: expected / NOT_EXPECTED maps of key -> reason string
    out = {}
    for grp in ("expected", "NOT_EXPECTED"):
        for k, v in (doc.get(grp) or {}).items():
            if not k.startswith("_"):
                out[k] = {"kind": "permanent" if grp == "expected" else "pending", "reason": v}
    return out, []


def run(manifest_paths):
    inv = seed_inventory()
    reachable = inv[3]
    manifests = []
    for mp in manifest_paths:
        m = json.load(open(mp))
        manifests.append((mp, m, find_template(m)))

    all_problems, claimed, all_stats = [], set(), []
    for mp, m, tpl in manifests:
        probs, cl, st = check_manifest(m, mp, tpl, inv)
        all_problems += probs
        claimed |= cl
        if st: all_stats.append(st)

    # ---- (4) REVERSE COVERAGE — ONCE, ACROSS THE UNION OF ALL SKELETONS ------------------------
    # Every loaded, position-reachable body must be CLAIMED by some paragraph in SOME skeleton.
    # Per-manifest this would be nonsense: every addendum body would read as unclaimed by the letter
    # and vice versa. Reverse coverage is a library-wide question, so it is asked library-wide.
    # Rule 2 only proves a listed body EXISTS; a shorter `bodies` array still resolves. This is the
    # direction that catches a dropped fragment or a body re-pointed to a sibling.
    # Neither rule catches a PERMUTATION: swapping two bodies of one clause between two paragraphs
    # leaves every reference resolving and every body claimed. Only reading body_text settles that.
    allowed, reg_problems = unjoined_registry(manifests)
    all_problems += reg_problems
    pending = []
    if claimed:
        def short(t): ck, bc, sk = t; return f"{ck}/{sk}"
        def long(t):  ck, bc, sk = t; return f"{ck}/{sk}" if not bc else f"{ck}/{bc}/{sk}"
        for t in sorted(reachable, key=long):
            if t in claimed: continue
            if short(t) not in allowed and long(t) not in allowed:
                all_problems.append(f"loaded body {long(t)} is claimed by NO paragraph in any "
                                    f"skeleton (add it, or list it under _unjoined_bodies)")
        claimed_short = {f"{ck}/{sk}" for (ck, bc, sk) in claimed if ck}
        for a, meta in sorted(allowed.items()):
            if a in claimed_short:
                all_problems.append(f"_unjoined_bodies lists {a} but a paragraph now claims it — stale entry")
            elif (meta or {}).get("kind") == "pending":
                pending.append((a, meta))

    # ---- report --------------------------------------------------------------------------------
    for st in all_stats:
        flag = " [PROVISIONAL]" if st["provisional"] else ""
        print(f"\n=== skeleton: {st['name']}{flag} | paragraphs: {st['n']} | assignments: {st['assignments']}")
        print(f"    transition check: {st['docx_note']}")
        print(f"    categories: {st['hist']}")
        content = st["hist"].get("primary", 0) + st["hist"].get("addon", 0)
        print(f"    content paragraphs: {content} — covered: {content - len(st['deferred'])}, "
              f"deferred: {len(st['deferred'])}")
        if st["n_body_refs"]:
            print(f"    exact-body rule: {st['n_body_refs']} references across {st['with_bodies']} "
                  f"paragraphs ({st['body_resolved']}/{len(st['per_body'])} content paragraphs body-resolved)")
        for i, cat, ck in st["deferred"]:
            print(f"    DEFERRED para {i}: {cat} on deferred clause {ck!r}")

    # Two computed_table paragraph runs gated on the SAME selector value would both emit.
    for mp, m, _ in manifests:
        seen = {}
        for k, e in (m.get("assignments") or {}).items():
            if e.get("category") != "computed_table":
                continue
            g = e.get("gated_by") or {}
            key = (g.get("selector_field"), g.get("selector_value"))
            if key[0] and e.get("table"):
                seen.setdefault(key, set()).add(e["table"])
        for key, tables in seen.items():
            if len(tables) > 1:
                all_problems.append(f"computed_table: {key[0]}={key[1]} gates more than one table "
                                    f"({', '.join(sorted(tables))}) — exactly one may emit")

    print(f"\nreverse coverage (all skeletons): {len(reachable & claimed)}/{len(reachable)} loaded "
          f"bodies claimed; {len(allowed)} documented as unjoined")
    if pending:
        # Printed EVERY run so a pending entry cannot rot unnoticed — the deferred half of the
        # stale-allowlist risk rule 4 exists to catch.
        print("    PENDING unjoined entries (expected to leave this list — check they still apply):")
        for a, meta in pending:
            since = f" since {meta['since']}" if meta.get("since") else ""
            print(f"      - {a}{since} — awaiting {meta.get('awaiting','(unstated)')}")

    if all_problems:
        print(f"\nCOMPLETENESS FAILED — {len(all_problems)} problem(s):")
        for pr in all_problems[:80]:
            print("  -", pr)
        if len(all_problems) > 80:
            print(f"  … and {len(all_problems)-80} more")
        sys.exit(1)
    print("\nCOMPLETENESS PASSED — every paragraph of every skeleton assigned; every primary/addon "
          "maps to a loaded canonical body (or a tracked deferred clause); every declared body "
          "reference resolves to an exact loaded body; every loaded body is claimed or documented.")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:]]
    if args and args[0] == "--draft":
        print(json.dumps(draft(args[1]), indent=2)); sys.exit(0)
    mans = [a for a in args if a.lower().endswith(".json")]
    if not mans:
        print("usage: completeness_test.py <manifest.json> [more-manifests.json ...]   |   "
              "--draft <template.docx>"); sys.exit(2)
    run(mans)
