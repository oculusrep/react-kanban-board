#!/usr/bin/env python3
"""LOI clause-library seed loader/validator.

Reads a seed JSON (shape = supabase/seeds/loi/_SAMPLE_clause.json), validates it against
the schema's rules, and (with --load) emits ordered INSERT SQL to stdout for psql.

Default is validate-only: prints PASS or a numbered list of problems and exits non-zero on error.
_comment* keys are ignored. Refs (canonical_body_ref, modifies_clause_id, director_question_key,
ref_clause_key) are resolved against the file; unresolved refs are errors.

Usage:
  python3 load_seed.py <seed.json>              # validate only
  python3 load_seed.py <seed.json> --load       # validate, then emit SQL on stdout
"""
import re, sys, json, uuid

SOURCES = {"national-template-drop", "national-handbook", "southeast-doc", "oculus-authored", "national-template-ecdt",
           "completed-loi-powder-springs", "completed-loi-douglasville"}
BUCKETS = {"custom-owned", "coded-position", "standing-default"}
KINDS = {"alternative", "conditional_alternative", "modifier"}
CODE_STATUS = {"confirmed", "provisional"}
RULE_STATUS = {"confirmed", "provisional-pending-director"}
AUTHORITY = {"national-handbook", "southeast-regional", "self-authored"}
FIRING = {"per-deal", "standing-acknowledged", "on-deviation"}
PARAM_KINDS = {"concession", "choose_one", "fill", "landlord_fill"}
REF_KINDS = {"deal_field", "clause_selection", "clause_field", "position_selection"}
OPERATORS = {"eq","neq","lt","lte","gt","gte","within_days_of","is_selected","not_selected","exists","not_exists"}
PARAM_TOKEN = re.compile(r"\{\{param:[^}]+\}\}")   # valid token; removed before scanning for strays
TOKEN_KEY = re.compile(r"\{\{param:([^}]+)\}\}")   # capture the key for token<->param cross-validation
TOKEN_ANY = re.compile(r"\{\{param:[a-zA-Z0-9_]+\}\}")   # whole token, for the standing scans

def stray_braces(bt):
    return re.findall(r"\{[^{}]*\}", PARAM_TOKEN.sub("", bt))  # any {...} left after valid tokens = stray code/marker

def strip_comments(o):
    if isinstance(o, dict):
        return {k: strip_comments(v) for k, v in o.items() if not k.startswith("_comment")}
    if isinstance(o, list):
        return [strip_comments(x) for x in o]
    return o

