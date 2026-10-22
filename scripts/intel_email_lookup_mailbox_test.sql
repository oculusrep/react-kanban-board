-- Rolled-back mailbox isolation test for Intel "Look up in my email".
-- Run from the repo root (it \i-s the migration inside its own transaction):
--   set -a && . ./.env && set +a
--   psql "$DATABASE_URL" -f scripts/intel_email_lookup_mailbox_test.sql
-- Everything ends in ROLLBACK. Once the migration is applied for real, the \i
-- re-runs it harmlessly (CREATE OR REPLACE, ON CONFLICT DO NOTHING).

\set ON_ERROR_STOP on
\set QUIET on
\pset footer off
BEGIN;
\i supabase/migrations/20261022090213_intel_email_lookup.sql
\set mike_auth 'fe6e516f-11e1-4a3b-b914-910d59d9e8df'
\set arty_auth '5d126739-bd85-4e90-8f43-9458b162c3cc'
\set va_auth   '20e5f2d4-870e-4cd6-bf9b-6e7c269a2579'
select id as mike_uid from "user" where auth_user_id=:'mike_auth' \gset
select id as arty_uid from "user" where auth_user_id=:'arty_auth' \gset

-- Fixture A: inbound, in ARTY's inbox only, CRM-linked (so plain RLS shows it to
-- Mike), from a sender who never appears in Mike's inbox.
select e.id as a_email, lower(e.sender_email) as a_sender, e.sender_name as a_name
from emails e join email_visibility v on v.email_id=e.id and v.user_id=:'arty_uid'
where e.direction='INBOUND' and e.received_at > now()-interval '12 months'
  and e.sender_email not ilike '%oculusrep.com' and e.sender_name ~ '\S+\s+\S+'
  and not exists (select 1 from email_visibility v2 where v2.email_id=e.id and v2.user_id=:'mike_uid')
  and exists (select 1 from email_object_link l where l.email_id=e.id)
  and lower(e.sender_email) not in (select lower(e2.sender_email) from emails e2 join email_visibility v3 on v3.email_id=e2.id where v3.user_id=:'mike_uid')
order by e.received_at desc limit 1 \gset
-- Fixture B (positive control): a sender with several emails in Mike's inbox.
select lower(e.sender_email) as b_sender
from emails e join email_visibility v on v.email_id=e.id and v.user_id=:'mike_uid'
where e.direction='INBOUND' and e.received_at > now()-interval '12 months' and e.sender_email not ilike '%oculusrep.com'
group by 1 having count(*) >= 5 order by max(e.received_at) desc limit 1 \gset
-- Fixture C: inbound, in MIKE's inbox only, CRM-linked, sender never in Arty's.
select e.id as c_email, lower(e.sender_email) as c_sender
from emails e join email_visibility v on v.email_id=e.id and v.user_id=:'mike_uid'
where e.direction='INBOUND' and e.received_at > now()-interval '12 months' and e.sender_email not ilike '%oculusrep.com'
  and not exists (select 1 from email_visibility v2 where v2.email_id=e.id and v2.user_id=:'arty_uid')
  and exists (select 1 from email_object_link l where l.email_id=e.id)
  and lower(e.sender_email) not in (select lower(e2.sender_email) from emails e2 join email_visibility v3 on v3.email_id=e2.id where v3.user_id=:'arty_uid')
order by e.received_at desc limit 1 \gset
\echo 'Fixture A (Arty-only, CRM-linked): sender' :a_sender ', email' :a_email
\echo 'Fixture B (positive control, Mike inbox): sender' :b_sender
\echo 'Fixture C (Mike-only, CRM-linked): sender' :c_sender ', email' :c_email

CREATE TEMP TABLE results (n serial, persona text, check_name text, expected text, actual text) ON COMMIT DROP;
GRANT ALL ON results TO authenticated; GRANT USAGE ON SEQUENCE results_n_seq TO authenticated;

