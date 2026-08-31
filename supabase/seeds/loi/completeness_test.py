#!/usr/bin/env python3
"""Template completeness test — every template paragraph must be accounted for.

Mike's rule: assign EVERY paragraph of the template to exactly one category; anything unassigned is
a gap BY CONSTRUCTION. Re-runnable against any future template drop (also part of the
template-transition guard).

Categories (one per paragraph):
  primary_position  — a coded position's body (or a segment of it).      refs: clause_key, brace_code, segment_key
  add_on_modifier   — an add-on modifier body (coded or uncoded).         refs: clause_key, [brace_code], segment_key
  instruction       — bracketed instruction, stripped at assembly.        (no ref)
  letter_shell      — date/addressee/RE/salutation/opening frame.         refs: shell_field
  blocked           — deliberately not in this deal type (e.g. R0/R1/LCW tab schedule, freestanding-only). refs: reason
  empty             — blank paragraph.                                    (auto)

Manifest: JSON list of { "para": <int>, "category": <str>, ...refs }.
The test asserts: (1) every paragraph 0..N-1 assigned exactly once; (2) content assignments
(primary_position / add_on_modifier) reference a brace_code/clause that EXISTS in the seed tranches.
Anything left "unclassified" (or a paragraph with no manifest entry) is reported as a GAP.

Usage:
  python3 completeness_test.py <template.docx> <manifest.json>     # run the test
  python3 completeness_test.py <template.docx> --draft > m.json    # emit a starter manifest to refine
"""
import sys, json, re, glob, os
import docx

CATS = {"primary_position", "add_on_modifier", "instruction", "letter_shell", "blocked", "empty"}
CONTENT = {"primary_position", "add_on_modifier"}
SEED_DIR = os.path.dirname(os.path.abspath(__file__))
CODE_RE = re.compile(r"\[\{([A-Z0-9]+)[^}]*\}\]|\{([A-Z0-9]+)\b")   # [{CODE}] or {CODE ...
INSTR_RE = re.compile(r"^\s*\[[^{].*\]\s*$")                          # a bracketed instruction (not a code)


def seed_inventory():
    """brace codes + clause keys actually extracted into the tranches (the loaded library)."""
    codes, clauses = set(), set()
    for f in glob.glob(os.path.join(SEED_DIR, "loi_seed_tranche*.json")):
        d = json.load(open(f))
        for b in d.get("canonical_bodies", []):
            if b.get("brace_code"): codes.add(b["brace_code"])
        for c in d.get("clauses", []):
            clauses.add(c.get("clause_key"))
    return codes, clauses


def paras(template):
    return [p.text for p in docx.Document(template).paragraphs]


def draft(template):
    """Rough auto-classification to seed a manifest for Mike to refine. Heuristic, not authoritative."""
    out = []
    for i, t in enumerate(paras(template)):
        s = t.strip()
        if not s:
            cat = "empty"
        elif INSTR_RE.match(s):
            cat = "instruction"
        elif CODE_RE.search(t):
            cat = "primary_position"   # carries a code — Mike confirms primary vs add-on
        else:
            cat = "unclassified"       # GAP candidate — Mike must assign
        out.append({"para": i, "category": cat, "text_preview": s[:70]})
    return out


def run(template, manifest_path):
    texts = paras(template)
    n = len(texts)
    manifest = json.load(open(manifest_path))
    codes, clauses = seed_inventory()
    by_para = {}
    problems = []

    for e in manifest:
        p = e.get("para")
        if p in by_para:
            problems.append(f"para {p}: assigned more than once")
        by_para[p] = e

    for i in range(n):
        e = by_para.get(i)
        if e is None:
            problems.append(f"para {i}: NO assignment (gap): {texts[i][:70]!r}")
            continue
        cat = e.get("category")
        if cat not in CATS or cat == "unclassified":
            problems.append(f"para {i}: unclassified/invalid category {cat!r} (gap): {texts[i][:70]!r}")
        elif cat in CONTENT:
            bc = e.get("brace_code")
            ck = e.get("clause_key")
            if ck and ck not in clauses:
                problems.append(f"para {i}: {cat} references clause {ck!r} not in any tranche")
            if bc and bc not in codes:
                problems.append(f"para {i}: {cat} references brace_code {bc!r} not extracted into any tranche")
            if not ck and not bc:
                problems.append(f"para {i}: {cat} has no clause_key/brace_code ref")

    from collections import Counter
    hist = Counter(e.get("category") for e in manifest)
    print(f"template paragraphs: {n} | manifest entries: {len(manifest)}")
    print("category histogram:", dict(hist))
    if problems:
        print(f"\nCOMPLETENESS FAILED — {len(problems)} problem(s):")
        for pr in problems[:80]:
            print("  -", pr)
        if len(problems) > 80:
            print(f"  … and {len(problems)-80} more")
        sys.exit(1)
    print("\nCOMPLETENESS PASSED — every paragraph assigned; all content refs exist in the tranches.")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("usage: completeness_test.py <template.docx> <manifest.json|--draft>"); sys.exit(2)
    if sys.argv[2] == "--draft":
        print(json.dumps(draft(sys.argv[1]), indent=1, ensure_ascii=False))
    else:
        run(sys.argv[1], sys.argv[2])