def validate(d):
    errs = []
    warns = []
    def E(msg): errs.append(msg)
    def W(msg): warns.append(msg)

    selectors = {s["selector_field"]: s for s in d.get("selectors", [])}
    bodies = {}
    for b in d.get("canonical_bodies", []):
        ref = b.get("ref")
        if not ref: E(f"canonical_body missing 'ref': {b.get('brace_code')}"); continue
        if ref in bodies: E(f"duplicate canonical_body ref '{ref}'")
        bodies[ref] = b
        if b.get("source") not in SOURCES: E(f"body {ref}: bad source '{b.get('source')}'")
        if not b.get("segment_key"): E(f"body {ref}: missing segment_key")
        if b.get("_existing"):
            # a body loaded by an EARLIER tranche, re-referenced here; resolved by identity, never
            # re-inserted (canonical bodies are immutable and key on brace_code+source+version).
            if b.get("body_text") or b.get("parameters"):
                E(f"body {ref}: _existing must carry identity only (no body_text/parameters)")
            continue
        bt = b.get("body_text", "")
        for m in stray_braces(bt):
            E(f"body {ref}: stray '{m}' in body_text (only {{{{param:key}}}} tokens allowed; codes/markers must be stripped)")

        # ---- STANDING SCANS (added 2026-09-06, after audit_right turned out to carry BOTH) --------
        # Same class of defect either way: template text that is only correct for the value its
        # author had in mind. Both otherwise surface one deal at a time at the acceptance test.
        outside = TOKEN_ANY.sub("\x00", bt)   # blank out {{param:...}} so token underscores don't hit

        # (1) An underscore run outside a token is a raw template blank nobody keyed. Zero tolerance —
        #     it emits verbatim as an unfilled line. audit_right/main shipped with a literal '__'.
        for m in re.finditer(r"_+", outside):
            ctx = outside[max(0, m.start() - 40):m.end() + 30].replace("\x00", "<TOKEN>")
            E(f"body {ref}: raw underscore blank {m.group(0)!r} outside any token — key it as a param "
              f"(...{ctx}...)")

        # (2) 'a'/'an' immediately before a token is value-dependent grammar: 'a seven percent (7%)'
        #     but 'an eight percent (8%)'. WARNING, not an error — it is legitimate when the value
        #     domain is closed and every member starts with the same sound. Check, then keep or key
        #     the article as its own choose_one, as audit_right now does.
        for m in re.finditer(r"\b(an?)\s+\x00", outside, re.I):
            ctx = outside[max(0, m.start() - 40):m.end() + 20].replace("\x00", "<TOKEN>")
            W(f"body {ref}: article {m.group(1)!r} immediately precedes a token — value-dependent "
              f"unless every possible value starts with the same sound (...{ctx}...)")
        # token <-> param cross-validation (both directions)
        tokens = set(TOKEN_KEY.findall(bt))
        pkeys = {p.get("param_key") for p in b.get("parameters", []) or [] if p.get("param_key")}
        for t in tokens - pkeys:
            E(f"body {ref}: token {{{{param:{t}}}}} has NO declared param (would emit raw into the document)")
        for pk in pkeys - tokens:
            E(f"body {ref}: param '{pk}' declared but NO {{{{param:{pk}}}}} token in body_text (orphaned)")
        for p in b.get("parameters", []) or []:
            pk = p.get("param_kind")
            if pk not in PARAM_KINDS: E(f"body {ref} param: bad param_kind '{pk}'")
            if not p.get("param_key"): E(f"body {ref} param: missing param_key")
            if pk == "concession":
                if not p.get("preferred_value"): E(f"body {ref} param {p.get('param_key')}: concession needs preferred_value")
                if p.get("options"): E(f"body {ref} param {p.get('param_key')}: concession must not carry options")
            elif pk == "choose_one":
                if p.get("preferred_value") or p.get("fallback_value"):
                    E(f"body {ref} param {p.get('param_key')}: choose_one must not have preferred/fallback")
                opts = p.get("options") or []
                if len(opts) < 2: E(f"body {ref} param {p.get('param_key')}: choose_one needs >=2 options")
                if sum(1 for o in opts if o.get("is_omit")) > 1: E(f"body {ref} param {p.get('param_key')}: >1 omit option")
                for o in opts:
                    if o.get("is_omit"):
                        if o.get("option_value"): E(f"body {ref} param {p.get('param_key')}: omit option must not carry option_value")
                    elif not o.get("option_value"): E(f"body {ref} param {p.get('param_key')}: option missing option_value (use is_omit for an intentional 'emit nothing')")
            elif pk == "fill":
                if p.get("preferred_value") or p.get("fallback_value"):
                    E(f"body {ref} param {p.get('param_key')}: fill must not have preferred/fallback")
                if p.get("options"): E(f"body {ref} param {p.get('param_key')}: fill must not carry options")
                if p.get("landlord_fill_render"):
                    E(f"body {ref} param {p.get('param_key')}: only landlord_fill carries landlord_fill_render")
            elif pk == "landlord_fill":
                # The landlord completes this by hand after we send. Nobody on our side supplies a
                # value, so it emits the template's blank rule and still counts as RESOLVED.
                if p.get("preferred_value") or p.get("fallback_value"):
                    E(f"body {ref} param {p.get('param_key')}: landlord_fill must not have preferred/fallback")
                if p.get("options"): E(f"body {ref} param {p.get('param_key')}: landlord_fill must not carry options")
                if not p.get("landlord_fill_render"):
                    E(f"body {ref} param {p.get('param_key')}: landlord_fill needs landlord_fill_render (the exact blank rule; an empty one is indistinguishable from a bug)")

    dqs = {q["question_key"] for q in d.get("director_questions", [])}

    # merge tranches (_topup / _resource) overlay already-loaded clauses; refs may point to loaded
    # data not present in this file, so cross-ref failures are warnings, not errors, when present.
    has_merge = any(c.get("_topup") or c.get("_resource") for c in d.get("clauses", []))
    def REF(msg):  # ref-resolution problem: error on a standalone tranche, warning on a merge overlay
        (warns.append(msg) if has_merge else errs.append(msg))

    clause_keys = set()
    brace_by_clause = {}   # clause_key -> {brace codes across its positions} (for position_selection resolution)
    for c in d.get("clauses", []):
        if c.get("_blocked"): continue
        ck = c.get("clause_key")
        if not ck: E("clause missing clause_key"); continue
        if ck in clause_keys: E(f"duplicate clause_key '{ck}'")
        clause_keys.add(ck)
        if not (c.get("_topup") or c.get("_resource")):
            if c.get("bucket") not in BUCKETS: E(f"clause {ck}: bad bucket '{c.get('bucket')}'")
        bset = set()
        for v in c.get("variants", []):
            for p in v.get("positions", []):
                if p.get("brace_code"): bset.add(p["brace_code"])
        brace_by_clause[ck] = bset

    if not selectors:
        # Explicit: a tranche with no selectors must have all-null selector_field (checked per variant below).
        W("no selectors declared — every variant must have selector_field null; conditional_alternative positions will error")

    for c in d.get("clauses", []):
        if c.get("_blocked"): continue
        ck = c.get("clause_key")
        bucket = c.get("bucket")
        for v in c.get("variants", []):
            vk = v.get("variant_key")
            sf = v.get("selector_field")
            sv = v.get("selector_version")
            if sf is not None:
                if sf not in selectors: E(f"{ck}/{vk}: selector_field '{sf}' has no selector defined in this seed")
                if sv is None: E(f"{ck}/{vk}: selector_field set but selector_version null")
            cond_vals = []
            brace_in_variant = {}
            rank_in_variant = {}
            for p in v.get("positions", []):
                kind = p.get("position_kind")
                bc = p.get("brace_code")
                loc = f"{ck}/{vk}/{bc or kind}"
                if kind not in KINDS: E(f"{loc}: bad position_kind '{kind}'")
                if p.get("authority") not in AUTHORITY: E(f"{loc}: bad authority '{p.get('authority')}'")
                if p.get("code_status") not in CODE_STATUS: E(f"{loc}: bad code_status")
                if p.get("rule_status") not in RULE_STATUS: E(f"{loc}: bad rule_status")
                if p.get("firing_mode") not in FIRING: E(f"{loc}: bad firing_mode")
                # kind shape
                if kind == "alternative":
                    if p.get("rank") is None: E(f"{loc}: alternative needs rank")
                    if p.get("selector_value") is not None: E(f"{loc}: alternative must not have selector_value")
                    if p.get("modifies_clause_id"): E(f"{loc}: alternative must not have modifies_clause_id")
                elif kind == "conditional_alternative":
                    if p.get("rank") is not None: E(f"{loc}: conditional_alternative must not have rank")
                    if not p.get("selector_value"): E(f"{loc}: conditional_alternative needs selector_value")
                    if sf is None: E(f"{loc}: conditional_alternative but variant has no selector_field")
                    else: cond_vals.append(p.get("selector_value"))
                elif kind == "modifier":
                    if not p.get("modifies_clause_id"): E(f"{loc}: modifier needs modifies_clause_id")
                    if p.get("emit_order") is None: E(f"{loc}: modifier needs emit_order")
                    if p.get("rank") is not None: E(f"{loc}: modifier must not have rank")
                # brace guard
                if bucket == "custom-owned":
                    if bc is not None: E(f"{loc}: custom-owned must not carry brace_code")
                elif bucket == "coded-position" and kind in ("alternative","conditional_alternative"):
                    if bc is None: E(f"{loc}: coded ladder/partition position needs brace_code")
                if kind == "modifier" and bc is None:
                    seg = [bodies.get(pb.get("canonical_body_ref"), {}).get("segment_key") for pb in p.get("position_bodies", [])]
                    if "main" in seg: W(f"{loc}: uncoded modifier uses segment_key 'main' (use a descriptive segment for audit identity)")
                # brace/rank uniqueness within variant
                if bc is not None:
                    brace_in_variant[bc] = brace_in_variant.get(bc, 0) + 1
                if kind == "alternative" and p.get("emit_order") is not None:
                    E(f"{loc}: alternative must not have emit_order")
                if kind == "alternative" and p.get("rank") is not None:
                    rank_in_variant[p["rank"]] = rank_in_variant.get(p["rank"], 0) + 1
                # refs
                mc = p.get("modifies_clause_id")
                if mc and mc not in clause_keys: REF(f"{loc}: modifies_clause_id '{mc}' not a clause in this seed")
                dq = p.get("director_question_key")
                if dq and dq not in dqs: E(f"{loc}: director_question_key '{dq}' not defined")
                for at in p.get("attachment_requirements", []) or []:
                    if not at.get("requirement"): E(f"{loc}: attachment_requirement missing 'requirement'")
                for pb in p.get("position_bodies", []):
                    r = pb.get("canonical_body_ref")
                    if r not in bodies: REF(f"{loc}: position_bodies ref '{r}' not a declared canonical_body")
                for aw in p.get("applies_when", []):
                    rk = aw.get("ref_kind")
                    if rk not in REF_KINDS: E(f"{loc}: applies_when bad ref_kind '{rk}'")
                    if aw.get("operator") not in OPERATORS: E(f"{loc}: applies_when bad operator '{aw.get('operator')}'")
                    rck = aw.get("ref_clause_key")
                    if rk == "deal_field":
                        if rck or not aw.get("ref_field"): E(f"{loc}: deal_field needs ref_field, no ref_clause_key")
                    elif rk in ("clause_selection","clause_field","position_selection"):
                        if not rck: E(f"{loc}: {rk} needs ref_clause_key")
                        elif rck not in clause_keys: REF(f"{loc}: applies_when ref_clause_key '{rck}' not a clause in this seed")
                        if rk == "position_selection":
                            rbc = aw.get("ref_brace_code")
                            if not rbc:
                                E(f"{loc}: position_selection needs ref_brace_code")
                            elif rck in clause_keys and rbc not in brace_by_clause.get(rck, set()):
                                REF(f"{loc}: position_selection ref_brace_code '{rbc}' not found in clause '{rck}'")
                        if rk == "clause_field" and not aw.get("ref_field"): E(f"{loc}: clause_field needs ref_field")
            for bc, n in brace_in_variant.items():
                if n > 1: E(f"{ck}/{vk}: brace_code '{bc}' used {n}x in one variant")
            for rk, n in rank_in_variant.items():
                if n > 1: E(f"{ck}/{vk}: rank {rk} used {n}x among alternatives")
            # exhaustive partition — against the variant's declared subdomain if present, else full domain
            if sf is not None and cond_vals:
                domain = {dv["value"] for dv in selectors[sf]["domain"] if dv.get("version") == sv}
                used = set(cond_vals)
                sub = v.get("selector_subdomain")
                if sub is not None:
                    outside = set(sub) - domain
                    if outside: E(f"{ck}/{vk}: selector_subdomain value(s) outside domain: {outside}")
                    effective = set(sub)
                else:
                    effective = domain
                if len(cond_vals) != len(used): E(f"{ck}/{vk}: duplicate selector_value in partition")
                if used - effective: E(f"{ck}/{vk}: selector_value(s) outside {'subdomain' if sub else 'domain'}: {used - effective}")
                if effective - used: E(f"{ck}/{vk}: partition not exhaustive vs {'subdomain' if sub else 'domain'}; missing {effective - used}")
    return errs, warns