-- Probe helper: runs a statement as the persona, records the result or the SQLSTATE.
CREATE FUNCTION pg_temp.probe(p_persona text, p_check text, p_expected text, p_sql text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  BEGIN
    EXECUTE p_sql INTO v;
  EXCEPTION WHEN OTHERS THEN
    v := 'ERROR ' || SQLSTATE || ' (' || SQLERRM || ')';
  END;
  INSERT INTO results (persona, check_name, expected, actual) VALUES (p_persona, p_check, p_expected, coalesce(v, 'null'));
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.probe(text,text,text,text) TO authenticated;

-- ---------------- Mike ----------------
SET LOCAL ROLE authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'mike_auth', 'role','authenticated')::text, true) \gset ig_
select pg_temp.probe('mike', 'gate: intel_email_lookup_allowed()', 'true', 'select intel_email_lookup_allowed()::text');
select pg_temp.probe('mike', 'loophole is real: plain SELECT of Arty-only email A', '1', format('select count(*)::text from emails where id = %L', :'a_email'));
select pg_temp.probe('mike', 'emails_from(A sender): rows returned', '0', format('select count(*)::text from intel_mailbox_emails_from(%L, 50, 0)', :'a_sender'));
select pg_temp.probe('mike', 'emails_from(A sender): email A present', '0', format('select count(*)::text from intel_mailbox_emails_from(%L, 50, 0) where id = %L', :'a_sender', :'a_email'));
select pg_temp.probe('mike', 'senders(A name): A sender present', '0', format('select count(*)::text from intel_mailbox_senders(%L) where sender_email = %L', :'a_name', :'a_sender'));
select pg_temp.probe('mike', 'senders(email = A sender): rows', '0', format('select count(*)::text from intel_mailbox_senders(null, %L)', :'a_sender'));
select pg_temp.probe('mike', 'positive control: emails_from(B) returns rows', '>0', format('select count(*)::text from intel_mailbox_emails_from(%L, 50, 0)', :'b_sender'));
select pg_temp.probe('mike', 'positive control: every B row is in Mike''s inbox', '0 outside', format(
  'select count(*)::text || '' outside'' from intel_mailbox_emails_from(%L, 50, 0) f where not exists (select 1 from email_visibility v where v.email_id = f.id and v.user_id = %L)', :'b_sender', :'mike_uid'));
RESET ROLE;

-- ---------------- Arty ----------------
SET LOCAL ROLE authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'arty_auth', 'role','authenticated')::text, true) \gset ig_
select pg_temp.probe('arty', 'is_internal_user()', 'true', 'select is_internal_user()::text');
select pg_temp.probe('arty', 'gate: intel_email_lookup_allowed()', 'false', 'select intel_email_lookup_allowed()::text');
select pg_temp.probe('arty', 'senders(...) refused', 'ERROR 42501', format('select count(*)::text from intel_mailbox_senders(%L)', :'a_name'));
select pg_temp.probe('arty', 'emails_from(...) refused', 'ERROR 42501', format('select count(*)::text from intel_mailbox_emails_from(%L)', :'a_sender'));
select pg_temp.probe('arty', 'internal_contact_points() refused', 'ERROR 42501', 'select count(*)::text from intel_internal_contact_points()');
RESET ROLE;

-- ---------------- VA ----------------
SET LOCAL ROLE authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'va_auth', 'role','authenticated')::text, true) \gset ig_
select pg_temp.probe('va', 'is_internal_user()', 'true', 'select is_internal_user()::text');
select pg_temp.probe('va', 'gate: intel_email_lookup_allowed()', 'false', 'select intel_email_lookup_allowed()::text');
select pg_temp.probe('va', 'senders(...) refused', 'ERROR 42501', format('select count(*)::text from intel_mailbox_senders(%L)', :'a_name'));
select pg_temp.probe('va', 'emails_from(...) refused', 'ERROR 42501', format('select count(*)::text from intel_mailbox_emails_from(%L)', :'b_sender'));
select pg_temp.probe('va', 'internal_contact_points() refused', 'ERROR 42501', 'select count(*)::text from intel_internal_contact_points()');
RESET ROLE;

-- ---------------- Reverse direction: Arty switched ON (inside this txn only) ----------------
UPDATE app_settings SET value = value || to_jsonb(:'arty_uid'::text) WHERE key = 'intel_email_lookup_user_ids';
SET LOCAL ROLE authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'arty_auth', 'role','authenticated')::text, true) \gset ig_
select pg_temp.probe('arty (enabled)', 'gate: intel_email_lookup_allowed()', 'true', 'select intel_email_lookup_allowed()::text');
select pg_temp.probe('arty (enabled)', 'loophole is real: plain SELECT of Mike-only email C', '1', format('select count(*)::text from emails where id = %L', :'c_email'));
select pg_temp.probe('arty (enabled)', 'emails_from(C sender): rows returned', '0', format('select count(*)::text from intel_mailbox_emails_from(%L, 50, 0)', :'c_sender'));
select pg_temp.probe('arty (enabled)', 'own mail still works: emails_from(A sender) has A', '1', format('select count(*)::text from intel_mailbox_emails_from(%L, 50, 0) where id = %L', :'a_sender', :'a_email'));
RESET ROLE;

\pset format aligned
select n, persona, check_name, expected, actual,
  case when expected = actual or (expected = '>0' and actual ~ '^[1-9][0-9]*$')
            or (expected like 'ERROR%' and actual like expected || '%') then 'PASS' else 'FAIL' end as verdict
from results order by n;
ROLLBACK;
