-- Starbucks LOI Tool — ETR omission is STARBUCKS-DIRECTED, not an Oculus deviation
-- Created: September 6, 2026
-- Branch: feature/starbucks-loi-tool
-- Depends on: 20260906140000_loi_tool_register_rent_deferred.sql
--
-- Mike confirmed the attribution (2026-09-06): STARBUCKS directed the "Intentionally Deleted" ETR
-- position. It is not an Oculus-initiated deviation.
--
-- WHY THIS MATTERS, and why it is a data fix rather than a note: the handbook REQUIRES an ETR as exit
-- strategy (2), and omitting one nominally needs director + store development VP + RECOMM. Who
-- directed the omission decides whether that approval chain is live per deal or already answered. It
-- is answered — Starbucks directed it — so it is logged ONCE as a standing acknowledged deviation and
-- never re-raised per deal. The position already carries firing_mode = 'standing-acknowledged', which
-- encodes the "once, not per deal" half correctly. What was wrong is the ATTRIBUTION:
-- authority = 'self-authored' says Oculus originated it, which is exactly the claim Mike corrected.
--
-- NEW AUTHORITY VALUE: 'starbucks-field-direction'. The existing enum could not express this. The
-- position is Starbucks-sanctioned, so 'self-authored' is wrong; but the handbook says the OPPOSITE of
-- what this position does, so 'national-handbook' would be worse than wrong in an audit record — it
-- would cite as sanction the very document being deviated from. Field direction from Starbucks store
-- development is a real, distinct governance source, and this is the first standing acknowledged
-- deviation, whose entire point is that it diverges from the handbook while being Starbucks-directed.
--
-- approval_authority stays 'national-handbook': the director/VP/RECOMM chain IS handbook-defined.
-- That chain is answered, not absent — the distinction the audit record has to preserve.

ALTER TABLE loi_position DROP CONSTRAINT IF EXISTS loi_position_authority_check;
ALTER TABLE loi_position ADD CONSTRAINT loi_position_authority_check
  CHECK (authority IN ('national-handbook','southeast-regional','self-authored','starbucks-field-direction'));

ALTER TABLE loi_position DROP CONSTRAINT IF EXISTS loi_position_approval_authority_check;
ALTER TABLE loi_position ADD CONSTRAINT loi_position_approval_authority_check
  CHECK (approval_authority IN ('national-handbook','southeast-regional','self-authored','starbucks-field-direction'));

ALTER TABLE loi_director_question DROP CONSTRAINT IF EXISTS loi_director_question_authority_check;
ALTER TABLE loi_director_question ADD CONSTRAINT loi_director_question_authority_check
  CHECK (authority IS NULL OR authority IN ('national-handbook','southeast-regional','self-authored','starbucks-field-direction'));

ALTER TABLE loi_approval_label DROP CONSTRAINT IF EXISTS loi_approval_label_authority_check;
ALTER TABLE loi_approval_label ADD CONSTRAINT loi_approval_label_authority_check
  CHECK (authority IN ('national-handbook','southeast-regional','self-authored','starbucks-field-direction'));

COMMENT ON COLUMN loi_position.authority IS
  'Who sanctions this position. starbucks-field-direction = Starbucks store development directed it, distinct from the handbook (and may contradict it, as the ETR omission does).';

-- Re-attribute the ETR "Intentionally Deleted" position.
UPDATE loi_position p
   SET authority = 'starbucks-field-direction',
       deviation_rationale =
         'STARBUCKS DIRECTED this omission - it is not an Oculus-initiated deviation. The handbook '
         'requires an ETR as exit strategy (2), and omitting one nominally needs director + store '
         'development VP + RECOMM. Because Starbucks directed it, that approval chain is ANSWERED, '
         'not live: logged once as a standing acknowledged deviation and never re-raised per deal.'
  FROM loi_variant v, loi_clause c, loi_position_body pb, loi_canonical_body cb
 WHERE p.variant_id = v.id AND v.clause_id = c.id
   AND pb.position_id = p.id AND cb.id = pb.canonical_body_id
   AND c.clause_key = 'early_termination' AND cb.segment_key = 'placeholder'
   AND p.authority = 'self-authored';

-- Guard: the standing ETR position must be Starbucks-attributed, acknowledged once, and still carry
-- the handbook-defined approval chain as ANSWERED (approval_required stays true; firing_mode is what
-- says "not per deal"). A silent miss here would put the approval chain back in the per-deal path.
DO $$
DECLARE r RECORD;
BEGIN
  SELECT p.authority, p.firing_mode, p.approval_required, p.approval_authority INTO r
    FROM loi_position p
    JOIN loi_variant v ON v.id = p.variant_id
    JOIN loi_clause  c ON c.id = v.clause_id
    JOIN loi_position_body pb ON pb.position_id = p.id
    JOIN loi_canonical_body cb ON cb.id = pb.canonical_body_id
   WHERE c.clause_key = 'early_termination' AND cb.segment_key = 'placeholder';

  IF r.authority <> 'starbucks-field-direction' THEN
    RAISE EXCEPTION 'ETR placeholder authority is %, expected starbucks-field-direction', r.authority;
  END IF;
  IF r.firing_mode <> 'standing-acknowledged' THEN
    RAISE EXCEPTION 'ETR placeholder firing_mode is %, expected standing-acknowledged', r.firing_mode;
  END IF;
  IF NOT r.approval_required OR r.approval_authority <> 'national-handbook' THEN
    RAISE EXCEPTION 'ETR placeholder must keep the handbook approval chain recorded as answered (got required=%, authority=%)',
                    r.approval_required, r.approval_authority;
  END IF;
END $$;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