def main():
    if len(sys.argv) < 2:
        print("usage: load_seed.py <seed.json> [--load]"); sys.exit(2)
    d = strip_comments(json.load(open(sys.argv[1])))
    errs, warns = validate(d)
    for w in warns: print(f"WARN: {w}", file=sys.stderr)
    if errs:
        print(f"VALIDATION FAILED — {len(errs)} error(s):", file=sys.stderr)
        for i, e in enumerate(errs, 1): print(f"  {i}. {e}", file=sys.stderr)
        sys.exit(1)
    print(f"VALIDATION PASSED ({len(d.get('clauses',[]))} clauses, {len(d.get('canonical_bodies',[]))} bodies, {len(warns)} warning(s))", file=sys.stderr)
    if "--load" not in sys.argv:
        sys.exit(0)
    print(emit_sql(d))

def q(s):
    if s is None: return "NULL"
    if isinstance(s, bool): return "true" if s else "false"
    if isinstance(s, (int, float)): return str(s)
    return "'" + str(s).replace("'", "''") + "'"

def emit_sql(d):
    out = ["BEGIN;"]
    body_id = {}
    body_expr = {}   # ref -> SQL expression yielding the body id (literal for new, subselect for _existing)
    for b in d.get("canonical_bodies", []):
        if b.get("_existing"):
            # Resolve an already-loaded body by its immutable identity (brace_code, source, version)
            # plus segment_key. NOT re-inserted.
            bc = b.get("brace_code")
            body_expr[b["ref"]] = ("(SELECT id FROM loi_canonical_body WHERE "
                                   + (f"brace_code={q(bc)}" if bc else "brace_code IS NULL")
                                   + f" AND source={q(b['source'])} AND version={q(b.get('version','v1'))}"
                                   + f" AND segment_key={q(b['segment_key'])})")
            continue
        bid = str(uuid.uuid4()); body_id[b["ref"]] = bid; body_expr[b["ref"]] = q(bid)
        out.append(f"INSERT INTO loi_canonical_body (id,brace_code,source,version,segment_key,body_text) VALUES "
                   f"({q(bid)},{q(b.get('brace_code'))},{q(b['source'])},{q(b.get('version','v1'))},{q(b['segment_key'])},{q(b['body_text'])});")
        for p in b.get("parameters", []) or []:
            pid = str(uuid.uuid4())
            out.append(f"INSERT INTO loi_body_parameter (id,canonical_body_id,param_kind,param_key,preferred_value,fallback_value,value_unit,code_status,note,landlord_fill_render) VALUES "
                       f"({q(pid)},{q(bid)},{q(p['param_kind'])},{q(p['param_key'])},{q(p.get('preferred_value'))},{q(p.get('fallback_value'))},{q(p.get('value_unit'))},{q(p.get('code_status','confirmed'))},{q(p.get('note'))},{q(p.get('landlord_fill_render'))});")
            for i, o in enumerate(p.get("options", []) or []):
                out.append(f"INSERT INTO loi_body_parameter_option (body_parameter_id,option_value,is_free_fill,is_omit,sort_order) VALUES "
                           f"({q(pid)},{q(o.get('option_value'))},{q(o.get('is_free_fill',False))},{q(o.get('is_omit',False))},{q(o.get('sort_order',i))});")
    for s in d.get("selectors", []):
        out.append(f"INSERT INTO loi_selector (selector_field,current_version,note) VALUES ({q(s['selector_field'])},{q(s.get('current_version',1))},{q(s.get('note'))}) ON CONFLICT (selector_field) DO NOTHING;")
        for dv in s.get("domain", []):
            out.append(f"INSERT INTO loi_selector_domain (selector_field,version,value,description) VALUES ({q(s['selector_field'])},{q(dv.get('version',1))},{q(dv['value'])},{q(dv.get('description'))}) ON CONFLICT DO NOTHING;")
    for qd in d.get("director_questions", []):
        out.append(f"INSERT INTO loi_director_question (question_key,question_text,status,date_asked,date_answered,answer_text,authority) VALUES "
                   f"({q(qd['question_key'])},{q(qd['question_text'])},{q(qd.get('status','open'))},{q(qd.get('date_asked'))},{q(qd.get('date_answered'))},{q(qd.get('answer_text'))},{q(qd.get('authority'))});")
    for c in d.get("clauses", []):
        if c.get("_blocked"): continue   # deferred (base clause blocked, e.g. LCW)
        if c.get("_topup") or c.get("_resource"):
            continue   # merge into an already-loaded clause; do not recreate it
        cid = str(uuid.uuid4())
        out.append(f"INSERT INTO loi_clause (id,clause_key,title,bucket,description,guidance_note) VALUES "
                   f"({q(cid)},{q(c['clause_key'])},{q(c.get('title'))},{q(c['bucket'])},{q(c.get('description'))},{q(c.get('guidance_note'))});")
    # second pass so modifies_clause_id / applies_when refs can resolve to clause ids by key
    out.append("SET CONSTRAINTS ALL DEFERRED;")
    for c in d.get("clauses", []):
        if c.get("_blocked"): continue
        merge = bool(c.get("_topup") or c.get("_resource"))
        for v in c.get("variants", []):
            if merge:
                # resolve the EXISTING variant (variant_key matches); add positions to it
                vid_expr = (f"(SELECT v.id FROM loi_variant v JOIN loi_clause c ON c.id=v.clause_id "
                            f"WHERE c.clause_key={q(c['clause_key'])} AND v.variant_key={q(v['variant_key'])})")
            else:
                vid = str(uuid.uuid4()); vid_expr = q(vid)
                dts = "ARRAY[" + ",".join(q(x) for x in v.get("deal_type_scope", ["end-cap-drive-thru"])) + "]::text[]"
                out.append(f"INSERT INTO loi_variant (id,clause_id,variant_key,deal_type_scope,selector_field,selector_version,replaces_base) VALUES "
                           f"({q(vid)},(SELECT id FROM loi_clause WHERE clause_key={q(c['clause_key'])}),{q(v['variant_key'])},{dts},{q(v.get('selector_field'))},{q(v.get('selector_version'))},{q(v.get('replaces_base',False))});")
                for sval in v.get("selector_subdomain", []) or []:
                    out.append(f"INSERT INTO loi_variant_selector_value (variant_id,value) VALUES ({q(vid)},{q(sval)});")
            for p in v.get("positions", []):
                pid = str(uuid.uuid4())
                mc = f"(SELECT id FROM loi_clause WHERE clause_key={q(p['modifies_clause_id'])})" if p.get("modifies_clause_id") else "NULL"
                dq = f"(SELECT id FROM loi_director_question WHERE question_key={q(p['director_question_key'])})" if p.get("director_question_key") else "NULL"
                out.append("INSERT INTO loi_position (id,variant_id,position_kind,brace_code,rank,emit_order,template_paragraph,modifies_clause_id,selector_value,is_default,"
                           "code_status,rule_status,authority,approval_required,approval_authority,firing_mode,director_question_id,"
                           "internal_note,deviation_rationale,landlord_fill_prompt,provisional_note) VALUES ("
                           f"{q(pid)},{vid_expr},{q(p['position_kind'])},{q(p.get('brace_code'))},{q(p.get('rank'))},{q(p.get('emit_order'))},{q(p.get('template_paragraph'))},{mc},{q(p.get('selector_value'))},{q(p.get('is_default',False))},"
                           f"{q(p.get('code_status','confirmed'))},{q(p.get('rule_status','confirmed'))},{q(p['authority'])},{q(p.get('approval_required',False))},{q(p.get('approval_authority'))},{q(p.get('firing_mode','per-deal'))},{dq},"
                           f"{q(p.get('internal_note'))},{q(p.get('deviation_rationale'))},{q(p.get('landlord_fill_prompt'))},{q(p.get('provisional_note'))});")
                for pb in p.get("position_bodies", []):
                    out.append(f"INSERT INTO loi_position_body (position_id,canonical_body_id,emit_sequence) VALUES ({q(pid)},{body_expr[pb['canonical_body_ref']]},{q(pb.get('emit_sequence',0))});")
                for aw in p.get("applies_when", []):
                    out.append("INSERT INTO loi_applies_when_condition (position_id,condition_group,ref_kind,ref_clause_key,ref_brace_code,ref_field,operator,compare_value,compare_unit,note) VALUES ("
                               f"{q(pid)},{q(aw.get('condition_group',0))},{q(aw['ref_kind'])},{q(aw.get('ref_clause_key'))},{q(aw.get('ref_brace_code'))},{q(aw.get('ref_field'))},{q(aw['operator'])},{q(aw.get('compare_value'))},{q(aw.get('compare_unit'))},{q(aw.get('note'))});")
                for i, at in enumerate(p.get("attachment_requirements", []) or []):
                    out.append("INSERT INTO loi_attachment_requirement (position_id,requirement,exhibit_ref,note,sort_order) VALUES ("
                               f"{q(pid)},{q(at['requirement'])},{q(at.get('exhibit_ref'))},{q(at.get('note'))},{q(at.get('sort_order',i))});")
    out.append("COMMIT;")
    return "\n".join(out)

if __name__ == "__main__":
    main()
